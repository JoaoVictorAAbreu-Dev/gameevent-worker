import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { DeleteMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { EventConsumer } from './consumer.js';
import { EventProcessor } from '../domain/event-processor.js';
import { envelope } from '../domain/match-finished.js';
process.env.MESSAGING_MODE = 'local';
process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';
const data = { eventId: 'evt-001', matchId: 'match-123', playerId: 'player-456', score: 1500, finishedAt: '2026-10-26T18:00:00Z' };
const message = { Body: JSON.stringify(envelope(data)), ReceiptHandle: 'receipt-current', MessageId: 'msg-1' };
afterEach(() => { jest.restoreAllMocks(); });
describe('confirmação da mensagem', () => {
  it.each(['processed', 'duplicate'] as const)('exclui somente depois de %s', async result => {
    const steps: string[] = [];
    const process = jest.fn(async () => { steps.push('commit'); return result; });
    const send = jest.spyOn(SQSClient.prototype, 'send').mockImplementation((async () => { steps.push('delete'); return {}; }) as never);
    const consumer = new EventConsumer({ process } as unknown as EventProcessor);
    await consumer.handle(message, 'http://local/queue');
    expect(steps).toEqual(['commit', 'delete']);
    expect((send.mock.calls[0][0] as DeleteMessageCommand).input).toEqual({ QueueUrl: 'http://local/queue', ReceiptHandle: 'receipt-current' });
  });
  it('não exclui quando processamento falha', async () => {
    const send = jest.spyOn(SQSClient.prototype, 'send');
    const process = jest.fn(async () => { throw new Error('database unavailable'); });
    await expect(new EventConsumer({ process } as unknown as EventProcessor).handle(message, 'queue')).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it('não processa e não exclui payload inválido', async () => {
    const send = jest.spyOn(SQSClient.prototype, 'send');
    const process = jest.fn<EventProcessor['process']>();
    await expect(new EventConsumer({ process } as unknown as EventProcessor).handle({ ...message, Body: '{}' }, 'queue')).rejects.toThrow('INVALID_EVENT');
    expect(process).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  it('propaga falha na exclusão para permitir reentrega', async () => {
    jest.spyOn(SQSClient.prototype, 'send').mockRejectedValue(new Error('delete failed') as never);
    const process = jest.fn(async () => 'processed' as const);
    await expect(new EventConsumer({ process } as unknown as EventProcessor).handle(message, 'queue')).rejects.toThrow('delete failed');
    expect(process).toHaveBeenCalledTimes(1);
  });
});
