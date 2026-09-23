'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { mutate } from './auth-forms';

export function AdminNavigation({ active }: { active: string }) {
  return <nav className="actions management-nav" aria-label="Administration">{[['accounts', '/dashboard', 'Accounts'], ['academic', '/admin/academic', 'Academic structure'], ['assignments', '/admin/assignments', 'Assignments'], ['students', '/students', 'Students & guardians'], ['remarks', '/remarks', 'Remarks'], ['activity', '/admin/activity', 'Activity & corrections']].map(([id, href, label]) => <Link key={id} className={`button ${active === id ? '' : 'secondary'}`} href={href} aria-current={active === id ? 'page' : undefined}>{label}</Link>)}</nav>;
}
export function useRemote<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [revision, setRevision] = useState(0);
  const [loadedKey, setLoadedKey] = useState(''); const requestKey = `${url ?? ''}:${revision}`;
  const reload = useCallback(() => setRevision(v => v + 1), []);
  useEffect(() => {
    setData(null); setError('');
    if (!url) { setLoading(false); return; }
    const controller = new AbortController(); setLoading(true);
    fetch(url, { cache: 'no-store', signal: controller.signal }).then(async r => { const result = await r.json(); if (!r.ok) throw new Error(result.error ?? 'Unable to load records.'); return result; })
      .then(result => { if (!controller.signal.aborted) setData(result); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) { setLoadedKey(`${url}:${revision}`); setLoading(false); } });
    return () => controller.abort();
  }, [url, revision]);
  // Hide the previous response during the render that changes class/student context.
  const current = loadedKey === requestKey;
  return { data: current ? data : null, loading: Boolean(url) && (!current || loading), error: current ? error : '', reload };
}
export function LoadState({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  return <>{loading && <p role="status" className="muted">Loading…</p>}{error && <div role="alert" className="error">{error} <button className="secondary ml-3" onClick={retry}>Try again</button></div>}</>;
}
export function ActionForm({ children, onSave, label = 'Save', success = 'Saved successfully.', reset = true }: { children: React.ReactNode; onSave: (form: FormData) => Promise<unknown>; label?: string; success?: string; reset?: boolean }) {
  const [busy, setBusy] = useState(false); const busyRef = useRef(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  return <form className="stack" onSubmit={async e => {
    e.preventDefault(); if (busyRef.current) return;
    const element = e.currentTarget; const form = new FormData(element); busyRef.current = true; setBusy(true); setError(''); setMessage('');
    try { await onSave(form); if (reset) element.reset(); setMessage(success); }
    catch (e) { setError(e instanceof Error ? e.message : 'The change could not be saved.'); }
    finally { busyRef.current = false; setBusy(false); }
  }}><fieldset className="grid border-0 p-0 m-0 min-w-0" disabled={busy}>{children}</fieldset>{error && <p role="alert" className="error">{error}</p>}{message && <p role="status" className="success">{message}</p>}<div><button disabled={busy}>{busy ? 'Saving…' : label}</button></div></form>;
}
export function MutationButton({ path, body, label, confirmation, onDone }: { path: string; body: unknown; label: string; confirmation?: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false); const lock = useRef(false); const [error, setError] = useState('');
  return <div><button className="secondary" disabled={busy} onClick={async () => {
    if (lock.current || (confirmation && !window.confirm(confirmation))) return;
    lock.current = true; setBusy(true); setError('');
    try { await mutate(path, body); onDone(); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save.'); } finally { lock.current = false; setBusy(false); }
  }}>{busy ? 'Saving…' : label}</button>{error && <p className="error mt-2" role="alert">{error}</p>}</div>;
}
export function SelectField({ label, name, options, required = true, defaultValue = '' }: { label: string; name: string; options: { id: string; label: string }[]; required?: boolean; defaultValue?: string }) {
  return <label>{label}<select name={name} required={required} defaultValue={defaultValue}><option value="">Choose…</option>{options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>;
}
