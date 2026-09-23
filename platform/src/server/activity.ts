import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../db/schema';
import type { Database } from '../db/types';
import type { Principal } from './auth';
import { requireAdmin } from './permissions';

export function activityService(db: Database) {
  return {
    async list(actor: Principal, input: unknown) {
      requireAdmin(actor);
      const query = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), entityId: z.uuid().optional(), action: z.string().trim().min(1).max(100).optional() }).strict().parse(input);
      const rows = await db.select({ id: s.auditLogs.id, actor: s.users.fullName, action: s.auditLogs.action, entityId: s.auditLogs.entityId, before: s.auditLogs.before, after: s.auditLogs.after, createdAt: s.auditLogs.createdAt })
        .from(s.auditLogs).leftJoin(s.users, eq(s.users.id, s.auditLogs.actorId))
        .where(and(query.entityId ? eq(s.auditLogs.entityId, query.entityId) : undefined, query.action ? eq(s.auditLogs.action, query.action) : undefined))
        .orderBy(desc(s.auditLogs.createdAt), desc(s.auditLogs.id)).limit(51).offset((query.page - 1) * 50);
      return { entries: rows.slice(0, 50), hasMore: rows.length > 50 };
    },
    async summary(actor: Principal) {
      requireAdmin(actor);
      const [row] = await db.select({
        pendingRemarks: sql<number>`(select count(*)::int from remarks where status = 'pending')`,
        activeTeachers: sql<number>`(select count(*)::int from users where role = 'teacher' and status = 'active')`,
        activeStudents: sql<number>`(select count(*)::int from students where status = 'active')`,
        unassignedClasses: sql<number>`(select count(*)::int from academic_classes c join academic_years y on y.id = c.academic_year_id where c.is_active and y.is_current and not exists (select 1 from incharge_assignments i where i.academic_class_id = c.id and i.revoked_at is null))`,
      }).from(sql`(select 1) as singleton`);
      return row;
    },
  };
}
