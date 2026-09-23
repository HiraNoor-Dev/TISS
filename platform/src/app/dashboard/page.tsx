import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentUser } from '@/server/runtime';
import { AppError } from '@/server/errors';
import { database } from '@/db/client';
import { academicService } from '@/server/academics';
import { LogoutButton } from '@/components/auth-forms';
import { AccountManager } from '@/components/account-manager';
import { AdminNavigation } from '@/components/management-shared';
import { StudentRemarks } from '@/components/remark-manager';
export const dynamic = 'force-dynamic';
export default async function Dashboard() {
  let user;
  try { user = await currentUser(true); } catch (e) { if (e instanceof AppError && e.status === 401) redirect('/'); throw e; }
  if (user.mustChangePassword) redirect('/change-password');
  const service = academicService(database());
  const responsibilities = await service.responsibilities(user);
  const student = user.role === 'student' ? await service.ownProfile(user) : null;
  return <><header className="topbar"><div className="topbar-inner"><Link href="/dashboard" className="brand">TISS<span>Student Monitoring & Parent Communication</span></Link><div className="actions"><Link href="/change-password" className="text-sm mr-2">Change password</Link><LogoutButton /></div></div></header>
    <main className="shell"><p className="eyebrow muted">{user.role === 'admin' ? 'School administration' : user.role === 'teacher' ? 'Your responsibilities' : 'Your student record'}</p><h1>Welcome, {user.fullName}</h1>
      {user.role === 'admin' && <><AdminNavigation active="accounts" /><AccountManager /></>}
      <p className="mt-5"><Link className="button secondary" href="/reports">Reports</Link></p>
      {user.role === 'teacher' && <p><Link className="button secondary" href="/remarks">Remarks & visibility requests</Link></p>}
      {user.role === 'student' && <StudentRemarks />}
      {user.role === 'teacher' && responsibilities.some(c => c.isIncharge) && <p><Link className="button secondary" href="/students">Manage students & guardians</Link></p>}
      {user.role === 'teacher' && <>{responsibilities.length ? <div className="grid mt-8">{responsibilities.map(c => <section className="panel" key={c.classId}><p className="eyebrow muted">{c.division} · {c.year}</p><h2>{c.grade} · {c.section}</h2>{c.isIncharge && <p><span className="tag">Class incharge</span></p>}<p className="muted">{c.subjects.length ? c.subjects.map(s => s.name).join(' · ') : 'Class and student responsibilities'}</p><Link className="button" href={`/classes/${c.classId}/workspace`}>Open class workspace</Link></section>)}</div> : <section className="panel mt-8"><h2>No responsibilities assigned yet</h2><p className="muted mb-0">Your administrator will assign your classes and subjects. They will appear here when ready.</p></section>}</>}
      {student && <section className="panel mt-8"><p className="eyebrow muted">Portal ID {student.portalId}</p><h2>Enrollment history</h2>{student.enrollments.length ? <div className="stack">{student.enrollments.map(e => <div key={e.enrollmentId}><strong>{e.year} · {e.grade} · {e.section}</strong><p className="muted mb-0">From {e.startsOn}{e.endsOn ? ` to ${e.endsOn}` : ''}</p></div>)}</div> : <p className="muted mb-0">Your school has not added your enrollment yet.</p>}</section>}
    </main></>;
}
