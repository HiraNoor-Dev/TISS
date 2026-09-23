'use client';
import { useState } from 'react';
import type { academicAdminService } from '@/server/academic-admin';
import { mutate } from './auth-forms';
import { ActionForm, LoadState, MutationButton, SelectField, useRemote } from './management-shared';
export type AcademicConfig = Awaited<ReturnType<ReturnType<typeof academicAdminService>['overview']>>;
const labels = { years: 'Academic years', divisions: 'Divisions', grades: 'Grades', sections: 'Sections', classes: 'Classes by year', subjects: 'Subjects' };
type Kind = keyof typeof labels;
export function classLabel(data: AcademicConfig, classId: string) {
  const cls = data.classes.find(c => c.id === classId); const section = data.sections.find(s => s.id === cls?.sectionId); const grade = data.grades.find(g => g.id === section?.gradeId); const division = data.divisions.find(d => d.id === grade?.divisionId);
  return `${data.years.find(y => y.id === cls?.academicYearId)?.name ?? 'Year'} · ${division?.name ?? ''} · ${grade?.name ?? ''} · ${section?.name ?? ''}`;
}
export function classIsActive(data: AcademicConfig, classId: string) {
  const cls = data.classes.find(c => c.id === classId); const section = data.sections.find(s => s.id === cls?.sectionId); const grade = data.grades.find(g => g.id === section?.gradeId);
  return Boolean(cls?.isActive && section?.isActive && grade?.isActive && data.divisions.find(d => d.id === grade.divisionId)?.isActive && data.years.find(y => y.id === cls.academicYearId)?.isActive);
}
export function AcademicManager() {
  const remote = useRemote<AcademicConfig>('/api/admin/academic'); const [kind, setKind] = useState<Kind>('years'); const data = remote.data;
  return <div className="stack"><p className="muted">Start with a year and division, then add grades, sections, classes and subjects. Select the current year when you are ready for teachers to use it.</p>
    <LoadState {...remote} retry={remote.reload} />{data && <>
      <div className="actions" aria-label="Configuration categories">{Object.entries(labels).map(([key, label]) => <button key={key} className={kind === key ? '' : 'secondary'} aria-pressed={kind === key} onClick={() => setKind(key as Kind)}>{label}</button>)}</div>
      <section className="panel"><h2>Add {labels[kind].toLowerCase()}</h2><ActionForm key={kind} label="Add record" onSave={async form => { await mutate(`admin/academic/${kind}`, Object.fromEntries(form)); remote.reload(); }}>
        {kind !== 'classes' && <label>Name<input name="name" required maxLength={100} placeholder={kind === 'years' ? '2026–27' : undefined} /></label>}
        {kind === 'years' && <><label>Start date<input name="startsOn" type="date" required /></label><label>End date<input name="endsOn" type="date" required /></label></>}
        {kind === 'grades' && <SelectField label="Division" name="divisionId" options={data.divisions.filter(d => d.isActive).map(d => ({ id: d.id, label: d.name }))} />}
        {kind === 'sections' && <SelectField label="Grade" name="gradeId" options={data.grades.filter(g => g.isActive && data.divisions.find(d => d.id === g.divisionId)?.isActive).map(g => ({ id: g.id, label: `${data.divisions.find(d => d.id === g.divisionId)?.name} · ${g.name}` }))} />}
        {kind === 'classes' && <><SelectField label="Academic year" name="academicYearId" options={data.years.filter(y => y.isActive).map(y => ({ id: y.id, label: y.name }))} /><SelectField label="Section" name="sectionId" options={data.sections.filter(s => s.isActive && data.grades.find(g => g.id === s.gradeId)?.isActive && data.divisions.find(d => d.id === data.grades.find(g => g.id === s.gradeId)?.divisionId)?.isActive).map(s => ({ id: s.id, label: `${data.divisions.find(d => d.id === data.grades.find(g => g.id === s.gradeId)?.divisionId)?.name} · ${data.grades.find(g => g.id === s.gradeId)?.name} · ${s.name}` }))} /></>}
        {kind === 'subjects' && <label>Subject code<input name="code" required maxLength={24} pattern="[A-Za-z0-9_-]+" placeholder="ENG" /></label>}
      </ActionForm></section>
      <section className="panel"><h2>{labels[kind]}</h2>{data[kind].length === 0 ? <p className="muted">No records yet. Add the first one above.</p> : data[kind].map(record => {
        let label = 'name' in record ? record.name : classLabel(data, record.id);
        if ('divisionId' in record) label = `${data.divisions.find(d => d.id === record.divisionId)?.name} · ${label}`;
        if ('gradeId' in record) label = `${data.grades.find(g => g.id === record.gradeId)?.name} · ${label}`;
        return <article className="account-row" key={record.id}><div><strong>{label}</strong><p className="muted text-sm">{record.isActive ? 'Active' : 'Inactive'}{'startsOn' in record ? ` · ${record.startsOn} to ${record.endsOn}` : ''}{'code' in record ? ` · ${record.code}` : ''}</p>{'isCurrent' in record && record.isCurrent && <span className="tag">Current academic year</span>}</div><div className="actions">
          {'isCurrent' in record && !record.isCurrent && record.isActive && <MutationButton label="Make current" path={`admin/academic/years/${record.id}/current`} body={{}} confirmation="Switch the current academic year? Teacher access will follow assignments for the selected year." onDone={remote.reload} />}
          {!('isCurrent' in record && record.isCurrent) && <MutationButton label={record.isActive ? 'Deactivate' : 'Activate'} path={`admin/academic/${kind}/${record.id}/status`} body={{ isActive: !record.isActive }} confirmation={record.isActive ? `Deactivate ${label}? Related records will be retained, but this hierarchy will no longer be available for current teacher work.` : undefined} onDone={remote.reload} />}
          <MutationButton label="Delete" path={`admin/academic/${kind}/${record.id}/delete`} body={{}} confirmation={`Permanently delete ${label}? This cannot be undone. Records with linked data cannot be deleted.`} onDone={remote.reload} />
          {'name' in record && <details><summary>Edit</summary><ActionForm label="Save correction" reset={false} onSave={async form => { await mutate(`admin/academic/${kind}/${record.id}/edit`, Object.fromEntries(form)); remote.reload(); }}><label>Name<input name="name" defaultValue={record.name} required maxLength={100} /></label>{'code' in record && <label>Subject code<input name="code" defaultValue={record.code} required maxLength={24} pattern="[A-Za-z0-9_-]+" /></label>}</ActionForm></details>}
        </div></article>;
      })}{kind === 'classes' && <p className="muted">Correct class spelling by editing its grade or section. To change the year or section, delete an unused class and create it again.</p>}</section>
    </>}</div>;
}
