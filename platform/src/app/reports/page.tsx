import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/server/runtime';
import { AppError } from '@/server/errors';
import { ReportManager } from '@/components/report-manager';
export const dynamic = 'force-dynamic';
export default async function ReportsPage() {
  let user; try { user = await currentUser(true); } catch (e) { if (e instanceof AppError && e.status === 401) redirect('/'); throw e; }
  if (user.mustChangePassword) redirect('/change-password');
  return <main className="shell"><Link href="/dashboard" className="brand">TISS · Dashboard</Link><h1 className="mt-8">Reports</h1><ReportManager /></main>;
}
