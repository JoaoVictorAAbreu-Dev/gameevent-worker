import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/postgresql';
import request from 'supertest';
import { PublishCommand, DeleteTopicCommand } from '@aws-sdk/client-sns';
import { ChangeMessageVisibilityCommand, DeleteQueueCommand, ReceiveMessageCommand, SendMessageCommand } from '@aws-sdk/client-sqs';
import { ApiModule } from '../apps/api/app.module.js';
import { configureHttp } from '../apps/api/http.js';
import { MatchResult, ProcessedEvent } from '../libs/database/entities.js';
import { EventProcessor } from '../libs/domain/event-processor.js';
import { envelope } from '../libs/domain/match-finished.js';
import { EventPublisher } from '../libs/messaging/publisher.js';
import { EventConsumer } from '../libs/messaging/consumer.js';
import { awsClients } from '../libs/messaging/clients.js';
import { initMessaging } from '../docker/init-messaging.js';

let app: INestApplication;
let orm: MikroORM;
let processor: EventProcessor;
let resources: Awaited<ReturnType<typeof initMessaging>>;
const { sns, sqs } = awsClients();
const resourcePrefix = `test-${randomUUID()}`;
const fixture = () => ({ eventId: `evt-${randomUUID()}`, matchId: 'match-123', playerId: 'player-456', score: 1500, finishedAt: '2026-10-26T18:00:00Z' });
async function waitFor<T>(fn: () => Promise<T>, ready: (value: T) => boolean, timeout = 15000): Promise<T> {
  const deadline = Date.now() + timeout;
  do { const value = await fn(); if (ready(value)) return value; await delay(100); } while (Date.now() < deadline);
  throw new Error('Timeout aguardando condição');
}
beforeAll(async () => {
  resources = await initMessaging(resourcePrefix, 1, 2);
  process.env.SNS_TOPIC_ARN = resources.topicArn;
  process.env.SQS_QUEUE_URL = resources.queueUrl;
  const module = await Test.createTestingModule({ imports: [ApiModule] }).compile();
  app = module.createNestApplication(); configureHttp(app); await app.init();
  orm = app.get(MikroORM);
  await orm.migrator.up(); await orm.migrator.up();
  processor = new EventProcessor(orm.em);
});
beforeEach(async () => {
  await orm.em.fork().nativeDelete(MatchResult, {});
  await orm.em.fork().nativeDelete(ProcessedEvent, {});
});
afterAll(async () => {
  await app?.close();
  if (resources) {
    await sns.send(new DeleteTopicCommand({ TopicArn: resources.topicArn }));
    await sqs.send(new DeleteQueueCommand({ QueueUrl: resources.queueUrl }));
    await sqs.send(new DeleteQueueCommand({ QueueUrl: resources.dlqUrl }));
  }
  sns.destroy(); sqs.destroy();
});
describe('PostgreSQL real', () => {
  it('inicialização de mensageria reaplicável preserva os mesmos recursos', async () => {
    expect(await initMessaging(resourcePrefix, 1, 2)).toEqual(resources);
  });
  it('não deixa migrations pendentes após reaplicar', async () => expect(await orm.migrator.getPending()).toHaveLength(0));
  it('entidades e migrations possuem schema equivalente', async () => {
    expect((await orm.schema.getUpdateSchemaSQL()).trim()).toBe('');
  });
  it('persiste marcador e resultado e reconhece duplicata', async () => {
    const data = fixture();
    expect(await processor.process(envelope(data))).toBe('processed');
    expect(await processor.process(envelope(data))).toBe('duplicate');
    expect(await orm.em.fork().count(MatchResult)).toBe(1);
    expect(await orm.em.fork().count(ProcessedEvent)).toBe(1);
  });
  it('disputa concorrente gera exatamente um resultado', async () => {
    const data = fixture();
    const results = await Promise.all(Array.from({ length: 5 }, () => processor.process(envelope(data))));
    expect(results.filter(r => r === 'processed')).toHaveLength(1);
    expect(results.filter(r => r === 'duplicate')).toHaveLength(4);
    expect(await orm.em.fork().count(MatchResult)).toBe(1);
  });
  it('conteúdo diferente com mesmo eventId gera conflito', async () => {
    const data = fixture(); await processor.process(envelope(data));
    await expect(processor.process(envelope({ ...data, score: 5 }))).rejects.toThrow('EVENT_ID_CONFLICT');
    expect((await orm.em.fork().findOneOrFail(MatchResult, { processedEvent: { eventId: data.eventId } })).score).toBe(1500);
  });
  it('falha no resultado desfaz o marcador e permite nova tentativa', async () => {
    const data = fixture();
    await expect(processor.process(envelope({ ...data, score: -1 }))).rejects.toThrow();
    expect(await orm.em.fork().count(ProcessedEvent)).toBe(0);
    expect(await orm.em.fork().count(MatchResult)).toBe(0);
    expect(await processor.process(envelope(data))).toBe('processed');
  });
  it('eventIds diferentes podem registrar o mesmo match/player', async () => {
    await processor.process(envelope(fixture())); await processor.process(envelope(fixture()));
    expect(await orm.em.fork().count(MatchResult)).toBe(2);
  });
});
describe('contrato HTTP', () => {
  it('health confirma conexão com banco', async () => { await request(app.getHttpServer()).get('/api/v1/health').expect(200).expect({ status: 'ok', database: 'up' }); });
  it.each([{ score: -1 }, { score: 1.5 }, { extra: true }, { finishedAt: 'bad' }, { eventId: '' }])('rejeita entrada inválida %j', async patch => {
    const response = await request(app.getHttpServer()).post('/api/v1/events/match-finished').send({ ...fixture(), ...patch }).expect(400);
    expect(response.body.code).toBe('VALIDATION_ERROR'); expect(response.body.details.length).toBeGreaterThan(0);
  });
  it('publicação com endpoint inacessível retorna 503, nunca 202', async () => {
    const previous = process.env.AWS_ENDPOINT_URL;
    process.env.AWS_ENDPOINT_URL = 'http://127.0.0.1:1';
    const unavailable = new EventPublisher();
    process.env.AWS_ENDPOINT_URL = previous;
    let failedApp: INestApplication | undefined;
    try {
      const module = await Test.createTestingModule({ imports: [ApiModule] }).overrideProvider(EventPublisher).useValue(unavailable).compile();
      failedApp = module.createNestApplication(); configureHttp(failedApp); await failedApp.init();
      const response = await request(failedApp.getHttpServer()).post('/api/v1/events/match-finished').send(fixture()).expect(503);
      expect(response.body.code).toBe('PUBLISH_UNAVAILABLE');
      expect(response.body).not.toHaveProperty('messageId');
    } finally { await failedApp?.close(); unavailable.onModuleDestroy(); }
  });
  it('consulta desconhecida não afirma inexistência', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/events/${randomUUID()}`).expect(202);
    expect(response.body.status).toBe('not_available');
  });
  it('valida identificador da consulta', async () => { await request(app.getHttpServer()).get('/api/v1/events/a.b').expect(400); });
  it('retorna resposta explícita sem campos ORM', async () => {
    const data = fixture(); await processor.process(envelope(data));
    const response = await request(app.getHttpServer()).get(`/api/v1/events/${data.eventId}`).expect(200);
    expect(response.body.result).toMatchObject({ score: 1500, matchId: data.matchId });
    expect(response.body).not.toHaveProperty('payloadHash'); expect(response.body.result).not.toHaveProperty('processedEvent');
  });
  it('expõe OpenAPI com exemplos e respostas', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json').expect(200);
    expect(response.body.paths['/api/v1/events/match-finished'].post.responses).toHaveProperty('202');
    expect(response.body.paths['/api/v1/events/{eventId}'].get.responses).toHaveProperty('202');
  });
});
describe('SNS e SQS reais no emulador', () => {
  it('HTTP → SNS → SQS → worker → PostgreSQL → GET', async () => {
    const data = fixture();
    const consumer = new EventConsumer(processor); const running = consumer.run();
    try {
      const accepted = await request(app.getHttpServer()).post('/api/v1/events/match-finished').send(data).expect(202);
      expect(accepted.body.messageId).toBeTruthy();
      const result = await waitFor(() => request(app.getHttpServer()).get(`/api/v1/events/${data.eventId}`), response => response.status === 200);
      expect(result.body.result.score).toBe(1500);
    } finally { consumer.stop(); await running; }
  });
  it('crash após commit antes de delete não duplica resultado na reentrega', async () => {
    const r = await initMessaging(`crash-${randomUUID()}`, 1, 5);
    try {
      const event = envelope(fixture());
      await sns.send(new PublishCommand({ TopicArn: r.topicArn, Message: JSON.stringify(event) }));
      const first = (await sqs.send(new ReceiveMessageCommand({ QueueUrl: r.queueUrl, WaitTimeSeconds: 1 }))).Messages?.[0];
      expect(first?.Body).toBe(JSON.stringify(event));
      await processor.process(event); // Simula commit seguido de queda, sem DeleteMessage.
      await sqs.send(new ChangeMessageVisibilityCommand({ QueueUrl: r.queueUrl, ReceiptHandle: first?.ReceiptHandle, VisibilityTimeout: 0 }));
      const next = (await sqs.send(new ReceiveMessageCommand({ QueueUrl: r.queueUrl, WaitTimeSeconds: 1 }))).Messages?.[0];
      expect(next).toBeDefined();
      await new EventConsumer(processor).handle(next!, r.queueUrl);
      expect(await orm.em.fork().count(MatchResult)).toBe(1);
      expect((await sqs.send(new ReceiveMessageCommand({ QueueUrl: r.queueUrl, WaitTimeSeconds: 1 }))).Messages).toBeUndefined();
    } finally {
      await sns.send(new DeleteTopicCommand({ TopicArn: r.topicArn }));
      await sqs.send(new DeleteQueueCommand({ QueueUrl: r.queueUrl }));
      await sqs.send(new DeleteQueueCommand({ QueueUrl: r.dlqUrl }));
    }
  });
  it('mensagem inválida não é confirmada e chega à DLQ', async () => {
    const r = await initMessaging(`poison-${randomUUID()}`, 1, 2);
    const consumer = new EventConsumer(processor);
    try {
      await sqs.send(new SendMessageCommand({ QueueUrl: r.queueUrl, MessageBody: '{"invalid":true}' }));
      for (let i = 0; i < 2; i++) {
        const msg = (await sqs.send(new ReceiveMessageCommand({ QueueUrl: r.queueUrl, WaitTimeSeconds: 1 }))).Messages?.[0];
        expect(msg).toBeDefined();
        await expect(consumer.handle(msg!, r.queueUrl)).rejects.toThrow('INVALID_EVENT');
        await sqs.send(new ChangeMessageVisibilityCommand({ QueueUrl: r.queueUrl, ReceiptHandle: msg?.ReceiptHandle, VisibilityTimeout: 0 }));
      }
      await sqs.send(new ReceiveMessageCommand({ QueueUrl: r.queueUrl, WaitTimeSeconds: 1 }));
      const dlq = await waitFor(() => sqs.send(new ReceiveMessageCommand({ QueueUrl: r.dlqUrl, WaitTimeSeconds: 1 })), r => !!r.Messages?.length);
      expect(dlq.Messages?.[0].Body).toBe('{"invalid":true}');
      expect(await orm.em.fork().count(MatchResult)).toBe(0);
    } finally {
      await sns.send(new DeleteTopicCommand({ TopicArn: r.topicArn }));
      await sqs.send(new DeleteQueueCommand({ QueueUrl: r.queueUrl }));
      await sqs.send(new DeleteQueueCommand({ QueueUrl: r.dlqUrl }));
    }
  });
});
