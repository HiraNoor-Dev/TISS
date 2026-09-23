'use client';
import { useState } from 'react';
import Link from 'next/link';
import { LoadState, useRemote } from './management-shared';

type Entry = { id: string; actor: string | null; action: string; entityId: string; before: unknown; after: unknown; createdAt: string };
export function ActivityManager() {
  const [page, setPage] = useState(1); const [filter, setFilter] = useState('');
  const summary = useRemote<{ pendingRemarks: number; activeTeachers: number; activeStudents: number; unassignedClasses: number }>('/api/admin/activity/summary');
  const logs = useRemote<{ entries: Entry[]; hasMore: boolean }>(`/api/admin/activity?page=${page}${filter}`);
  return <div className="stack mt-6">
    <LoadState {...summary} retry={summary.reload} />
    {summary.data && <section className="card"><h2>School overview</h2><p>Active teachers: {summary.data.activeTeachers} · Active students: {summary.data.activeStudents}</p><p><Link href="/remarks">Remarks awaiting approval: {summary.data.pendingRemarks}</Link></p><p><Link href="/admin/assignments">Current classes without an incharge: {summary.data.unassignedClasses}</Link></p></section>}
    <section className="card stack"><h2>Activity history</h2><p className="muted">Read-only history of saved changes. Times are displayed in your device’s time zone.</p>
      <form className="actions" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); const q = new URLSearchParams(); for (const name of ['action', 'entityId']) { const value = String(form.get(name) ?? '').trim(); if (value) q.set(name, value); } setPage(1); setFilter(q.size ? `&${q}` : ''); }}>
        <label>Exact action<input name="action" maxLength={100} placeholder="Optional" /></label><label>Record ID<input name="entityId" placeholder="Optional UUID" /></label><button>Filter</button>
      </form><LoadState {...logs} retry={logs.reload} />
      {logs.data?.entries.map(entry => <article className="card" key={entry.id}><p><strong>{entry.action}</strong> — {entry.actor ?? 'System'}</p><p className="muted">{new Date(entry.createdAt).toLocaleString()} · Record {entry.entityId}</p><details><summary>Change details</summary><div className="grid"><div><h3>Before</h3><pre className="whitespace-pre-wrap break-all">{JSON.stringify(entry.before, null, 2)}</pre></div><div><h3>After</h3><pre className="whitespace-pre-wrap break-all">{JSON.stringify(entry.after, null, 2)}</pre></div></div></details></article>)}
      {logs.data?.entries.length === 0 && <p>No matching activity.</p>}
      <div className="actions"><button className="secondary" disabled={page === 1 || logs.loading} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page}</span><button className="secondary" disabled={!logs.data?.hasMore || logs.loading} onClick={() => setPage(p => p + 1)}>Next</button><button className="secondary" onClick={() => { logs.reload(); summary.reload(); }}>Refresh</button></div>
    </section>
  </div>;
}
