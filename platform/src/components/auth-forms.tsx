'use client';
import { useState } from 'react';
export async function mutate(path: string, body: unknown) {
  const response = await fetch(`/api/${path}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.fields?.[0]?.message ?? data.error ?? 'The request failed.');
  return data;
}
export function LoginForm() {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <form className="stack" onSubmit={async e => {
    e.preventDefault(); setError(''); setBusy(true); const form = new FormData(e.currentTarget);
    try { const data = await mutate('auth/login', Object.fromEntries(form)); window.location.assign(data.mustChangePassword ? '/change-password' : '/dashboard'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in.'); setBusy(false); }
  }}>
    <label>Username or student portal ID<input name="username" autoComplete="username" required maxLength={64} autoCapitalize="none" spellCheck={false} /></label>
    <label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={256} /></label>
    {error && <p className="error" role="alert">{error}</p>}
    <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    <p className="muted text-sm mb-0">Need access or a password reset? Contact your school administrator.</p>
  </form>;
}
export function PasswordForm() {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <form className="stack" onSubmit={async e => {
    e.preventDefault(); setError(''); const form = new FormData(e.currentTarget);
    if (form.get('newPassword') !== form.get('confirmPassword')) { setError('New passwords do not match.'); return; }
    setBusy(true);
    try { await mutate('auth/password', { currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword') }); window.location.assign('/?passwordChanged=1'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to change password.'); setBusy(false); }
  }}>
    <label>Current or temporary password<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
    <label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={72} required aria-describedby="password-help" /></label>
    <p id="password-help" className="muted text-sm mb-0">Use at least 12 characters. A memorable passphrase works well. Maximum 72 UTF-8 bytes.</p>
    <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label>
    {error && <p className="error" role="alert">{error}</p>}
    <button disabled={busy}>{busy ? 'Updating…' : 'Change password and sign out'}</button>
  </form>;
}
export function LogoutButton() {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <div><button className="secondary" disabled={busy} onClick={async () => {
    setBusy(true); setError('');
    try { await mutate('auth/logout', {}); window.location.assign('/'); }
    catch { setError('Sign out failed. Please retry.'); setBusy(false); }
  }}>{busy ? 'Signing out…' : 'Sign out'}</button>{error && <p role="alert" className="error">{error}</p>}</div>;
}
