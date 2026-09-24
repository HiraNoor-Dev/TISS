import { z } from 'zod';
import { authService, SESSION_SECONDS } from './auth';
import { accountService } from './accounts';
import { academicService } from './academics';
import { AppError } from './errors';
import type { Database } from '../db/types';
import { academicAdminService, structureKind } from './academic-admin';
import { studentManagementService } from './student-management';
import { classroomService } from './classroom';
import { remarkService } from './remarks';
import { reportService } from './reports';
import { activityService } from './activity';
import { correctionService } from './corrections';
import { whatsappConfig, whatsappService } from './whatsapp';

export const cookieName = (production: boolean) => production ? '__Host-tiss_session' : 'tiss_session';
export function sessionCookie(token: string, production: boolean, clear = false) {
  return `${cookieName(production)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_SECONDS}${production ? '; Secure' : ''}`;
}
export function readSession(request: Request, production: boolean) {
  const value = request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(cookieName(production) + '='));
  return value?.slice(value.indexOf('=') + 1);
}
export function checkMutationOrigin(request: Request, origin: string) {
  if (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new AppError(403, 'Request origin is not allowed.');
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new AppError(415, 'Use application/json.');
}
async function boundedJson(request: Request, maxBytes = 16_384) {
  // Bound actual streamed bytes, not just the client-supplied Content-Length header.
  if (!request.body) throw new AppError(400, 'A JSON body is required.');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new AppError(413, 'Request is too large.'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (e) { if (e instanceof AppError) throw e; throw new AppError(400, 'Invalid JSON.'); }
  finally { reader.releaseLock(); }
}
export function apiHandler(db: Database, config: { origin: string; rateSecret: string; production: boolean }) {
  if (new URL(config.origin).origin !== config.origin || (config.production && !config.origin.startsWith('https://'))) throw new Error('APP_ORIGIN must be an exact origin; production requires HTTPS');
  const auth = authService(db, config.rateSecret); const accounts = accountService(db); const academics = academicService(db);
  const academicAdmin = academicAdminService(db); const studentManagement = studentManagementService(db);
  const classroom = classroomService(db);
  const remarks = remarkService(db);
  const reports = reportService(db);
  const activity = activityService(db);
  const corrections = correctionService(db);
  const whatsapp = whatsappService(db, whatsappConfig());
  return async (request: Request, segments: string[]): Promise<Response> => {
    const reply = (body: unknown, status = 200, cookie?: string) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
    try {
      const route = segments.join('/'); const token = readSession(request, config.production);
      const method = request.method;
      const body = method === 'GET' ? undefined : (checkMutationOrigin(request, config.origin), await boundedJson(request, segments[0] === 'classroom' ? 1_500_000 : 16_384));
      if (route === 'auth/login' && method === 'POST') {
        const login = await auth.login(body);
        // Replace an existing browser session on account switch.
        await auth.logout(token);
        return reply({ mustChangePassword: login.mustChangePassword }, 200, sessionCookie(login.token, config.production));
      }
      if (route === 'auth/logout' && method === 'POST') { await auth.logout(token); return reply({ ok: true }, 200, sessionCookie('', config.production, true)); }
      if (route === 'auth/password' && method === 'POST') { await auth.changePassword(token, body); return reply({ ok: true }, 200, sessionCookie('', config.production, true)); }
      const actor = await auth.authenticate(token, route === 'auth/me' && method === 'GET');
      if (route === 'auth/me' && method === 'GET') {
        const { authVersion: _, ...publicUser } = actor; return reply({ user: publicUser });
      }
      const page = z.coerce.number().int().min(1).max(10_000).parse(new URL(request.url).searchParams.get('page') ?? '1');
      if (route === 'admin/activity/summary' && method === 'GET') return reply(await activity.summary(actor));
      if (route === 'admin/corrections' && method === 'GET') return reply(await corrections.list(actor, Object.fromEntries(new URL(request.url).searchParams)));
      if (route === 'admin/corrections' && method === 'POST') return reply(await corrections.save(actor, body));
      if (route === 'admin/activity' && method === 'GET') return reply(await activity.list(actor, Object.fromEntries(new URL(request.url).searchParams)));
      if (route === 'reports/options' && method === 'GET') return reply(await reports.options(actor));
      if (route === 'reports/roster' && method === 'GET') { const q = new URL(request.url).searchParams; return reply({ students: await reports.roster(actor, q.get('classId') ?? '', q.get('from') ?? '', q.get('to') ?? '') }); }
      if (route === 'reports' && method === 'GET') return reply(await reports.generate(actor, Object.fromEntries(new URL(request.url).searchParams)));
      if (route === 'remarks/options' && method === 'GET') return reply(await remarks.options(actor));
      if (route === 'students/me/remarks' && method === 'GET') return reply({ remarks: await remarks.ownVisible(actor, page) });
      if (segments[0] === 'remarks') {
        const params = new URL(request.url).searchParams; const classId = params.get('classId') ?? '';
        if (route === 'remarks/roster' && method === 'GET') return reply({ students: await remarks.roster(actor, classId, params.get('date') ?? '') });
        if (route === 'remarks' && method === 'GET') return reply(await remarks.list(actor, classId, page));
        if (route === 'remarks' && method === 'POST') return reply({ remark: await remarks.create(actor, classId, body) }, 201);
        if (segments.length === 3 && method === 'POST') {
          if (segments[2] === 'edit') { await remarks.edit(actor, segments[1], body); return reply({ ok: true }); }
          if (segments[2] === 'review') { await remarks.review(actor, segments[1], body); return reply({ ok: true }); }
        }
      }
      if (segments[0] === 'classroom') {
        const classId = segments[1]; const params = new URL(request.url).searchParams;
        if (segments.length === 2 && method === 'GET') return reply(await classroom.workspace(actor, classId));
        if (segments.length === 3 && segments[2] === 'tests') {
          if (method === 'GET') return reply({ tests: await classroom.tests(actor, classId, params.get('subjectId') ?? '', page) });
          if (method === 'POST') return reply({ test: await classroom.createTest(actor, classId, body) }, 201);
        }
        if (segments.length === 4 && segments[2] === 'tests') {
          if (method === 'GET') return reply(await classroom.marks(actor, classId, segments[3]));
          if (method === 'POST') return reply(await classroom.saveMarks(actor, classId, segments[3], body));
        }
        if (segments.length >= 5 && segments[2] === 'tests' && segments[4] === 'whatsapp') {
          if (segments.length === 5 && method === 'GET') return reply(await whatsapp.preview(actor, classId, segments[3]));
          if (segments.length === 5 && method === 'POST') return reply({ dispatch: await whatsapp.queue(actor, classId, segments[3], body) }, 202);
          if (segments.length === 7 && segments[6] === 'retry' && method === 'POST') return reply(await whatsapp.retryFailed(actor, classId, segments[3], segments[5]));
        }
        if (segments.length === 3 && segments[2] === 'attendance') {
          if (method === 'GET') return reply(await classroom.attendance(actor, classId, params.get('date') ?? ''));
          if (method === 'POST') return reply(await classroom.saveAttendance(actor, classId, params.get('date') ?? '', body));
        }
        if (segments.length === 3 && segments[2] === 'observations') {
          if (method === 'GET') return reply(await classroom.observations(actor, classId, params.get('date') ?? '', params.get('category') ?? ''));
          if (method === 'POST') return reply(await classroom.saveObservations(actor, classId, params.get('date') ?? '', params.get('category') ?? '', body));
        }
      }
      if (route === 'assignments' && method === 'GET') return reply({ assignments: await academics.responsibilities(actor) });
      if (route === 'students/me' && method === 'GET') return reply({ student: await academics.ownProfile(actor) });
      if (route === 'admin/academic' && method === 'GET') return reply(await academicAdmin.overview(actor));
      if (segments[0] === 'admin' && segments[1] === 'academic' && method === 'POST') {
        const kind = structureKind.parse(segments[2]);
        if (segments.length === 3) return reply({ record: await academicAdmin.create(actor, kind, body) }, 201);
        if (segments.length === 5 && segments[4] === 'edit') { await academicAdmin.edit(actor, kind, segments[3], body); return reply({ ok: true }); }
        if (segments.length === 5 && segments[4] === 'delete') { z.object({}).strict().parse(body); await academicAdmin.remove(actor, kind, segments[3]); return reply({ ok: true }); }
        if (segments.length === 5 && segments[4] === 'status') { await academicAdmin.setActive(actor, kind, segments[3], body); return reply({ ok: true }); }
        if (segments.length === 5 && kind === 'years' && segments[4] === 'current') { z.object({}).strict().parse(body); await academicAdmin.setCurrentYear(actor, segments[3]); return reply({ ok: true }); }
      }
      if (segments[0] === 'admin' && segments[1] === 'assignments' && method === 'POST') {
        const kind = z.enum(['teaching', 'incharge']).parse(segments[2]);
        if (segments.length === 3) return reply({ assignment: await academicAdmin.assign(actor, kind, body) }, 201);
        if (segments.length === 5 && segments[4] === 'delete') { z.object({}).strict().parse(body); await academicAdmin.removeAssignment(actor, kind, segments[3]); return reply({ ok: true }); }
        if (segments.length === 5 && segments[4] === 'revoke') { z.object({}).strict().parse(body); await academicAdmin.revoke(actor, kind, segments[3]); return reply({ ok: true }); }
      }
      const search = new URL(request.url).searchParams;
      const classId = search.get('classId') || undefined;
      if (route === 'student-management/options' && method === 'GET') return reply({ classes: await studentManagement.classOptions(actor) });
      if (route === 'student-management' && method === 'GET') return reply({ students: await studentManagement.list(actor, { classId, page, query: search.get('q') ?? '' }), page, pageSize: 50 });
      if (route === 'student-management' && method === 'POST') return reply({ student: await studentManagement.create(actor, body, classId) }, 201);
      if (route === 'admin/guardians' && method === 'GET') return reply({ guardians: await studentManagement.guardianSearch(actor, search.get('q') ?? '') });
      if (segments[0] === 'student-management' && segments.length >= 2) {
        const id = segments[1];
        if (segments.length === 2 && method === 'GET') return reply({ student: await studentManagement.details(actor, id, classId) });
        if (segments.length === 3 && method === 'POST') {
          if (segments[2] === 'profile') { await studentManagement.updateProfile(actor, id, body, classId); return reply({ ok: true }); }
          if (segments[2] === 'enrollment') { await studentManagement.enroll(actor, id, body); return reply({ ok: true }); }
          if (segments[2] === 'status') { await studentManagement.setStatus(actor, id, body, classId); return reply({ ok: true }); }
          if (segments[2] === 'guardians') { await studentManagement.addGuardian(actor, id, body, classId); return reply({ ok: true }, 201); }
        }
        if (segments.length === 4 && segments[2] === 'guardians' && method === 'POST') { await studentManagement.updateGuardian(actor, id, segments[3], body, classId); return reply({ ok: true }); }
      }
      if (segments.length === 3 && segments[0] === 'classes' && segments[2] === 'roster' && method === 'GET') return reply({ students: await academics.roster(actor, segments[1], page), page, pageSize: 50 });
      if (segments.length === 5 && segments[0] === 'classes' && segments[2] === 'students' && segments[4] === 'contacts' && method === 'GET') return reply({ guardians: await academics.contacts(actor, segments[1], segments[3]) });
      if (route === 'admin/accounts' && method === 'GET') return reply({ accounts: await accounts.list(actor, page), page, pageSize: 50 });
      if (route === 'admin/accounts' && method === 'POST') return reply({ account: await accounts.provision(actor, body) }, 201);
      if (segments.length === 4 && segments[0] === 'admin' && segments[1] === 'accounts' && method === 'POST') {
        if (segments[3] === 'edit') { await accounts.editTeacher(actor, segments[2], body); return reply({ ok: true }); }
        if (segments[3] === 'delete') { z.object({}).strict().parse(body); await accounts.removeTeacher(actor, segments[2]); return reply({ ok: true }); }
        if (segments[3] === 'status') { await accounts.changeStatus(actor, segments[2], body); return reply({ ok: true }); }
        if (segments[3] === 'reset') { await accounts.resetPassword(actor, segments[2], body); return reply({ ok: true }); }
      }
      throw new AppError(404, 'Endpoint not found.');
    } catch (error) {
      if (error instanceof AppError) return reply({ error: error.message }, error.status);
      if (error instanceof z.ZodError) return reply({ error: 'Check the submitted fields.', fields: error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) }, 400);
      const dbError = error as { code?: string; cause?: { code?: string } };
      if ((dbError.code ?? dbError.cause?.code) === '23505') return reply({ error: 'This record already exists.' }, 409);
      if (['23503', '23514', 'P0001'].includes(dbError.code ?? dbError.cause?.code ?? '')) return reply({ error: 'The change conflicts with related records or academic dates. Reload and check the selected records.' }, 400);
      // Do not log request bodies, passwords, tokens or SQL parameter values.
      console.error('API request failed', { type: error instanceof Error ? error.name : 'UnknownError' });
      return reply({ error: 'The request could not be completed. Please try again.' }, 500);
    }
  };
}
