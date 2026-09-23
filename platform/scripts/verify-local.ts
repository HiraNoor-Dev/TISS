import { Pool } from 'pg';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await pool.query(`
    SELECT current_database() AS database,
           current_user AS username,
           (SELECT count(*)::int FROM users) AS users,
           (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public') AS tables
  `);
  console.log(JSON.stringify(result.rows[0]));
} finally {
  await pool.end();
}
