import Link from 'next/link';
import { staffPageUser } from '@/server/page-user';
import { ActivityManager } from '@/components/activity-manager';
import { AdminNavigation } from '@/components/management-shared';
import { CorrectionManager } from '@/components/correction-manager';
export const dynamic = 'force-dynamic';
export default async function ActivityPage() {
  await staffPageUser(true);
  return <main className="shell"><Link href="/dashboard" className="brand">TISS</Link><h1 className="mt-8">School activity & corrections</h1><AdminNavigation active="activity" /><CorrectionManager /><ActivityManager /></main>;
}
