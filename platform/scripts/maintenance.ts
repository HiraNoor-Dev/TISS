import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const sessions = await pool.query('DELETE FROM sessions WHERE expires_at < now()');
  const buckets = await pool.query("DELETE FROM login_buckets WHERE resets_at < now() - interval '1 day'");
  console.log(`Expired sessions removed: ${sessions.rowCount}; expired login buckets removed: ${buckets.rowCount}. No school records or audits are removed.`);
} finally { await pool.end(); }
