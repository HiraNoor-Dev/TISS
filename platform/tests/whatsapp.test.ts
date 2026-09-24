import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as s from '../src/db/schema';
import type { Database } from '../src/db/types';
import { classroomService } from '../src/server/classroom';
import { applyWhatsAppWebhook, processOneWhatsAppRecipient, verifyWhatsAppSignature, WhatsAppProviderError, whatsappService, type WhatsAppConfig } from '../src/server/whatsapp';

const config: WhatsAppConfig = {
  enabled: true, graphVersion: 'v99.0', phoneNumberId: '123456789', accessToken: 'synthetic-access-token-long-enough',
  initialTemplate: 'school_test_result', correctionTemplate: 'school_corrected_test_result', templateLanguage: 'en',
  verifyToken: 'synthetic-verify-token', appSecret: 'synthetic-app-secret',
};

test('WhatsApp results require consent and teacher confirmation, preserve snapshots, and track delivery', async () => {
  const engine = new PGlite(); const testDb = drizzle(engine, { schema: s }); const db = testDb as unknown as Database;
  try {
    await migrate(testDb, { migrationsFolder: './drizzle' });
    const passwordHash = await bcrypt.hash('synthetic-whatsapp-password', 4);
    const [teacher, colleague] = await db.insert(s.users).values([
      { username: 'result-teacher', fullName: 'Result Teacher', role: 'teacher', passwordHash, mustChangePassword: false },
      { username: 'other-teacher', fullName: 'Other Teacher', role: 'teacher', passwordHash, mustChangePassword: false },
    ]).returning();
    await db.insert(s.teachers).values([{ userId: teacher.id }, { userId: colleague.id }]);
    const [year] = await db.insert(s.academicYears).values({ name: '2026', startsOn: '2026-01-01', endsOn: '2026-12-31', isCurrent: true }).returning();
    const [division] = await db.insert(s.divisions).values({ name: 'Primary' }).returning();
    const [grade] = await db.insert(s.grades).values({ name: 'Grade 1', divisionId: division.id }).returning();
    const [section] = await db.insert(s.sections).values({ name: 'A', gradeId: grade.id }).returning();
    const [cls] = await db.insert(s.academicClasses).values({ academicYearId: year.id, sectionId: section.id }).returning();
    const [subject] = await db.insert(s.subjects).values({ code: 'SCI', name: 'Science' }).returning();
    await db.insert(s.teachingAssignments).values([
      { teacherId: teacher.id, academicClassId: cls.id, subjectId: subject.id },
      { teacherId: colleague.id, academicClassId: cls.id, subjectId: subject.id },
    ]);
    const pupils = await db.insert(s.students).values([
      { portalId: 'WA-001', fullName: 'Student One' }, { portalId: 'WA-002', fullName: 'Student Two' },
    ]).returning();
    await db.insert(s.enrollments).values(pupils.map(student => ({ studentId: student.id, academicClassId: cls.id, startsOn: '2026-01-01' })));
    const guardians = await db.insert(s.guardians).values([
      { fullName: 'Guardian One', phone: '+923001111111', whatsapp: '+923001111111', whatsappOptInAt: new Date() },
      { fullName: 'Guardian Two', phone: '+923002222222', whatsapp: '+923002222222' },
    ]).returning();
    await db.insert(s.studentGuardians).values(pupils.map((student, index) => ({ studentId: student.id, guardianId: guardians[index].id, relationship: 'Guardian', isPrimary: true })));
    const classroom = classroomService(db, () => '2026-09-24');
    const assessment = await classroom.createTest(teacher, cls.id, { id: randomUUID(), subjectId: subject.id, name: 'Chapter test', onDate: '2026-09-23', totalMarks: 20, description: '' });
    await classroom.saveMarks(teacher, cls.id, assessment.id, { version: 0, rows: [
      { studentId: pupils[0].id, status: 'present', marks: 16 }, { studentId: pupils[1].id, status: 'absent', marks: null },
    ] });
    const service = whatsappService(db, config);
    const blocked = await service.preview(teacher, cls.id, assessment.id);
    assert.equal(blocked.sendableCount, 1); assert.equal(blocked.missing[0].reason, 'WhatsApp consent not recorded');
    assert.equal((await db.select().from(s.resultDispatches)).length, 0); // Saving marks never sends automatically.
    await assert.rejects(service.queue(teacher, cls.id, assessment.id, { version: 1 }), { status: 400 });
    await db.update(s.guardians).set({ whatsappOptInAt: new Date() }).where(eq(s.guardians.id, guardians[1].id));
    await assert.rejects(service.queue(colleague, cls.id, assessment.id, { version: 1 }), { status: 403 });

    const initial = await service.queue(teacher, cls.id, assessment.id, { version: 1 });
    assert.equal(initial.kind, 'initial');
    assert.equal((await service.queue(teacher, cls.id, assessment.id, { version: 1 })).id, initial.id); // Double-click safe.
    assert.equal((await db.select().from(s.resultDispatchRecipients)).length, 2);
    let sendNumber = 0;
    await processOneWhatsAppRecipient(db, config, async (_config, payload) => { sendNumber += 1; assert.match(payload.phone, /^\+92300[12]{7}$/); return 'wamid.initial.1'; });
    await processOneWhatsAppRecipient(db, config, async () => { throw new WhatsAppProviderError('131000', 'Synthetic provider rejection'); });
    assert.equal((await service.retryFailed(teacher, cls.id, assessment.id, initial.id)).retried, 1);
    await processOneWhatsAppRecipient(db, config, async () => 'wamid.initial.2');
    assert.equal(sendNumber, 1);

    const webhook = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { statuses: [
      { id: 'wamid.initial.1', status: 'delivered' }, { id: 'wamid.initial.2', status: 'read' },
    ] } }] }] };
    assert.equal(await applyWhatsAppWebhook(db, webhook), 2);
    const delivered = await service.preview(teacher, cls.id, assessment.id);
    assert.equal(delivered.latest?.counts.delivered, 1); assert.equal(delivered.latest?.counts.read, 1);
    const raw = JSON.stringify(webhook); const signature = `sha256=${createHmac('sha256', config.appSecret).update(raw).digest('hex')}`;
    assert.equal(verifyWhatsAppSignature(raw, signature, config.appSecret), true);
    assert.equal(verifyWhatsAppSignature(`${raw} `, signature, config.appSecret), false);

    await assert.rejects(db.update(s.resultDispatchRecipients).set({ marks: 19 }).where(eq(s.resultDispatchRecipients.dispatchId, initial.id)));
    await classroom.saveMarks(teacher, cls.id, assessment.id, { version: 1, rows: [{ studentId: pupils[0].id, status: 'present', marks: 18 }] });
    const correction = await service.queue(teacher, cls.id, assessment.id, { version: 2 });
    assert.equal(correction.kind, 'correction');
    await processOneWhatsAppRecipient(db, config, async () => { throw new Error('Synthetic connection lost after request'); });
    await processOneWhatsAppRecipient(db, config, async () => 'wamid.correction.2');
    const corrected = await service.preview(teacher, cls.id, assessment.id);
    assert.equal(corrected.latest?.counts.uncertain, 1);
    await assert.rejects(service.retryFailed(teacher, cls.id, assessment.id, correction.id), { status: 400 });
    const [acceptedCorrection] = await db.select().from(s.resultDispatchRecipients).where(eq(s.resultDispatchRecipients.providerMessageId, 'wamid.correction.2'));
    await db.update(s.resultDispatchRecipients).set({ status: 'processing', lastAttemptAt: new Date(Date.now() - 10 * 60_000) }).where(eq(s.resultDispatchRecipients.id, acceptedCorrection.id));
    assert.equal(await processOneWhatsAppRecipient(db, config, async () => { throw new Error('A stale attempt must not be sent again.'); }), false);
    const [recovered] = await db.select().from(s.resultDispatchRecipients).where(eq(s.resultDispatchRecipients.id, acceptedCorrection.id));
    assert.equal(recovered.status, 'uncertain'); assert.equal(recovered.errorCode, 'worker_interrupted');
  } finally { await engine.close(); }
});
