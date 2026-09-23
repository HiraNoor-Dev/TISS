import Link from 'next/link';
import { staffPageUser } from '@/server/page-user';
import { AssignmentManager } from '@/components/assignment-manager';
import { AdminNavigation } from '@/components/management-shared';
export const dynamic = 'force-dynamic';
export default async function AssignmentsPage() {
  await staffPageUser(true);
  return <main className="shell"><Link href="/dashboard" className="brand">TISS</Link><h1 className="mt-8">Teacher responsibilities</h1><AdminNavigation active="assignments" /><AssignmentManager /></main>;
}
