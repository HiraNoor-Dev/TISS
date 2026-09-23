'use client';
import { useState } from 'react';
import { mutate } from './auth-forms';
import { classIsActive, classLabel, type AcademicConfig } from './academic-manager';
import { ActionForm, LoadState, MutationButton, SelectField, useRemote } from './management-shared';
export function AssignmentManager() {
  const remote = useRemote<AcademicConfig>('/api/admin/academic'); const data = remote.data;
  const [showRevoked, setShowRevoked] = useState(false);
  return <div className="stack"><p className="muted">Assign teachers to a class and subject for an academic year. Incharge responsibility is assigned separately. Revoke an existing incharge before assigning a replacement.</p><LoadState {...remote} retry={remote.reload} />{data && <>
    <div className="grid">{(['teaching', 'incharge'] as const).map(kind => <section className="panel" key={kind}><h2>{kind === 'teaching' ? 'Teaching assignment' : 'Class incharge'}</h2><ActionForm label="Assign teacher" onSave={async form => { await mutate(`admin/assignments/${kind}`, Object.fromEntries(form)); remote.reload(); }}>
      <SelectField label="Teacher" name="teacherId" options={data.teachers.filter(t => t.status === 'active').map(t => ({ id: t.id, label: `${t.fullName} (${t.username})` }))} />
      <SelectField label="Class and academic year" name="academicClassId" options={data.classes.filter(c => classIsActive(data, c.id)).map(c => ({ id: c.id, label: classLabel(data, c.id) }))} />
      {kind === 'teaching' && <SelectField label="Subject" name="subjectId" options={data.subjects.filter(s => s.isActive).map(s => ({ id: s.id, label: s.name }))} />}
    </ActionForm></section>)}</div>
    <label className="checkbox-label"><input type="checkbox" checked={showRevoked} onChange={e => setShowRevoked(e.target.checked)} />Show revoked assignments</label>
    {(['teaching', 'incharge'] as const).map(kind => <section className="panel" key={kind}><h2>{kind === 'teaching' ? 'Teaching assignments' : 'Class incharges'}</h2>{(kind === 'teaching' ? data.teaching : data.incharges).length === 0 && <p className="muted">No assignments yet.</p>}{(kind === 'teaching' ? data.teaching : data.incharges).filter(a => showRevoked || !a.revokedAt).map(a => {
      const teacher = data.teachers.find(t => t.id === a.teacherId); const active = teacher?.status === 'active' && classIsActive(data, a.academicClassId) && (!('subjectId' in a) || data.subjects.find(s => s.id === a.subjectId)?.isActive);
      return <article className="account-row" key={a.id}><div><strong>{teacher?.fullName}</strong><p className="muted text-sm">{classLabel(data, a.academicClassId)}{'subjectId' in a ? ` · ${data.subjects.find(s => s.id === a.subjectId)?.name}` : ' · Incharge'}</p>{!active && <span className="tag">Unavailable while account or structure is inactive</span>}</div><div className="actions">{a.revokedAt ? <span className="tag">Revoked</span> : <MutationButton label="Revoke" path={`admin/assignments/${kind}/${a.id}/revoke`} body={{}} confirmation="Revoke this responsibility? The teacher will immediately lose the access it grants." onDone={remote.reload} />}<MutationButton label="Delete" path={`admin/assignments/${kind}/${a.id}/delete`} body={{}} confirmation="Permanently delete this mistaken assignment? This cannot be undone. Classes with student or classroom history require revocation instead." onDone={remote.reload} /></div></article>;
    })}</section>)}
  </>}</div>;
}
