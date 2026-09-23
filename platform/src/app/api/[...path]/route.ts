import { database } from '@/db/client';
import { apiHandler } from '@/server/http';
import { runtimeConfig } from '@/server/runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try { return await apiHandler(database(), runtimeConfig())(request, (await context.params).path); }
  catch { return Response.json({ error: 'The service is not configured or is unavailable. Contact the administrator.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
export const GET = handle;
export const POST = handle;
