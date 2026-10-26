import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { EventPublisher } from './publisher.js';
import { envelope } from '../domain/match-finished.js';
process.env.MESSAGING_MODE = 'local';
process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';
const data = { eventId: 'evt-001', matchId: 'match-123', playerId: 'player-456', score: 1500, finishedAt: '2026-10-26T18:00:00Z' };
afterEach(() => { jest.restoreAllMocks(); });
describe('publicação SNS', () => {
  it('publica o envelope e confirma o MessageId', async () => {
    const send = jest.spyOn(SNSClient.prototype, 'send').mockResolvedValue({ MessageId: 'msg-1' } as never);
    const publisher = new EventPublisher();
    try {
      expect(await publisher.publish(data)).toEqual({ eventId: data.eventId, status: 'accepted', messageId: 'msg-1' });
      const command = send.mock.calls[0][0] as PublishCommand;
      expect(JSON.parse(command.input.Message!)).toEqual(envelope(data));
    } finally { publisher.onModuleDestroy(); }
  });
  it.each(['rejection', 'missing-id'])('não confirma sucesso em %s', async failure => {
    const send = jest.spyOn(SNSClient.prototype, 'send');
    if (failure === 'rejection') send.mockRejectedValue(new Error('upstream') as never);
    else send.mockResolvedValue({} as never);
    const publisher = new EventPublisher();
    try { await expect(publisher.publish(data)).rejects.toMatchObject({ status: 503 }); }
    finally { publisher.onModuleDestroy(); }
  });
});
