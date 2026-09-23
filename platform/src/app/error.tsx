'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="shell max-w-xl"><section className="panel"><h1>Unable to load this page</h1><p className="muted">Please retry. If the problem continues, contact your school administrator.</p><div className="actions"><button onClick={reset}>Try again</button><a href="/" className="button secondary">Sign in</a></div></section></main>;
}
