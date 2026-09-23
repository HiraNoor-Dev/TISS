import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import bcrypt from 'bcryptjs';
import { users, auditLogs } from '../src/db/schema';
import { password, username } from '../src/server/validation';
import { z } from 'zod';
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env.local');
const input = z.object({ username, fullName: z.string().trim().min(1).max(120), password }).parse({
  username: process.env.BOOTSTRAP_USERNAME, fullName: process.env.BOOTSTRAP_NAME, password: process.env.BOOTSTRAP_PASSWORD,
});
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const db = drizzle(pool);
  const passwordHash = await bcrypt.hash(input.password, 12);
  await db.transaction(async tx => {
    // Only bootstrap an empty installation; extra administrators need a separate policy.
    await tx.execute('LOCK TABLE users IN EXCLUSIVE MODE');
    if ((await tx.select({ id: users.id }).from(users).limit(1)).length) throw new Error('Bootstrap is allowed only on an empty installation.');
    const [user] = await tx.insert(users).values({ username: input.username, fullName: input.fullName, passwordHash, role: 'admin' }).returning({ id: users.id });
    await tx.insert(auditLogs).values({ actorId: user.id, entityId: user.id, action: 'installation.admin_bootstrapped' });
  });
  console.log('Administrator created. A password change is required at first login.');
} catch {
  console.error('Administrator bootstrap failed. Check the database configuration, migrations, and empty-installation requirement.');
  process.exitCode = 1;
} finally { await pool.end(); }
