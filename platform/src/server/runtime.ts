import 'server-only';
import { cookies } from 'next/headers';
import { database } from '../db/client';
import { authService } from './auth';
import { cookieName } from './http';
export function runtimeConfig() {
  const origin = process.env.APP_ORIGIN;
  const rateSecret = process.env.AUTH_RATE_SECRET;
  if (!origin || !rateSecret || rateSecret.length < 32) throw new Error('Set APP_ORIGIN and AUTH_RATE_SECRET');
  return { origin, rateSecret, production: process.env.NODE_ENV === 'production' };
}
export async function currentUser(allowPasswordChange = false) {
  const config = runtimeConfig();
  return authService(database(), config.rateSecret).authenticate((await cookies()).get(cookieName(config.production))?.value, allowPasswordChange);
}
