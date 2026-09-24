'use client';
import { useState } from 'react';
import type { studentManagementService } from '@/server/student-management';
import { mutate } from './auth-forms';
import { ActionForm, LoadState, SelectField, useRemote } from './management-shared';
type Service = ReturnType<typeof studentManagementService>;
type ClassOption = Awaited<ReturnType<Service['classOptions']>>[number];
type StudentRow = Awaited<ReturnType<Service['list']>>[number];
type StudentDetail = Awaited<ReturnType<Service['details']>>;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
const labelClass = (c: ClassOption) => `${c.year} · ${c.division} · ${c.grade} · ${c.section}`;
const guardianBody = (form: FormData) => ({ fullName: form.get('fullName'), phone: form.get('phone'), whatsapp: form.get('whatsapp') ?? '', whatsappConsent: form.get('whatsappConsent') === 'on', relationship: form.get('relationship'), isPrimary: form.get('isPrimary') === 'on' });

export function StudentManager({ isAdmin, initialClassId = '' }: { isAdmin: boolean; initialClassId?: string }) {
  const options = useRemote<{ classes: ClassOption[] }>('/api/student-management/options');
  const [classId, setClassId] = useState(initialClassId); const [query, setQuery] = useState(''); const [page, setPage] = useState(1); const [selectedId, setSelectedId] = useState('');
  const scope = classId ? `classId=${encodeURIComponent(classId)}` : '';
  const canList = isAdmin || Boolean(classId);
  const list = useRemote<{ students: StudentRow[] }>(canList ? `/api/student-management?${scope}&page=${page}&q=${encodeURIComponent(query)}` : null);
  const classes = options.data?.classes ?? [];
  return <div className="stack"><LoadState {...options} retry={options.reload} />
    {!options.loading && !isAdmin && !classes.length && <section className="panel"><h2>No incharge responsibilities</h2><p className="muted">Only the assigned class incharge can manage student profiles and guardian contacts.</p></section>}
    {(isAdmin || classes.length > 0) && <>
      <section className="panel"><h2>Find students</h2><div className="grid"><label>Class<select value={classId} onChange={e => { setClassId(e.target.value); setSelectedId(''); setPage(1); }}><option value="">{isAdmin ? 'All students, including unenrolled' : 'Choose your incharge class'}</option>{classes.map(c => <option key={c.id} value={c.id}>{labelClass(c)}</option>)}</select></label>
        <form className="actions items-end" onSubmit={e => { e.preventDefault(); setQuery(String(new FormData(e.currentTarget).get('query') ?? '')); setPage(1); setSelectedId(''); }}><label className="grow">Name or portal ID<input name="query" maxLength={100} type="search" /></label><button>Search</button></form></div>
        <p className="muted text-sm mt-3">Class filters show enrollments covering today. Use a student’s record to see past and future enrollments.</p>
      </section>
      {(isAdmin || classId) && <details className="panel"><summary>Add a student</summary><div className="mt-5"><ActionForm key={`create:${classId}`} label="Add student" onSave={async form => { const result = await mutate(`student-management?${scope}`, Object.fromEntries(form)); list.reload(); setSelectedId(result.student.id); }}>
        <label>Full name<input name="fullName" required maxLength={120} /></label><label>Portal ID<input name="portalId" required minLength={3} maxLength={64} pattern="[A-Za-z0-9._-]+" /></label>
        <SelectField label="Class and year" name="academicClassId" defaultValue={classId} options={classes.filter(c => isAdmin || c.id === classId).map(c => ({ id: c.id, label: labelClass(c) }))} />
        <label>Enrollment start date<input type="date" name="startsOn" defaultValue={today()} required /></label>
      </ActionForm><p className="muted text-sm mt-4">The student record is created first. An administrator can add portal access from Accounts using the same portal ID.</p></div></details>}
      {canList && <section className="panel"><h2>Students</h2><LoadState {...list} retry={list.reload} />{list.data && <>{list.data.students.length === 0 && <p className="muted">No students found on this page.</p>}{list.data.students.map(s => <article className="account-row" key={s.id}><div><strong>{s.fullName}</strong><p className="muted text-sm">{s.portalId} · {s.status} · {s.userId ? 'Portal account linked' : 'No portal account'}</p></div><button className="secondary" onClick={() => setSelectedId(s.id)}>Manage {s.portalId}</button></article>)}<nav className="actions mt-5" aria-label="Student pages"><button className="secondary" disabled={page === 1 || list.loading} onClick={() => { setPage(p => p - 1); setSelectedId(''); }}>Previous</button><span>Page {page}</span><button className="secondary" disabled={list.data.students.length < 50 || list.loading} onClick={() => { setPage(p => p + 1); setSelectedId(''); }}>Next</button></nav></>}</section>}
      {selectedId && <StudentEditor key={`${selectedId}:${classId}`} id={selectedId} scope={scope} isAdmin={isAdmin} classes={classes} onChanged={list.reload} onClose={() => setSelectedId('')} />}
    </>}
  </div>;
}
function StudentEditor({ id, scope, isAdmin, classes, onChanged, onClose }: { id: string; scope: string; isAdmin: boolean; classes: ClassOption[]; onChanged: () => void; onClose: () => void }) {
  const remote = useRemote<{ student: StudentDetail }>(`/api/student-management/${id}?${scope}`); const student = remote.data?.student;
  const base = `student-management/${id}`;
  async function save(action: string, body: unknown) { await mutate(`${base}/${action}?${scope}`, body); remote.reload(); onChanged(); }
  return <section className="panel stack" aria-label="Student details"><div className="actions justify-between"><h2 className="mb-0">Student details</h2><button className="secondary" onClick={onClose}>Close details</button></div><LoadState {...remote} retry={remote.reload} />{student && <>
    <p className="muted">{student.portalId} · {student.status}</p>
    <ActionForm key={`name:${student.fullName}`} label="Save name" reset={false} onSave={form => save('profile', { fullName: form.get('fullName') })}><label>Student name<input name="fullName" defaultValue={student.fullName} maxLength={120} required /></label></ActionForm>
    <div><h2>Enrollment history</h2>{student.history.length ? student.history.map(e => <div className="account-row" key={e.id}><div><strong>{e.year} · {e.grade} · {e.section}</strong><p className="muted text-sm">{e.startsOn} to {e.endsOn ?? `${e.yearEndsOn} (school year end)`}</p></div></div>) : <p className="muted">No enrollment yet.</p>}</div>
    {isAdmin && <details><summary>{student.history.length ? 'Promote or transfer to another class' : 'Enroll this student'}</summary><p className="muted mt-3">A new record will be added. Any open previous enrollment ends the day before the new start date, or at its academic year end, whichever comes first.</p><ActionForm label="Save enrollment" onSave={async form => {
      if (!window.confirm('Save this enrollment and close any previous open enrollment?')) throw new Error('Enrollment change cancelled.');
      await save('enrollment', { ...Object.fromEntries(form), expectedEnrollmentId: student.history[0]?.id ?? null });
    }}><SelectField label="Destination class and year" name="academicClassId" options={classes.map(c => ({ id: c.id, label: labelClass(c) }))} /><label>Start date<input type="date" name="startsOn" required defaultValue={today()} /></label></ActionForm></details>}
    <details><summary>Change student status</summary><p className="muted mt-3">A departure or inactive status closes the open enrollment on the chosen date and deactivates the linked login. Reactivating a student does not reopen enrollment or reactivate their account; an administrator handles those separately.</p><ActionForm label="Update status" reset={false} onSave={async form => {
      if (!window.confirm('Update student status? A departure or inactive status closes the enrollment and signs the student out.')) throw new Error('Status change cancelled.');
      await mutate(`${base}/status?${scope}`, Object.fromEntries(form)); onChanged(); onClose();
    }}><label>Status<select name="status" defaultValue={student.status}>{['active', 'inactive', 'transferred', 'withdrawn', 'graduated'].map(status => <option value={status} key={status}>{status}</option>)}</select></label><label>Effective date<input type="date" name="effectiveOn" required defaultValue={today()} max={today()} /></label></ActionForm></details>
    <div><h2>Parents and guardians</h2><p className="muted">Use international phone numbers, for example +923001234567. One linked guardian can be the primary contact.</p>{student.guardians.length === 0 && <p className="muted">No guardian contacts recorded.</p>}{student.guardians.map(g => <article className="guardian-record" key={g.linkId}><strong>{g.fullName}</strong> {g.isPrimary && <span className="tag">Primary contact</span>}<p className="muted text-sm">{g.relationship} · {g.phone}{g.whatsapp ? ` · WhatsApp ${g.whatsapp}${g.whatsappOptInAt ? ' · consent recorded' : ' · no consent'}` : ''}</p><details><summary>Edit guardian</summary><div className="mt-4"><ActionForm label="Save guardian" reset={false} onSave={form => save(`guardians/${g.linkId}`, guardianBody(form))}><GuardianFields guardian={g} /></ActionForm></div></details></article>)}</div>
    <details><summary>Add a new guardian</summary><div className="mt-4"><ActionForm label="Add guardian" onSave={form => save('guardians', guardianBody(form))}><GuardianFields /></ActionForm></div></details>
    {isAdmin && <ExistingGuardian onLink={body => save('guardians', body)} />}
  </>}</section>;
}
function GuardianFields({ guardian }: { guardian?: StudentDetail['guardians'][number] }) {
  return <><label>Guardian name<input name="fullName" required maxLength={120} defaultValue={guardian?.fullName} /></label><label>Phone number<input type="tel" name="phone" required placeholder="+923001234567" maxLength={16} defaultValue={guardian?.phone} /></label><label>WhatsApp number (optional)<input type="tel" name="whatsapp" maxLength={16} placeholder="+923001234567" defaultValue={guardian?.whatsapp ?? ''} /></label><label className="checkbox-label"><input type="checkbox" name="whatsappConsent" defaultChecked={Boolean(guardian?.whatsappOptInAt)} />Guardian consented to school result messages on WhatsApp</label><label>Relationship<input name="relationship" required maxLength={60} placeholder="Mother, father, guardian…" defaultValue={guardian?.relationship} /></label><label className="checkbox-label"><input type="checkbox" name="isPrimary" defaultChecked={guardian?.isPrimary ?? false} />Primary contact</label></>;
}
function ExistingGuardian({ onLink }: { onLink: (body: unknown) => Promise<void> }) {
  const [query, setQuery] = useState(''); const search = useRemote<{ guardians: { id: string; fullName: string; phone: string }[] }>(query ? `/api/admin/guardians?q=${encodeURIComponent(query)}` : null);
  return <details><summary>Link an existing guardian (for siblings)</summary><p className="muted mt-3">Search before creating a duplicate contact. Changes to a shared contact apply to every linked student.</p><form className="actions items-end" onSubmit={e => { e.preventDefault(); setQuery(String(new FormData(e.currentTarget).get('query') ?? '').trim()); }}><label className="grow">Guardian name or phone<input name="query" minLength={2} maxLength={100} required /></label><button>Find guardian</button></form><LoadState {...search} retry={search.reload} />{search.data && (search.data.guardians.length ? <div className="mt-4"><ActionForm label="Link guardian" onSave={form => onLink({ guardianId: form.get('guardianId'), relationship: form.get('relationship'), isPrimary: form.get('isPrimary') === 'on' })}><SelectField name="guardianId" label="Matching guardian" options={search.data.guardians.map(g => ({ id: g.id, label: `${g.fullName} · ${g.phone}` }))} /><label>Relationship<input name="relationship" required maxLength={60} /></label><label className="checkbox-label"><input name="isPrimary" type="checkbox" />Primary contact</label></ActionForm></div> : <p className="muted mt-3">No matching guardians found.</p>)}</details>;
}
