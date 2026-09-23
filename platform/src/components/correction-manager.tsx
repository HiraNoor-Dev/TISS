'use client';
import { useState } from 'react';
import { mutate } from './auth-forms';
import { ActionForm, LoadState, useRemote } from './management-shared';

type Kind = 'marks' | 'attendance' | 'observations';
type Row = { id: string; version: number; fullName: string; portalId: string; label: string; status?: string; marks?: number | null; total?: number; rating?: string; note?: string; author?: string };
export function CorrectionManager() {
  const options = useRemote<{ classes: { classId: string; year: string; grade: string; section: string }[] }>('/api/reports/options');
  const [query, setQuery] = useState<{ classId: string; date: string; kind: Kind } | null>(null); const [page, setPage] = useState(1);
  const records = useRemote<{ records: Row[]; hasMore: boolean }>(query ? `/api/admin/corrections?${new URLSearchParams({ ...query, page: String(page) })}` : null);
  return <section className="panel stack mt-6"><h2>Correct a saved classroom record</h2><p>Choose the original class and date. Corrections retain the original teacher and enrollment. Every correction requires a reason and appears in activity history. Teachers enter missing records through their class workspace.</p>
    <LoadState {...options} retry={options.reload} /><form className="actions" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); setPage(1); setQuery({ classId: String(f.get('classId')), date: String(f.get('date')), kind: String(f.get('kind')) as Kind }); records.reload(); }}>
      <label>Class<select name="classId" required><option value="">Choose…</option>{options.data?.classes.map(c => <option key={c.classId} value={c.classId}>{c.year} · {c.grade} · {c.section}</option>)}</select></label>
      <label>Date<input name="date" type="date" required /></label><label>Record type<select name="kind"><option value="marks">Marks</option><option value="attendance">Attendance</option><option value="observations">Observations</option></select></label><button>Load records</button>
    </form><LoadState {...records} retry={records.reload} />
    {query && records.data?.records.map(r => <details className="panel" key={`${r.id}:${r.version}`}><summary>{r.portalId} · {r.fullName} · {r.label}{r.author ? ` · ${r.author}` : ''}</summary><ActionForm reset={false} label="Save correction" onSave={async f => {
      const data = { id: r.id, version: r.version, reason: String(f.get('reason')), kind: query.kind };
      const status = String(f.get('status')); const value = String(f.get('marks') ?? '').trim();
      await mutate('admin/corrections', { ...data, ...(query.kind === 'marks' ? { status, marks: status === 'present' && value !== '' ? Number(value) : null } : query.kind === 'attendance' ? { status } : { rating: String(f.get('rating')), note: String(f.get('note')) }) }); records.reload();
    }}>
      {query.kind !== 'observations' ? <label>Status<select name="status" defaultValue={r.status}>{(query.kind === 'marks' ? ['present', 'absent', 'not_attempted'] : ['present', 'absent', 'leave']).map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</select></label> : <><label>Rating<select name="rating" defaultValue={r.rating}>{['good', 'needs_improvement', 'concern'].map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</select></label><label>Observation<textarea name="note" maxLength={1000} defaultValue={r.note} /></label></>}
      {query.kind === 'marks' && <label>Marks (out of {r.total}; only used for Present)<input name="marks" type="number" min={0} max={r.total} step="0.01" defaultValue={r.marks ?? ''} /></label>}
      <label>Reason for correction<textarea name="reason" required minLength={5} maxLength={500} /></label>
    </ActionForm></details>)}
    {records.data?.records.length === 0 && <p>No saved records match this selection.</p>}
    {query && <div className="actions"><button className="secondary" disabled={page === 1 || records.loading} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page}</span><button className="secondary" disabled={!records.data?.hasMore || records.loading} onClick={() => setPage(p => p + 1)}>Next</button></div>}
  </section>;
}
