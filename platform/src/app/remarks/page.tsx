import Link from 'next/link';
import { staffPageUser } from '@/server/page-user';
import { AdminNavigation } from '@/components/management-shared';
import { RemarkManager } from '@/components/remark-manager';
export const dynamic = 'force-dynamic';
export default async function RemarksPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const user = await staffPageUser(); const { classId } = await searchParams;
  return <main className="shell"><Link className="brand" href="/dashboard">TISS · Dashboard</Link><h1 className="mt-8">Remarks</h1>{user.role === 'admin' && <AdminNavigation active="remarks" />}<RemarkManager initialClassId={classId} /></main>;
}
