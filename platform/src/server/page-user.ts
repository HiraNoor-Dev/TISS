import 'server-only';
import { redirect } from 'next/navigation';
import { currentUser } from './runtime';
import { AppError } from './errors';
export async function staffPageUser(adminOnly = false) {
  let user;
  try { user = await currentUser(true); } catch (error) { if (error instanceof AppError && error.status === 401) redirect('/'); throw error; }
  if (user.mustChangePassword) redirect('/change-password');
  if (user.role === 'student' || (adminOnly && user.role !== 'admin')) redirect('/dashboard');
  return user;
}
