'use client';
import { useState } from 'react';
import type { reportService } from '@/server/reports';
import { LoadState, useRemote } from './management-shared';
type Service = ReturnType<typeof reportService>;
type Options = Awaited<ReturnType<Service['options']>>;
type Report = Awaited<ReturnType<Service['generate']>>;
const label = (s: string) => s.replaceAll('_', ' ');
export function ReportManager() {
  const options = useRemote<Options>('/api/reports/options'); const [classId, setClassId] = useState('');
  return <div className="stack"><LoadState {...options} retry={options.reload} />{options.data && <><label>Class and academic year<select value={classId} onChange={e => setClassId(e.target.value)}><option value="">Choose…</option>{options.data.classes.map(c => <option key={c.classId} value={c.classId}>{c.year} · {c.grade} · {c.section}</option>)}</select></label>{options.data.classes.filter(c => c.classId === classId).map(c => <ReportFilters key={c.classId} options={options.data!} cls={c} />)}</>}</div>;
}
function ReportFilters({ options, cls }: { options: Options; cls: Options['classes'][number] }) {
  const self = options.role === 'student'; const [audience, setAudience] = useState(self ? 'student' : cls.canReview ? 'staff' : 'class');
  const [from, setFrom] = useState(cls.startsOn ?? ''); const [to, setTo] = useState(cls.endsOn ?? ''); const [url, setUrl] = useState<string | null>(null);
  const roster = useRemote<{ students: { id: string; fullName: string; portalId: string }[] }>(!self && audience !== 'class' && from && to ? `/api/reports/roster?classId=${cls.classId}&from=${from}&to=${to}` : null);
  const report = useRemote<Report>(url);
  function clear() { setUrl(null); }
  return <><section className="panel"><form className="stack" onChange={clear} onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); const q = new URLSearchParams({ classId: cls.classId, audience, from, to }); for (const name of ['studentId', 'subjectId']) { const value = String(form.get(name) ?? ''); if (value) q.set(name, value); } const next = `/api/reports?${q}`; if (url === next) report.reload(); else setUrl(next); }}><div className="grid">
    <label>Report<select value={audience} onChange={e => setAudience(e.target.value)}>{self ? <option value="student">My overall report</option> : <>{cls.canReview && <><option value="staff">Student overall report (staff)</option><option value="parent">Parent-friendly report</option></>}<option value="class">Class marks & attendance</option></>}</select></label>
    <label>Period preset<select defaultValue="year" onChange={e => { if (e.target.value === 'year') { setFrom(cls.startsOn ?? ''); setTo(cls.endsOn ?? ''); } if (e.target.value === 'month') { const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date()); setFrom(today.slice(0, 8) + '01'); setTo(today); } }}><option value="year">Academic year</option><option value="month">Current month to date</option><option value="custom">Custom dates</option></select></label>
    <label>From<input type="date" value={from} required onChange={e => setFrom(e.target.value)} /></label><label>To<input type="date" value={to} required onChange={e => setTo(e.target.value)} /></label>
    {!self && audience !== 'class' && <label>Student<select key={`${from}:${to}`} name="studentId" required defaultValue=""><option value="">Choose…</option>{roster.data?.students.map(p => <option key={p.id} value={p.id}>{p.portalId} · {p.fullName}</option>)}</select></label>}
    {audience === 'class' && <label>Subject<select name="subjectId" required={!cls.canReview} defaultValue=""><option value="">{cls.canReview ? 'All subjects' : 'Choose your assigned subject'}</option>{options.subjects.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>}
    </div><LoadState {...roster} retry={roster.reload} /><div><button disabled={roster.loading || report.loading}>Generate report</button></div></form></section><LoadState {...report} retry={report.reload} />{report.data && <ReportView report={report.data} />}</>;
}
function ReportView({ report: r }: { report: Report }) {
  const name = (id: string) => { const p = r.students.find(s => s.id === id); return p ? `${p.portalId} · ${p.fullName}` : ''; };
  return <section className="panel stack"><div><h2>{r.audience === 'parent' ? 'Student progress summary' : r.audience === 'class' ? 'Class marks and attendance' : 'Student overall report'}</h2><p className="muted">{r.context.year} · {r.context.division} · {r.context.grade} · {r.context.section}<br />{r.from} to {r.to}</p>{r.audience !== 'class' && <strong>{r.students[0]?.fullName} · {r.students[0]?.portalId}</strong>}</div>
    <div><h2>Academic performance</h2>{!r.marks.length ? <p>No tests recorded in this period.</p> : <div className="report-table"><table><thead><tr><th>Student</th><th>Date / test</th><th>Subject</th><th>Status</th><th>Marks</th><th>%</th></tr></thead><tbody>{r.marks.map(m => <tr key={`${m.studentId}:${m.testId}`}><td>{name(m.studentId)}</td><td>{m.date}<br />{m.name}</td><td>{m.subject}</td><td>{label(m.status)}</td><td>{m.marks === null ? '—' : `${m.marks} / ${m.total}`}</td><td>{m.percentage === null ? '—' : `${m.percentage}%`}</td></tr>)}</tbody></table></div>}</div>
    <div><h2>Attendance summary</h2>{r.attendance.map(a => <article className="account-row" key={a.studentId}><div><strong>{name(a.studentId)}</strong><p>Present: {a.present} · Absent: {a.absent} · Leave: {a.leave} · Missing entries: {a.missing}</p>{a.present + a.absent + a.leave === 0 && <p className="muted">No attendance recorded for this student in the period.</p>}</div></article>)}<p className="muted text-sm">Counts cover saved class attendance sheets. Missing entries are blank students on those sheets; days without a sheet are not counted. No attendance percentage or overall grade is assumed.</p></div>
    {r.audience === 'staff' && <div><h2>Observation history (staff only)</h2>{r.observations.length ? r.observations.map((o, i) => <article className="remark-record" key={i}><strong>{o.date} · {label(o.category)} · {label(o.rating)}</strong><p className="remark-text">{o.note}</p></article>) : <p>No observations recorded in this period.</p>}</div>}
    {r.audience !== 'class' && <div><h2>Approved remarks</h2>{r.remarks.length ? r.remarks.map((m, i) => <article className="remark-record" key={i}><strong>{m.date} · {label(m.category)}</strong><p className="remark-text">{m.content}</p></article>) : <p>No approved remarks for this audience in the period.</p>}</div>}
  </section>;
}
