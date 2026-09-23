'use client';
import { useEffect, useRef, useState } from 'react';
import type { remarkService } from '@/server/remarks';
import { ActionForm, LoadState, useRemote } from './management-shared';
import { mutate } from './auth-forms';
type Service = ReturnType<typeof remarkService>;
type Options = Awaited<ReturnType<Service['options']>>;
type Listing = Awaited<ReturnType<Service['list']>>;
type Remark = Listing['records'][number]['remark'];
type Pupil = Awaited<ReturnType<Service['roster']>>[number];
const categories = ['academic', 'homework', 'behaviour', 'discipline', 'attendance_concern', 'cleanliness', 'positive_achievement', 'general'];
const label = (v: string) => v.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const fields = (form: FormData) => ({ category: form.get('category'), content: form.get('content'), parentVisible: form.get('parentVisible') === 'on', studentVisible: form.get('studentVisible') === 'on' });

export function RemarkManager({ initialClassId = '' }: { initialClassId?: string }) {
  const options = useRemote<Options>('/api/remarks/options'); const [classId, setClassId] = useState(initialClassId); const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(''); const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false);
  const remote = useRemote<Listing>(classId ? `/api/remarks?classId=${classId}&page=${page}` : null);
  const guard = () => !busy && (!dirty || window.confirm('Discard unsaved remark changes?'));
  function reset() { setEditing(''); setDirty(false); }
  function done() { reset(); remote.reload(); }
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty || busy) { e.preventDefault(); e.returnValue = ''; } };
    const navigate = (e: MouseEvent) => { if ((dirty || busy) && (e.target as HTMLElement).closest('a[href]') && (busy || !window.confirm('Discard unsaved remark changes?'))) { e.preventDefault(); e.stopPropagation(); } };
    window.addEventListener('beforeunload', warn); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', navigate, true); };
  }, [dirty, busy]);
  return <div className="stack"><p className="muted">Remarks stay internal unless their requested audiences are approved by an administrator or the class incharge. Any edit removes approval. Parent visibility prepares a future parent report; it sends no message.</p><LoadState {...options} retry={options.reload} />{options.data && <>
    <section className="panel"><label>Class<select value={classId} disabled={busy} onChange={e => { if (guard()) { reset(); setClassId(e.target.value); setPage(1); } }}><option value="">Choose a class</option>{options.data.classes.map(c => <option key={c.classId} value={c.classId}>{c.year} · {c.division} · {c.grade} · {c.section}</option>)}</select></label>{options.data.classes.length === 0 && <p className="muted mt-4">No available classes. Your administrator must configure or assign a class first.</p>}</section>
    {classId && <><div className="actions">{options.data.canCreate && <button disabled={busy} onClick={() => { if (guard()) { setDirty(false); setEditing('new'); } }}>New remark</button>}<button className="secondary" disabled={busy} onClick={() => { if (guard()) { reset(); remote.reload(); } }}>Reload latest</button></div>
      {editing === 'new' && <CreateRemark key={classId} classId={classId} today={options.data.today} dirty={() => setDirty(true)} busy={setBusy} done={done} />}
      <LoadState {...remote} retry={remote.reload} />{remote.data && <section className="panel"><h2>{remote.data.canReview ? 'Class remarks and visibility requests' : 'Your remarks'}</h2>{!remote.data.records.length && <p className="muted">No remarks on this page.</p>}{remote.data.records.map(({ remark: r, studentName, portalId, authorName }) => <article key={r.id} className="remark-record"><div className="actions"><strong>{studentName} · {portalId}</strong><span className="tag">{label(r.status)}</span></div><p className="muted text-sm">{label(r.category)} · {r.onDate} · By {authorName}</p><p className="remark-text">{r.content}</p><p className="muted text-sm">Requested audience: {[r.parentVisible ? 'Parents' : '', r.studentVisible ? 'Student' : ''].filter(Boolean).join(' and ') || 'Internal only'}</p>{r.reviewNote && <p className="muted text-sm">Reviewer note: {r.reviewNote}</p>}
        <div className="actions">{r.authorId === remote.data!.userId && <button className="secondary" disabled={busy} onClick={() => { if (guard()) { setDirty(false); setEditing(r.id); } }}>Edit</button>}{remote.data!.canReview && ['pending', 'approved'].includes(r.status) && <button className="secondary" disabled={busy} onClick={() => { if (guard()) { setDirty(false); setEditing(`review:${r.id}`); } }}>{r.status === 'approved' ? 'Withdraw visibility' : 'Review request'}</button>}</div>
        {editing === r.id && <div className="mt-4" onChange={() => setDirty(true)}><ActionForm label="Save remark" reset={false} onSave={async form => { setBusy(true); try { await mutate(`remarks/${r.id}/edit`, { ...fields(form), version: r.version }); done(); } finally { setBusy(false); } }}><RemarkFields remark={r} /></ActionForm><p className="muted text-sm mt-3">Saving withdraws any existing approval and requests a fresh review if an external audience is selected.</p></div>}
        {editing === `review:${r.id}` && <div className="mt-4" onChange={() => setDirty(true)}><ActionForm label="Save review" reset={false} onSave={async form => { if (!window.confirm('Apply this visibility decision to the displayed remark and requested audiences?')) throw new Error('Review cancelled.'); setBusy(true); try { await mutate(`remarks/${r.id}/review`, { version: r.version, decision: form.get('decision'), note: form.get('note') }); done(); } finally { setBusy(false); } }}><label>Decision<select name="decision" defaultValue={r.status === 'approved' ? 'reject' : 'approve'}>{r.status === 'pending' && <option value="approve">Approve requested audiences</option>}<option value="reject">{r.status === 'approved' ? 'Withdraw visibility' : 'Reject visibility'}</option></select></label><label>Reviewer note (required for rejection/withdrawal)<textarea name="note" maxLength={500} rows={3} /></label></ActionForm></div>}
      </article>)}<div className="actions mt-4"><button className="secondary" disabled={busy || page === 1} onClick={() => { if (guard()) { reset(); setPage(p => p - 1); } }}>Previous</button><span>Page {page}</span><button className="secondary" disabled={busy || remote.data.records.length < 50} onClick={() => { if (guard()) { reset(); setPage(p => p + 1); } }}>Next</button></div></section>}
    </>}
  </>}</div>;
}
function RemarkFields({ remark }: { remark?: Remark }) {
  return <><label>Category<select name="category" defaultValue={remark?.category ?? 'general'}>{categories.map(c => <option key={c} value={c}>{label(c)}</option>)}</select></label><label>Remark<textarea name="content" defaultValue={remark?.content} required maxLength={3000} rows={5} /></label><label className="checkbox-label"><input type="checkbox" name="parentVisible" defaultChecked={remark?.parentVisible ?? false} />Request parent visibility</label><label className="checkbox-label"><input type="checkbox" name="studentVisible" defaultChecked={remark?.studentVisible ?? false} />Request student visibility</label></>;
}
function CreateRemark({ classId, today, dirty, busy, done }: { classId: string; today: string; dirty: () => void; busy: (v: boolean) => void; done: () => void }) {
  const [date, setDate] = useState(today); const [saving, setSaving] = useState(false); const requestId = useRef('');
  const roster = useRemote<{ students: Pupil[] }>(date ? `/api/remarks/roster?classId=${classId}&date=${date}` : null);
  return <section className="panel"><h2>New remark</h2><label>Remark date<input type="date" value={date} max={today} disabled={saving} onChange={e => { if (window.confirm('Change the date and clear the new remark form?')) { setDate(e.target.value); requestId.current = ''; dirty(); } }} /></label><LoadState {...roster} retry={roster.reload} />{roster.data && <div className="mt-4" onChange={dirty}><ActionForm key={date} label="Save remark" onSave={async form => { requestId.current ||= crypto.randomUUID(); busy(true); setSaving(true); try { await mutate(`remarks?classId=${classId}`, { id: requestId.current, studentId: form.get('studentId'), onDate: date, ...fields(form) }); done(); } finally { busy(false); setSaving(false); } }}><label>Student enrolled on this date<select name="studentId" required defaultValue=""><option value="">Choose a student</option>{roster.data.students.map(s => <option key={s.studentId} value={s.studentId}>{s.portalId} · {s.fullName}</option>)}</select></label><RemarkFields /></ActionForm>{roster.data.students.length === 0 && <p className="muted mt-3">No students enrolled on this date.</p>}</div>}</section>;
}
export function StudentRemarks() {
  const [page, setPage] = useState(1); const remote = useRemote<{ remarks: Awaited<ReturnType<Service['ownVisible']>> }>(`/api/students/me/remarks?page=${page}`);
  return <section className="panel mt-8"><h2>Approved remarks</h2><LoadState {...remote} retry={remote.reload} />{remote.data && <>{!remote.data.remarks.length && <p className="muted">No approved remarks on this page.</p>}{remote.data.remarks.map(r => <article key={r.id} className="remark-record"><p className="muted text-sm">{r.onDate} · {label(r.category)}</p><p className="remark-text">{r.content}</p></article>)}<div className="actions"><button className="secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page}</span><button className="secondary" disabled={remote.data.remarks.length < 50} onClick={() => setPage(p => p + 1)}>Next</button></div></>}</section>;
}
