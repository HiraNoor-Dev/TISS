import Link from 'next/link';
import { staffPageUser } from '@/server/page-user';
import { StudentManager } from '@/components/student-manager';
import { AdminNavigation } from '@/components/management-shared';
export const dynamic = 'force-dynamic';
export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const user = await staffPageUser(); const { classId } = await searchParams;
  return <main className="shell"><Link href="/dashboard" className="brand">TISS</Link><h1 className="mt-8">Students & guardians</h1>{user.role === 'admin' ? <AdminNavigation active="students" /> : <p className="muted mb-6">Manage students in your assigned incharge classes. <Link href="/dashboard">Return to dashboard</Link></p>}<StudentManager isAdmin={user.role === 'admin'} initialClassId={classId} /></main>;
}
