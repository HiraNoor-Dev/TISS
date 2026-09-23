import Link from 'next/link';
import { staffPageUser } from '@/server/page-user';
import { AcademicManager } from '@/components/academic-manager';
import { AdminNavigation } from '@/components/management-shared';
export const dynamic = 'force-dynamic';
export default async function AcademicPage() {
  await staffPageUser(true);
  return <main className="shell"><Link href="/dashboard" className="brand">TISS</Link><h1 className="mt-8">Academic structure</h1><AdminNavigation active="academic" /><AcademicManager /></main>;
}
