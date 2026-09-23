import { LoginForm } from '@/components/auth-forms';
export default async function Login({ searchParams }: { searchParams: Promise<{ passwordChanged?: string }> }) {
  const { passwordChanged } = await searchParams;
  return <><header className="topbar"><div className="topbar-inner"><a className="brand" href="/">TISS<span>Student Monitoring & Parent Communication</span></a></div></header>
    <main className="login-layout"><section><p className="eyebrow muted">Connected classrooms</p><h1>Every student.<br />A clearer picture.</h1><p className="muted text-lg">One place for teachers and school staff to keep student records organized and families informed.</p><div className="mt-8 border-t border-[#d6e2dc] pt-6"><p className="text-sm muted mb-0">Use your school-provided account to access your assigned responsibilities.</p></div></section>
    <section className="panel"><p className="eyebrow muted">Welcome back</p><h2>Sign in to your school</h2>{passwordChanged && <p role="status" className="success">Password changed. Sign in with your new password.</p>}<LoginForm /></section></main></>;
}
