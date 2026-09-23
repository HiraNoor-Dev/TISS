'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { classroomService } from '@/server/classroom';
import { mutate } from './auth-forms';
import { ActionForm, LoadState, useRemote } from './management-shared';
type Service = ReturnType<typeof classroomService>;
type Workspace = Awaited<ReturnType<Service['workspace']>>;
type Test = Awaited<ReturnType<Service['tests']>>[number];
type Marks = Awaited<ReturnType<Service['marks']>>;
type Attendance = Awaited<ReturnType<Service['attendance']>>;
type Observations = Awaited<ReturnType<Service['observations']>>;
type Mode = 'marks' | 'attendance' | 'observations';
const label = (value: string) => value.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const categories = ['cleanliness', 'uniform', 'personal_hygiene', 'discipline', 'general_conduct'];

export function ClassroomWorkspace({ classId }: { classId: string }) {
  const remote = useRemote<Workspace>(`/api/classroom/${classId}`); const cls = remote.data;
  const [mode, setMode] = useState<Mode>('marks'); const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState(false);
  const guard = () => !saving && (!dirty || window.confirm('Discard unsaved entries and change context?'));
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty || saving) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving]);
  return <main className="shell"><Link href="/dashboard" onClick={e => { if (!guard()) e.preventDefault(); }} className="brand">TISS · Dashboard</Link><h1 className="mt-8">Class workspace</h1><LoadState {...remote} retry={remote.reload} />{cls && <>
    <p className="muted">{cls.year} · {cls.division} · {cls.grade} · {cls.section}</p>
    <nav className="actions management-nav" aria-label="Class workspace">
      {(['marks', 'attendance', 'observations'] as const).map(m => <button key={m} disabled={saving} className={mode === m ? '' : 'secondary'} aria-pressed={mode === m} onClick={() => { if (m !== mode && guard()) { setDirty(false); setMode(m); } }}>{m === 'marks' ? 'Tests & marks' : label(m)}</button>)}
      <Link className="button secondary" href={`/classes/${classId}`} onClick={e => { if (!guard()) e.preventDefault(); }}>Student roster</Link>
      <Link className="button secondary" href={`/remarks?classId=${classId}`} onClick={e => { if (!guard()) e.preventDefault(); }}>Remarks</Link>
      <Link className="button secondary" href="/reports" onClick={e => { if (!guard()) e.preventDefault(); }}>Reports</Link>
    </nav>
    {mode === 'marks' ? <TestsPanel key="tests" cls={cls} guard={guard} dirty={setDirty} saving={setSaving} /> : <DailyPanel key={mode} cls={cls} mode={mode} guard={guard} dirty={setDirty} saving={setSaving} />}
  </>}</main>;
}
type PanelProps = { cls: Workspace; guard: () => boolean; dirty: (v: boolean) => void; saving: (v: boolean) => void };
function TestsPanel({ cls, guard, dirty, saving }: PanelProps) {
  const [subject, setSubject] = useState(cls.subjects[0]?.id ?? ''); const [selected, setSelected] = useState(''); const [page, setPage] = useState(1);
  const tests = useRemote<{ tests: Test[] }>(subject ? `/api/classroom/${cls.classId}/tests?subjectId=${subject}&page=${page}` : null);
  const requestId = useRef('');
  if (!cls.subjects.length) return <section className="panel"><p className="muted">You need a subject assignment to create tests or enter marks. Your incharge role alone does not grant marks access.</p></section>;
  return <div className="stack"><section className="panel"><label>Assigned subject<select value={subject} onChange={e => { if (guard()) { dirty(false); setSubject(e.target.value); setSelected(''); setPage(1); } }}>{cls.subjects.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label></section>
    <details className="panel" key={subject}><summary>Create a test</summary><p className="muted mt-3">The test date determines its student roster. Test details are fixed after creation to preserve recorded results.</p>
      <ActionForm label="Create test" onSave={async form => {
        if (!guard()) throw new Error('Keep or save your current marks before creating a test.');
        requestId.current ||= crypto.randomUUID(); saving(true);
        try { const result = await mutate(`classroom/${cls.classId}/tests`, { id: requestId.current, subjectId: subject, name: form.get('name'), onDate: form.get('onDate'), totalMarks: Number(form.get('totalMarks')), description: form.get('description') }); requestId.current = ''; dirty(false); tests.reload(); setSelected(result.test.id); }
        finally { saving(false); }
      }}><label>Test name<input name="name" required maxLength={120} /></label><label>Date<input name="onDate" type="date" required min={cls.startsOn} max={cls.today < cls.endsOn ? cls.today : cls.endsOn} defaultValue={cls.today} /></label><label>Total marks<input name="totalMarks" type="number" min="0.01" max="999999.99" step="0.01" required /></label><label>Description or type (optional)<input name="description" maxLength={1000} /></label></ActionForm>
    </details>
    <section className="panel"><h2>Tests</h2><LoadState {...tests} retry={tests.reload} />{tests.data && <>{tests.data.tests.length === 0 && <p className="muted">No tests yet. Create a test to open its complete roster.</p>}{tests.data.tests.map(t => <article className="account-row" key={t.id}><div><strong>{t.name}</strong><p className="muted">{t.onDate} · {t.totalMarks} marks</p></div><button className="secondary" onClick={() => { if (guard()) { dirty(false); setSelected(t.id); } }}>Enter marks</button></article>)}<div className="actions mt-4"><button className="secondary" disabled={page === 1} onClick={() => { if (guard()) { dirty(false); setSelected(''); setPage(p => p - 1); } }}>Previous</button><span>Page {page}</span><button className="secondary" disabled={tests.data.tests.length < 50} onClick={() => { if (guard()) { dirty(false); setSelected(''); setPage(p => p + 1); } }}>Next</button></div></>}</section>
    {selected && <Sheet key={`${subject}:${selected}`} path={`classroom/${cls.classId}/tests/${selected}`} mode="marks" dirty={dirty} saving={saving} />}
  </div>;
}
function DailyPanel({ cls, mode, guard, dirty, saving }: PanelProps & { mode: 'attendance' | 'observations' }) {
  const [date, setDate] = useState(cls.today < cls.endsOn ? cls.today : cls.endsOn); const [category, setCategory] = useState('cleanliness');
  const path = `classroom/${cls.classId}/${mode}?date=${date}${mode === 'observations' ? `&category=${category}` : ''}`;
  return <div className="stack"><section className="panel"><div className="grid"><label>Date<input type="date" value={date} min={cls.startsOn} max={cls.today < cls.endsOn ? cls.today : cls.endsOn} onChange={e => { if (guard()) { dirty(false); setDate(e.target.value); } }} /></label>{mode === 'observations' && <label>Category<select value={category} onChange={e => { if (guard()) { dirty(false); setCategory(e.target.value); } }}>{categories.map(c => <option key={c} value={c}>{label(c)}</option>)}</select></label>}</div>
    <p className="muted mt-4 mb-0">{mode === 'attendance' ? 'Any teacher assigned to this class can enter daily attendance. New rows default to Present for review; nothing is recorded until you save.' : 'Record only the students you observed. Blank rows are skipped. These entries belong to you; other teachers keep their own observations. No parent or student sharing occurs here.'}</p></section>
    {date && <Sheet key={path} path={path} mode={mode} dirty={dirty} saving={saving} />}
  </div>;
}
function Sheet({ path, mode, dirty, saving }: { path: string; mode: Mode; dirty: (v: boolean) => void; saving: (v: boolean) => void }) {
  const remote = useRemote<Marks | Attendance | Observations>(`/api/${path}`);
  return <section className="panel"><LoadState {...remote} retry={remote.reload} />{remote.data && <SheetEditor data={remote.data} mode={mode} path={path} reload={remote.reload} dirty={dirty} saving={saving} />}</section>;
}
type Draft = { studentId: string; value: string; marks: string; note: string; existing: boolean };
function SheetEditor({ data, mode, path, reload, dirty, saving }: { data: Marks | Attendance | Observations; mode: Mode; path: string; reload: () => void; dirty: (v: boolean) => void; saving: (v: boolean) => void }) {
  const test = 'test' in data ? data.test : null;
  const [version, setVersion] = useState('test' in data ? data.test.version : data.version);
  const [rows, setRows] = useState<Draft[]>(() => data.roster.map(p => {
    const record = data.records.find(r => r.studentId === p.studentId);
    return { studentId: p.studentId, value: record ? ('rating' in record ? record.rating : record.status) : mode === 'attendance' ? 'present' : '', marks: record && 'marks' in record && record.marks !== null ? String(record.marks) : '', note: record && 'note' in record ? record.note : '', existing: Boolean(record) };
  }));
  const [busy, setBusy] = useState(false); const lock = useRef(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [changed, setChanged] = useState(false);
  function change(index: number, patch: Partial<Draft>) { setRows(old => old.map((r, i) => i === index ? { ...r, ...patch } : r)); setChanged(true); dirty(true); setMessage(''); }
  const pending = rows.filter(r => !r.existing).length;
  return <form onSubmit={async e => {
    e.preventDefault(); if (lock.current) return;
    const selected = rows.filter(r => r.value);
    if (!selected.length) { setError('Enter at least one record to save.'); return; }
    lock.current = true; setBusy(true); saving(true); setError(''); setMessage('');
    try {
      const payload = selected.map(r => mode === 'marks' ? { studentId: r.studentId, status: r.value, marks: r.value === 'present' ? (r.marks === '' ? null : Number(r.marks)) : null } : mode === 'attendance' ? { studentId: r.studentId, status: r.value } : { studentId: r.studentId, rating: r.value, note: r.note });
      const result = await mutate(path, { version, rows: payload }); setVersion(result.version); dirty(false); setChanged(false); setRows(old => old.map(r => r.value ? { ...r, existing: true } : r)); setMessage(`${selected.length} records saved.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save.'); }
    finally { lock.current = false; setBusy(false); saving(false); }
  }}>
    <h2>{test ? `${test.name} · ${test.onDate} · out of ${test.totalMarks}` : label(mode)}</h2>
    <p className="muted">{rows.length} students · {pending} without saved records{changed ? ' · Unsaved changes' : ''}</p>
    {mode === 'marks' && <p className="muted">Blank rows remain unrecorded. Choose Present with marks (including zero), Absent, or Not Attempted.</p>}
    {!rows.length && <p className="muted">No students were enrolled on this date.</p>}
    <fieldset disabled={busy} className="border-0 p-0 m-0"><div className="classroom-rows">{rows.map((r, index) => {
      const pupil = data.roster[index]; const statuses = mode === 'marks' ? ['present', 'absent', 'not_attempted'] : mode === 'attendance' ? ['present', 'absent', 'leave'] : ['good', 'needs_improvement', 'concern'];
      return <article className="classroom-row" key={r.studentId}><div><strong>{pupil.fullName}</strong><p className="muted text-sm mb-0">{pupil.portalId} · {r.existing ? 'Recorded' : 'Not recorded'}</p></div><label>{mode === 'observations' ? 'Rating' : 'Status'}<select aria-label={`${pupil.portalId} ${mode === 'observations' ? 'rating' : 'status'}`} value={r.value} onChange={e => change(index, { value: e.target.value, ...(mode === 'marks' && e.target.value !== 'present' ? { marks: '' } : {}) })}>{mode !== 'attendance' && <option value="" disabled={r.existing}>Not recorded</option>}{statuses.map(v => <option key={v} value={v}>{label(v)}</option>)}</select></label>
        {mode === 'marks' && <label>Marks<input aria-label={`${pupil.portalId} marks`} type="number" inputMode="decimal" min="0" max={test?.totalMarks} step="0.01" disabled={r.value !== 'present'} required={r.value === 'present'} value={r.marks} onChange={e => change(index, { marks: e.target.value })} /></label>}
        {mode === 'observations' && <label>Optional note<input aria-label={`${pupil.portalId} note`} maxLength={1000} disabled={!r.value} value={r.note} onChange={e => change(index, { note: e.target.value })} /></label>}
      </article>;
    })}</div></fieldset>
    {error && <p role="alert" className="error mt-4">{error}</p>}{message && <p role="status" className="success mt-4">{message}</p>}
    <div className="actions sheet-save"><button disabled={busy || !rows.length}>{busy ? 'Saving…' : `Save ${mode}`}</button><button type="button" className="secondary" disabled={busy} onClick={() => { if (!changed || window.confirm('Discard your unsaved changes and reload the latest records?')) { dirty(false); reload(); } }}>Reload latest</button></div>
  </form>;
}
