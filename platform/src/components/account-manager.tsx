'use client';
import { useEffect, useState } from 'react';
import { mutate } from './auth-forms';
import { ActionForm, MutationButton } from './management-shared';
type Account = { id: string; username: string; fullName: string; role: 'admin' | 'teacher' | 'student'; status: 'active' | 'inactive' | 'suspended'; mustChangePassword: boolean };
export function AccountManager() {
  const [accounts, setAccounts] = useState<Account[]>([]); const [page, setPage] = useState(1); const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const [resetAccount, setResetAccount] = useState<Account | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setAccounts([]);
    fetch(`/api/admin/accounts?page=${page}`, { signal: controller.signal, cache: 'no-store' }).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); return data.accounts as Account[]; })
      .then(setAccounts).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, refresh]);
  async function action(callback: () => Promise<void>) {
    setBusy(true); setError(''); setSuccess('');
    try { await callback(); setRefresh(x => x + 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'The request failed.'); }
    finally { setBusy(false); }
  }
  return <div className="stack mt-8">
    <section className="panel"><h2>Create a school account</h2><p className="muted">Share temporary credentials privately with the account holder. They must choose a new password before accessing records. For an existing student, use their portal ID to link the account to their record.</p>
      <form className="stack" onSubmit={e => {
        e.preventDefault(); const form = e.currentTarget; const data = Object.fromEntries(new FormData(form));
        void action(async () => { await mutate('admin/accounts', data); form.reset(); setSuccess('Account created. Share the temporary credentials privately.'); });
      }}><fieldset disabled={busy} className="grid border-0 p-0 m-0">
        <label>Full name<input name="fullName" required maxLength={120} /></label>
        <label>Username / portal ID<input name="username" required minLength={3} maxLength={64} pattern="[A-Za-z0-9._-]+" autoComplete="off" autoCapitalize="none" /></label>
        <label>Account type<select name="role"><option value="teacher">Teacher</option><option value="student">Student</option></select></label>
        <label>Temporary password<input name="temporaryPassword" type="password" required minLength={12} maxLength={72} autoComplete="new-password" /><span className="text-xs muted">At least 12 characters; share before submitting.</span></label>
      </fieldset><div><button disabled={busy}>{busy ? 'Saving…' : 'Create account'}</button></div></form>
    </section>
    {error && <p role="alert" className="error">{error} <button className="secondary ml-3" disabled={busy} onClick={() => setRefresh(x => x + 1)}>Reload accounts</button></p>}
    {success && <p role="status" className="success">{success}</p>}
    {resetAccount && <section className="panel"><h2>Reset password for {resetAccount.fullName}</h2><p className="muted">This signs the account out on every device and requires a password change at next login.</p><form className="stack" onSubmit={e => {
      e.preventDefault(); const temporaryPassword = new FormData(e.currentTarget).get('temporaryPassword');
      void action(async () => { await mutate(`admin/accounts/${resetAccount.id}/reset`, { temporaryPassword }); setResetAccount(null); setSuccess('Temporary password set. Existing sessions have been revoked.'); });
    }}><label>New temporary password<input name="temporaryPassword" type="password" required minLength={12} maxLength={72} autoComplete="new-password" autoFocus disabled={busy} /></label><div className="actions"><button disabled={busy}>Reset password</button><button type="button" className="secondary" disabled={busy} onClick={() => setResetAccount(null)}>Cancel</button></div></form></section>}
    <section className="panel"><h2>School accounts</h2><p className="muted">Page {page} · Up to 50 accounts per page</p>
      {loading ? <p role="status">Loading accounts…</p> : accounts.length ? accounts.map(a => <article className="account-row" key={a.id}><div><p><strong>{a.fullName}</strong></p><p className="muted text-sm">{a.username} · {a.role} · {a.status}{a.mustChangePassword ? ' · Password change required' : ''}</p></div>{a.role !== 'admin' && <div className="actions"><button className="secondary" disabled={busy} onClick={() => setResetAccount(a)}>Reset password</button><button className="secondary" disabled={busy} onClick={() => {
        const status = a.status === 'active' ? 'inactive' : 'active';
        if (!window.confirm(`${status === 'inactive' ? 'Deactivate' : 'Activate'} ${a.fullName}'s account? Existing sessions will be revoked.`)) return;
        void action(async () => { await mutate(`admin/accounts/${a.id}/status`, { status }); setSuccess('Account status updated.'); });
      }}>{a.status === 'active' ? 'Deactivate' : 'Activate'}</button>{a.role === 'teacher' && <><MutationButton label="Delete" path={`admin/accounts/${a.id}/delete`} body={{}} confirmation={`Permanently delete ${a.fullName}'s teacher account? This cannot be undone. Used accounts or accounts with linked records must be deactivated instead.`} onDone={() => setRefresh(x => x + 1)} /><details><summary>Edit</summary><p className="muted text-sm">Correcting the account signs the teacher out. Their assignments and records are retained.</p><ActionForm label="Save teacher" reset={false} onSave={async form => { await mutate(`admin/accounts/${a.id}/edit`, Object.fromEntries(form)); setRefresh(x => x + 1); }}><label>Full name<input name="fullName" defaultValue={a.fullName} required maxLength={120} /></label><label>Username<input name="username" defaultValue={a.username} required minLength={3} maxLength={64} pattern="[A-Za-z0-9._-]+" /></label></ActionForm></details></>}</div>}</article>) : <p className="muted">No accounts on this page.</p>}
      <nav className="actions mt-6" aria-label="Account pages"><button className="secondary" disabled={page === 1 || loading || busy} onClick={() => setPage(p => p - 1)}>Previous</button><button className="secondary" disabled={accounts.length < 50 || loading || busy} onClick={() => setPage(p => p + 1)}>Next</button></nav>
    </section>
  </div>;
}
