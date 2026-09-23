import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUser } from '@/server/runtime';
import { database } from '@/db/client';
import { academicService } from '@/server/academics';
import { AppError } from '@/server/errors';
export const dynamic = 'force-dynamic';
export default async function Roster({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  let user;
  try { user = await currentUser(true); } catch (e) { if (e instanceof AppError && e.status === 401) redirect('/'); throw e; }
  if (user.mustChangePassword) redirect('/change-password');
  const { id } = await params; const parsed = z.coerce.number().int().min(1).max(10000).safeParse((await searchParams).page ?? '1');
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return <main className="shell"><h1>Invalid class request</h1><Link href="/dashboard">Back to dashboard</Link></main>;
  let roster;
  try { roster = await academicService(database()).roster(user, id, parsed.data); }
  catch (e) { if (e instanceof AppError && e.status === 403) return <main className="shell"><h1>Access restricted</h1><p>This class is outside your responsibilities.</p><Link href="/dashboard">Back to dashboard</Link></main>; throw e; }
  return <main className="shell"><Link href="/dashboard">← Dashboard</Link><h1 className="mt-8">Class roster</h1><p className="muted">Current enrolled students · Page {parsed.data}</p><section className="panel">{roster.length ? roster.map(s => <div className="account-row" key={s.enrollmentId}><strong>{s.fullName}</strong><span className="tag">{s.portalId}</span></div>) : <p className="muted mb-0">No students on this page.</p>}<nav className="actions mt-5" aria-label="Roster pages">{parsed.data > 1 && <Link className="button secondary" href={`?page=${parsed.data - 1}`}>Previous</Link>}{roster.length === 50 && <Link className="button secondary" href={`?page=${parsed.data + 1}`}>Next</Link>}</nav></section></main>;
}
