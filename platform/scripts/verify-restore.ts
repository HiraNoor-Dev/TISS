import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, openSync, closeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import pg from 'pg';
import { verifySyntheticSchool } from './synthetic-school';

// Restores only into a new, isolated cluster. Never accepts a destination URL.
const archive = resolve(process.argv[2] ?? '');
if (!process.argv[2] || !existsSync(archive)) throw new Error('Usage: npm run db:verify-restore -- <backup.dump>');
const manifest = join(resolve(archive, '..'), 'SHA256.txt');
if (!existsSync(manifest) || readFileSync(manifest, 'utf8').split(/\s+/)[0] !== createHash('sha256').update(readFileSync(archive)).digest('hex')) throw new Error('Missing or mismatched backup checksum.');
const bin = process.env.PG_BIN ?? 'C:\\Program Files\\PostgreSQL\\18\\bin';
const directory = resolve('../.local/restore-verification', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(directory, { recursive: true });
const data = join(directory, 'cluster'); const passwordFile = join(directory, 'password.tmp');
const password = randomBytes(32).toString('hex'); writeFileSync(passwordFile, password, { mode: 0o600 });
const port = await new Promise<number>((accept, reject) => { const server = createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const address = server.address(); const port = typeof address === 'object' && address ? address.port : 0; server.close(() => accept(port)); }); });
const env = { ...process.env, PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'restore_verifier', PGPASSWORD: password, PGDATABASE: 'postgres' };
function command(name: string, args: string[]) {
  const log = openSync(join(directory, `${name}.log`), 'a');
  try {
    const result = spawnSync(join(bin, name + (process.platform === 'win32' ? '.exe' : '')), args, { env, windowsHide: true, stdio: ['ignore', log, log], timeout: 120000 });
    if (result.error || result.status !== 0) throw new Error(`${name} failed; isolated restore verification did not pass. Check ${directory}.`);
  } finally { closeSync(log); }
}
let started = false;
try {
  command('initdb', ['-D', data, '-U', 'restore_verifier', '--auth=scram-sha-256', '--pwfile', passwordFile, '--encoding=UTF8', '--locale=C']);
  unlinkSync(passwordFile);
  started = true; command('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
  command('pg_restore', ['--exit-on-error', '--no-owner', '--no-acl', '--dbname=postgres', archive]);
  const pool = new pg.Pool({ host: '127.0.0.1', port, user: 'restore_verifier', password, database: 'postgres', max: 3 });
  try {
    const counts = await pool.query("SELECT (SELECT count(*)::int FROM users) AS users, (SELECT count(*)::int FROM students) AS students, (SELECT count(*)::int FROM audit_logs) AS audits, (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migrations");
    const invalid = await pool.query('SELECT count(*)::int AS count FROM pg_constraint WHERE NOT convalidated');
    if (invalid.rows[0].count !== 0) throw new Error('Restored database has unvalidated constraints.');
    // Real multi-connection optimistic-write check using a disposable table in the isolated cluster.
    await pool.query('CREATE TABLE restore_concurrency_probe (id int PRIMARY KEY, version int NOT NULL); INSERT INTO restore_concurrency_probe VALUES (1, 0)');
    const results = await Promise.all([pool.query('UPDATE restore_concurrency_probe SET version = version + 1 WHERE id = 1 AND version = 0 RETURNING version'), pool.query('UPDATE restore_concurrency_probe SET version = version + 1 WHERE id = 1 AND version = 0 RETURNING version')]);
    if (results.reduce((n, r) => n + (r.rowCount ?? 0), 0) !== 1) throw new Error('Concurrent conditional-write verification failed.');
    await pool.query('DROP TABLE restore_concurrency_probe');
    writeFileSync(join(directory, 'verification.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), archive, counts: counts.rows[0], constraintsValidated: true, conditionalWriteConcurrency: true }, null, 2));
    console.log(`Full isolated restore passed. Evidence: ${join(directory, 'verification.json')}`);
    await pool.query('CREATE DATABASE tiss_synthetic');
    const synthetic = new pg.Pool({ host: '127.0.0.1', port, user: 'restore_verifier', password, database: 'tiss_synthetic', max: 5 });
    try {
      const result = await verifySyntheticSchool(synthetic);
      writeFileSync(join(directory, 'application-verification.json'), JSON.stringify(result, null, 2));
      console.log('Actual classroom concurrency and administrator/teacher collision checks passed on isolated PostgreSQL.');
    } finally { await synthetic.end(); }
    if (process.argv.includes('--preview')) {
      const preview = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3101'], { windowsHide: true, stdio: 'inherit', env: { ...process.env, DATABASE_URL: `postgresql://restore_verifier:${password}@127.0.0.1:${port}/tiss_synthetic`, APP_ORIGIN: 'http://127.0.0.1:3101', AUTH_RATE_SECRET: randomBytes(32).toString('hex'), TISS_BUILD_DIR: '.next-preview' } });
      console.log('Synthetic preview: http://127.0.0.1:3101. Accounts: preview-admin / preview-teacher / preview-student. Password: Synthetic-preview-only-2509. Stop with Ctrl+C.');
      await new Promise<void>((accept, reject) => { preview.once('error', reject); preview.once('exit', () => accept()); process.once('SIGINT', () => { preview.kill(); accept(); }); process.once('SIGTERM', () => { preview.kill(); accept(); }); });
    }
  } finally { await pool.end(); }
} finally {
  if (existsSync(passwordFile)) unlinkSync(passwordFile);
  if (started) command('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
}
