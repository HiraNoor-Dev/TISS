import { database } from '@/db/client';
import { applyWhatsAppWebhook, verifyWhatsAppSignature, whatsappConfig } from '@/server/whatsapp';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  const config = whatsappConfig(); const query = new URL(request.url).searchParams;
  if (!config.enabled || query.get('hub.mode') !== 'subscribe' || query.get('hub.verify_token') !== config.verifyToken) return new Response('Not found', { status: 404, headers: noStore });
  return new Response(query.get('hub.challenge') ?? '', { status: 200, headers: { ...noStore, 'Content-Type': 'text/plain' } });
}
export async function POST(request: Request) {
  const config = whatsappConfig();
  if (!config.enabled) return new Response('Not found', { status: 404, headers: noStore });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 1_000_000) return new Response('Too large', { status: 413, headers: noStore });
  if (!verifyWhatsAppSignature(raw, request.headers.get('x-hub-signature-256'), config.appSecret)) return new Response('Invalid signature', { status: 401, headers: noStore });
  try { await applyWhatsAppWebhook(database(), JSON.parse(raw)); return new Response('OK', { status: 200, headers: noStore }); }
  catch { return new Response('Invalid payload', { status: 400, headers: noStore }); }
}
