import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, lte, or, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/types';
import * as s from '../db/schema';
import type { Principal } from './auth';
import { audit } from './academic-admin';
import { AppError } from './errors';
import { requireClassAccess } from './permissions';
import { uuid } from './validation';

export type WhatsAppConfig = {
  enabled: boolean; graphVersion: string; phoneNumberId: string; accessToken: string;
  initialTemplate: string; correctionTemplate: string; templateLanguage: string;
  verifyToken: string; appSecret: string;
};
export function whatsappConfig(): WhatsAppConfig {
  const enabled = process.env.WHATSAPP_ENABLED === 'true';
  const config = {
    enabled,
    graphVersion: process.env.WHATSAPP_GRAPH_API_VERSION ?? '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
    initialTemplate: process.env.WHATSAPP_RESULT_TEMPLATE ?? '',
    correctionTemplate: process.env.WHATSAPP_CORRECTION_TEMPLATE ?? '',
    templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? '',
    verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? '',
    appSecret: process.env.WHATSAPP_APP_SECRET ?? '',
  };
  if (enabled) z.object({
    graphVersion: z.string().regex(/^v\d+\.\d+$/), phoneNumberId: z.string().regex(/^\d+$/), accessToken: z.string().min(20),
    initialTemplate: z.string().regex(/^[a-z0-9_]+$/), correctionTemplate: z.string().regex(/^[a-z0-9_]+$/),
    templateLanguage: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/), verifyToken: z.string().min(16), appSecret: z.string().min(16),
  }).parse(config);
  return config;
}

type RecipientSnapshot = {
  studentId: string; enrollmentId: string; fullName: string; portalId: string;
  resultId: string | null; resultStatus: typeof s.resultStatus.enumValues[number] | null; marks: number | null;
  guardianId: string | null; guardianName: string | null; whatsapp: string | null; whatsappOptInAt: Date | null;
};

export function whatsappService(db: Database, config: WhatsAppConfig = whatsappConfig()) {
  async function testForTeacher(store: Database, actor: Principal, classId: string, testId: string, lock = false) {
    uuid.parse(classId); uuid.parse(testId);
    if (actor.role !== 'teacher' || actor.mustChangePassword) throw new AppError(403, 'The teacher who created this test is required.');
    const query = store.select({ id: s.assessments.id, academicClassId: s.assessments.academicClassId, subjectId: s.assessments.subjectId, authorId: s.assessments.authorId, name: s.assessments.name, onDate: s.assessments.onDate, totalMarks: s.assessments.totalMarks, version: s.assessments.version, subjectName: s.subjects.name })
      .from(s.assessments).innerJoin(s.subjects, eq(s.subjects.id, s.assessments.subjectId))
      .where(and(eq(s.assessments.id, testId), eq(s.assessments.academicClassId, classId)));
    const [test] = await (lock ? query.for('update') : query);
    if (!test) throw new AppError(404, 'Test not found in this class.');
    if (test.authorId !== actor.id) throw new AppError(403, 'Only the teacher who created this test can publish and send its results.');
    await requireClassAccess(store, actor, classId, 'marks', test.subjectId);
    return test;
  }
  async function snapshots(store: Database, test: Awaited<ReturnType<typeof testForTeacher>>): Promise<RecipientSnapshot[]> {
    return store.select({
      studentId: s.students.id, enrollmentId: s.enrollments.id, fullName: s.students.fullName, portalId: s.students.portalId,
      resultId: s.testResults.id, resultStatus: s.testResults.status, marks: s.testResults.marks,
      guardianId: s.guardians.id, guardianName: s.guardians.fullName, whatsapp: s.guardians.whatsapp, whatsappOptInAt: s.guardians.whatsappOptInAt,
    }).from(s.enrollments).innerJoin(s.students, eq(s.students.id, s.enrollments.studentId))
      .leftJoin(s.testResults, and(eq(s.testResults.assessmentId, test.id), eq(s.testResults.studentId, s.students.id)))
      .leftJoin(s.studentGuardians, and(eq(s.studentGuardians.studentId, s.students.id), eq(s.studentGuardians.isPrimary, true)))
      .leftJoin(s.guardians, eq(s.guardians.id, s.studentGuardians.guardianId))
      .where(and(eq(s.enrollments.academicClassId, test.academicClassId), lte(s.enrollments.startsOn, test.onDate), or(isNull(s.enrollments.endsOn), gte(s.enrollments.endsOn, test.onDate))))
      .orderBy(asc(s.students.portalId)).limit(1001);
  }
  async function latest(store: Database, testId: string) {
    const [dispatch] = await store.select().from(s.resultDispatches).where(eq(s.resultDispatches.assessmentId, testId)).orderBy(desc(s.resultDispatches.createdAt), desc(s.resultDispatches.id)).limit(1);
    if (!dispatch) return null;
    const recipients = await store.select({ status: s.resultDispatchRecipients.status }).from(s.resultDispatchRecipients).where(eq(s.resultDispatchRecipients.dispatchId, dispatch.id));
    const counts = Object.fromEntries(s.whatsappRecipientStatus.enumValues.map(status => [status, recipients.filter(r => r.status === status).length]));
    return { ...dispatch, counts, total: recipients.length };
  }
  async function preview(actor: Principal, classId: string, testId: string) {
    const test = await testForTeacher(db, actor, classId, testId);
    const rows = await snapshots(db, test);
    if (rows.length > 1000) throw new AppError(400, 'This test exceeds the supported message batch size of 1,000 students.');
    const missing = rows.flatMap(row => row.resultId ? row.guardianId && row.whatsapp && row.whatsappOptInAt ? [] : [{ studentId: row.studentId, portalId: row.portalId, fullName: row.fullName, reason: !row.guardianId ? 'No primary guardian' : !row.whatsapp ? 'No WhatsApp number' : 'WhatsApp consent not recorded' }] : [{ studentId: row.studentId, portalId: row.portalId, fullName: row.fullName, reason: 'Result not recorded' }]);
    return { configured: config.enabled, test: { id: test.id, version: test.version, name: test.name, subjectName: test.subjectName }, rosterCount: rows.length, sendableCount: rows.length - missing.length, missing, latest: await latest(db, test.id) };
  }
  async function queue(actor: Principal, classId: string, testId: string, input: unknown) {
    const data = z.object({ version: z.number().int().nonnegative() }).strict().parse(input);
    if (!config.enabled) throw new AppError(503, 'WhatsApp is not configured for this deployment.');
    try {
      return await db.transaction(async tx => {
        await tx.execute(sql`LOCK TABLE academic_years IN SHARE MODE`);
        await tx.execute(sql`LOCK TABLE enrollments IN SHARE MODE`);
        await tx.select({ id: s.academicClasses.id }).from(s.academicClasses).where(eq(s.academicClasses.id, classId)).for('update');
        const test = await testForTeacher(tx as Database, actor, classId, testId, true);
        if (test.version !== data.version) throw new AppError(409, 'Results changed. Reload and review the latest marks before sending.');
        const [existing] = await tx.select().from(s.resultDispatches).where(and(eq(s.resultDispatches.assessmentId, test.id), eq(s.resultDispatches.assessmentVersion, test.version)));
        if (existing) return existing;
        const rows = await snapshots(tx as Database, test);
        if (!rows.length) throw new AppError(400, 'This test has no enrolled students.');
        if (rows.length > 1000) throw new AppError(400, 'This test exceeds the supported message batch size of 1,000 students.');
        if (rows.some(r => !r.resultId)) throw new AppError(400, 'Record every student result before publishing.');
        if (rows.some(r => !r.guardianId || !r.whatsapp || !r.whatsappOptInAt)) throw new AppError(400, 'Every student needs a primary guardian with a WhatsApp number and recorded consent.');
        const [prior] = await tx.select({ id: s.resultDispatches.id }).from(s.resultDispatches).where(eq(s.resultDispatches.assessmentId, test.id)).limit(1);
        const kind = prior ? 'correction' : 'initial';
        const [dispatch] = await tx.insert(s.resultDispatches).values({ assessmentId: test.id, assessmentVersion: test.version, kind, triggeredBy: actor.id, status: 'queued', templateName: kind === 'initial' ? config.initialTemplate : config.correctionTemplate, templateLanguage: config.templateLanguage }).returning();
        await tx.insert(s.resultDispatchRecipients).values(rows.map(row => ({ dispatchId: dispatch.id, studentId: row.studentId, guardianId: row.guardianId!, recipientPhone: row.whatsapp!, studentName: row.fullName, guardianName: row.guardianName!, resultStatus: row.resultStatus!, marks: row.marks, totalMarks: test.totalMarks })));
        await audit(tx, actor, 'test_results.whatsapp_queued', dispatch.id, null, { assessmentId: test.id, assessmentVersion: test.version, kind, recipients: rows.length });
        return dispatch;
      });
    } catch (error) {
      const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code;
      if (code === '23505') {
        const [existing] = await db.select().from(s.resultDispatches).where(and(eq(s.resultDispatches.assessmentId, testId), eq(s.resultDispatches.assessmentVersion, data.version)));
        if (existing) return existing;
      }
      throw error;
    }
  }
  async function retryFailed(actor: Principal, classId: string, testId: string, dispatchId: string) {
    uuid.parse(dispatchId);
    await testForTeacher(db, actor, classId, testId);
    return db.transaction(async tx => {
      const [dispatch] = await tx.select().from(s.resultDispatches).where(and(eq(s.resultDispatches.id, dispatchId), eq(s.resultDispatches.assessmentId, testId))).for('update');
      if (!dispatch) throw new AppError(404, 'Message batch not found.');
      const retried = await tx.update(s.resultDispatchRecipients).set({ status: 'queued', errorCode: null, errorDetail: null, statusUpdatedAt: new Date() }).where(and(eq(s.resultDispatchRecipients.dispatchId, dispatchId), eq(s.resultDispatchRecipients.status, 'failed'))).returning({ id: s.resultDispatchRecipients.id });
      if (!retried.length) throw new AppError(400, 'There are no definite failed messages to retry. Uncertain deliveries are intentionally not resent to avoid duplicates.');
      await tx.update(s.resultDispatches).set({ status: 'queued', completedAt: null }).where(eq(s.resultDispatches.id, dispatchId));
      await audit(tx, actor, 'test_results.whatsapp_retry_queued', dispatchId, null, { recipients: retried.length });
      return { retried: retried.length };
    });
  }
  return { preview, queue, retryFailed };
}

type SendPayload = { recipientId: string; dispatchId: string; templateName: string; templateLanguage: string; phone: string; guardianName: string; studentName: string; subjectName: string; testName: string; onDate: string; resultText: string };
export async function processOneWhatsAppRecipient(db: Database, config: WhatsAppConfig = whatsappConfig(), send = sendTemplate): Promise<boolean> {
  if (!config.enabled) throw new Error('WHATSAPP_ENABLED is not true.');
  const stale = await db.update(s.resultDispatchRecipients).set({ status: 'uncertain', errorCode: 'worker_interrupted', errorDetail: 'The worker stopped during this attempt; verify delivery before any manual resend.', statusUpdatedAt: new Date() })
    .where(and(eq(s.resultDispatchRecipients.status, 'processing'), lte(s.resultDispatchRecipients.lastAttemptAt, new Date(Date.now() - 5 * 60_000))))
    .returning({ dispatchId: s.resultDispatchRecipients.dispatchId });
  for (const dispatchId of new Set(stale.map(row => row.dispatchId))) await refreshDispatch(db, dispatchId);
  const payload = await db.transaction(async tx => {
    const [row] = await tx.select({ recipientId: s.resultDispatchRecipients.id, dispatchId: s.resultDispatches.id, templateName: s.resultDispatches.templateName, templateLanguage: s.resultDispatches.templateLanguage, phone: s.resultDispatchRecipients.recipientPhone, guardianName: s.resultDispatchRecipients.guardianName, studentName: s.resultDispatchRecipients.studentName, resultStatus: s.resultDispatchRecipients.resultStatus, marks: s.resultDispatchRecipients.marks, totalMarks: s.resultDispatchRecipients.totalMarks, subjectName: s.subjects.name, testName: s.assessments.name, onDate: s.assessments.onDate })
      .from(s.resultDispatchRecipients).innerJoin(s.resultDispatches, eq(s.resultDispatches.id, s.resultDispatchRecipients.dispatchId)).innerJoin(s.assessments, eq(s.assessments.id, s.resultDispatches.assessmentId)).innerJoin(s.subjects, eq(s.subjects.id, s.assessments.subjectId))
      .where(eq(s.resultDispatchRecipients.status, 'queued')).orderBy(asc(s.resultDispatchRecipients.createdAt)).limit(1).for('update', { skipLocked: true });
    if (!row) return null;
    await tx.update(s.resultDispatchRecipients).set({ status: 'processing', attemptCount: sql`${s.resultDispatchRecipients.attemptCount} + 1`, lastAttemptAt: new Date(), statusUpdatedAt: new Date() }).where(eq(s.resultDispatchRecipients.id, row.recipientId));
    await tx.update(s.resultDispatches).set({ status: 'processing' }).where(eq(s.resultDispatches.id, row.dispatchId));
    const resultText = row.resultStatus === 'present' ? `${row.marks} / ${row.totalMarks}` : row.resultStatus.replaceAll('_', ' ');
    return { ...row, resultText } satisfies SendPayload;
  });
  if (!payload) return false;
  try {
    const providerMessageId = await send(config, payload);
    await db.update(s.resultDispatchRecipients).set({ status: 'accepted', providerMessageId, errorCode: null, errorDetail: null, statusUpdatedAt: new Date() }).where(eq(s.resultDispatchRecipients.id, payload.recipientId));
  } catch (error) {
    const definite = error instanceof WhatsAppProviderError;
    await db.update(s.resultDispatchRecipients).set({ status: definite ? 'failed' : 'uncertain', errorCode: definite ? error.code : 'network_uncertain', errorDetail: (error instanceof Error ? error.message : 'Unknown send error').slice(0, 500), statusUpdatedAt: new Date() }).where(eq(s.resultDispatchRecipients.id, payload.recipientId));
  }
  await refreshDispatch(db, payload.dispatchId);
  return true;
}

export class WhatsAppProviderError extends Error { constructor(public code: string, message: string) { super(message); } }
async function sendTemplate(config: WhatsAppConfig, payload: SendPayload) {
  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`, {
      method: 'POST', signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: payload.phone.replace(/^\+/, ''), type: 'template', template: { name: payload.templateName, language: { code: payload.templateLanguage }, components: [{ type: 'body', parameters: [payload.guardianName, payload.studentName, payload.subjectName, payload.testName, payload.onDate, payload.resultText].map(text => ({ type: 'text', text })) }] }, biz_opaque_callback_data: payload.recipientId }),
    });
  } catch (error) { throw error; }
  const body = await response.json().catch(() => ({})) as { messages?: { id?: string }[]; error?: { code?: number; message?: string } };
  if (!response.ok || !body.messages?.[0]?.id) throw new WhatsAppProviderError(String(body.error?.code ?? response.status), body.error?.message ?? 'WhatsApp rejected the message.');
  return body.messages[0].id;
}
async function refreshDispatch(db: Database, dispatchId: string) {
  const rows = await db.select({ status: s.resultDispatchRecipients.status }).from(s.resultDispatchRecipients).where(eq(s.resultDispatchRecipients.dispatchId, dispatchId));
  if (rows.some(r => ['queued', 'processing'].includes(r.status))) return;
  const failures = rows.filter(r => ['failed', 'uncertain'].includes(r.status)).length;
  const status = failures === 0 ? 'completed' : failures === rows.length ? 'failed' : 'partial';
  await db.update(s.resultDispatches).set({ status, completedAt: new Date() }).where(eq(s.resultDispatches.id, dispatchId));
}

const providerStatuses = z.enum(['sent', 'delivered', 'read', 'failed']);
export function verifyWhatsAppSignature(raw: string, signature: string | null, secret: string) {
  if (!signature?.startsWith('sha256=') || !secret) return false;
  const supplied = Buffer.from(signature.slice(7), 'hex'); const expected = Buffer.from(createHmac('sha256', secret).update(raw).digest('hex'), 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
export async function applyWhatsAppWebhook(db: Database, input: unknown) {
  const payload = z.object({ object: z.literal('whatsapp_business_account'), entry: z.array(z.object({ changes: z.array(z.object({ field: z.literal('messages'), value: z.object({ statuses: z.array(z.object({ id: z.string().min(1), status: providerStatuses, errors: z.array(z.object({ code: z.union([z.string(), z.number()]), title: z.string().optional(), message: z.string().optional() }).passthrough()).optional() }).passthrough()).optional() }).passthrough() }).passthrough()) }).passthrough()) }).passthrough().parse(input);
  const updates = payload.entry.flatMap(e => e.changes.flatMap(c => c.value.statuses ?? []));
  const rank = { accepted: 0, sent: 1, delivered: 2, read: 3 } as const;
  for (const update of updates) {
    const [current] = await db.select().from(s.resultDispatchRecipients).where(eq(s.resultDispatchRecipients.providerMessageId, update.id));
    if (!current) continue;
    if (current.status === 'read' || (current.status === 'delivered' && update.status !== 'read') || (update.status !== 'failed' && current.status in rank && rank[update.status] <= rank[current.status as keyof typeof rank])) continue;
    const error = update.errors?.[0];
    await db.update(s.resultDispatchRecipients).set({ status: update.status, errorCode: error ? String(error.code) : null, errorDetail: error ? (error.message ?? error.title ?? 'Provider delivery failure').slice(0, 500) : null, statusUpdatedAt: new Date() }).where(eq(s.resultDispatchRecipients.id, current.id));
    await refreshDispatch(db, current.dispatchId);
  }
  return updates.length;
}
