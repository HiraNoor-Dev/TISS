import { redirect } from 'next/navigation';
import { currentUser } from '@/server/runtime';
import { AppError } from '@/server/errors';
import { PasswordForm, LogoutButton } from '@/components/auth-forms';
export const dynamic = 'force-dynamic';
export default async function ChangePassword() {
  let user;
  try { user = await currentUser(true); } catch (e) { if (e instanceof AppError && e.status === 401) redirect('/'); throw e; }
  return <main className="shell max-w-xl"><div className="actions justify-between mb-8"><a className="brand" href="/dashboard">TISS</a><LogoutButton /></div><section className="panel"><h1>Choose your password</h1><p className="muted">{user.mustChangePassword ? 'Change your temporary password before accessing student information.' : 'Changing your password signs you out on every device.'}</p><PasswordForm /></section></main>;
}
