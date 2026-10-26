import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export const base = process.env.API_BASE_URL ?? 'http://localhost:3004';
export function example() { return { eventId: `demo-${randomUUID()}`, matchId: 'match-demo', playerId: 'player-demo', score: 1500, finishedAt: new Date().toISOString() }; }
export async function publish(data: ReturnType<typeof example>) {
  const response = await fetch(`${base}/api/v1/events/match-finished`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 202, await response.clone().text());
  const body = await response.json() as { status: string; messageId: string };
  assert.equal(body.status, 'accepted'); assert.ok(body.messageId);
}
export async function result(eventId: string, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  do {
    const response = await fetch(`${base}/api/v1/events/${eventId}`, { signal: AbortSignal.timeout(5000) });
    if (response.status === 200) return await response.json() as { eventId: string; status: string; result: { id: string; score: number } };
    assert.equal(response.status, 202);
    await delay(200);
  } while (Date.now() < deadline);
  throw new Error(`Timeout aguardando processamento: ${eventId}`);
}
async function main() {
  const data = example();
  await publish(data); const first = await result(data.eventId);
  assert.equal(first.result.score, data.score);
  await publish(data); const second = await result(data.eventId);
  assert.equal(first.result.id, second.result.id);
  const invalid = await fetch(`${base}/api/v1/events/match-finished`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, score: -1 }), signal: AbortSignal.timeout(5000) });
  assert.equal(invalid.status, 400);
  console.log(JSON.stringify({ demo: 'PASS', eventId: data.eventId, checks: ['publicação 202', 'resultado 200', 'resultado estável ao repetir eventId', 'validação 400'] }));
}
import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
