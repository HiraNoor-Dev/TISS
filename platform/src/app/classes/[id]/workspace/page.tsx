import { staffPageUser } from '@/server/page-user';
import { ClassroomWorkspace } from '@/components/classroom-workspace';
import { redirect } from 'next/navigation';
import { uuid } from '@/server/validation';
export const dynamic = 'force-dynamic';
export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await staffPageUser(); if (user.role !== 'teacher') redirect('/dashboard');
  const { id } = await params; if (!uuid.safeParse(id).success) redirect('/dashboard');
  return <ClassroomWorkspace key={id} classId={id} />;
}
