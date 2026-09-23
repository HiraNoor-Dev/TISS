import { z } from 'zod';
export const username = z.string().trim().toLowerCase().min(3).max(64).regex(/^[a-z0-9._-]+$/);
// bcrypt accepts at most 72 bytes, not 72 Unicode characters.
export const password = z.string().min(12).max(72).refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes');
export const loginInput = z.object({ username, password: z.string().min(1).max(256) }).strict();
export const changePasswordInput = z.object({ currentPassword: z.string().min(1).max(256), newPassword: password }).strict();
export const accountInput = z.object({ username, fullName: z.string().trim().min(1).max(120), role: z.enum(['teacher', 'student']), temporaryPassword: password }).strict();
export const uuid = z.string().uuid();
