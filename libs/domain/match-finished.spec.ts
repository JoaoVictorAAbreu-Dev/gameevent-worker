import { describe, expect, it } from '@jest/globals';
import { envelope, parseEvent, payloadHash } from './match-finished.js';

const data = { eventId: 'evt-001', matchId: 'match-123', playerId: 'player-456', score: 1500, finishedAt: '2026-10-26T18:00:00Z' };
describe('contrato do evento', () => {
  it('aceita o exemplo do contrato', () => expect(parseEvent(JSON.stringify(envelope(data)))).toEqual(envelope(data)));
  it.each([
    { score: -1 }, { score: 1000001 }, { score: 1.5 }, { score: '1500' },
    { eventId: '' }, { matchId: ' ' }, { playerId: 'x'.repeat(101) },
    { finishedAt: '2026-02-30T18:00:00Z' }, { finishedAt: '2026-10-26' }, { finishedAt: '2026-10-26T18:00:00' },
    { unknown: true },
  ])('rejeita payload inválido %j', patch => {
    expect(() => parseEvent(JSON.stringify(envelope({ ...data, ...patch } as typeof data)))).toThrow();
  });
  it.each(['null', '[]', '{}', '{', JSON.stringify({ ...envelope(data), version: 2 }), JSON.stringify({ ...envelope(data), user: 'x' })])('rejeita envelope inválido %s', body => expect(() => parseEvent(body)).toThrow());
  it('normaliza fuso horário no hash', () => {
    expect(payloadHash(envelope(data))).toBe(payloadHash(envelope({ ...data, finishedAt: '2026-10-26T15:00:00-03:00' })));
  });
  it('detecta conteúdo diferente', () => expect(payloadHash(envelope(data))).not.toBe(payloadHash(envelope({ ...data, score: 1 }))));
});
