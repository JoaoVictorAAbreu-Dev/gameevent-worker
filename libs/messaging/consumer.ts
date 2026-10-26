import { Injectable } from '@nestjs/common';
import { DeleteMessageCommand, GetQueueUrlCommand, Message, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import { writeFileSync, unlinkSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { EventProcessor } from '../domain/event-processor.js';
import { parseEvent } from '../domain/match-finished.js';
import { messagingConfig } from '../config.js';
import { awsClients } from './clients.js';

@Injectable()
export class EventConsumer {
  private readonly clients = awsClients();
  private readonly config = messagingConfig();
  private readonly abort = new AbortController();
  private running = true;
  private queueUrl?: string;

  constructor(private readonly processor: EventProcessor) {}

  async handle(message: Message, queueUrl: string): Promise<void> {
    if (!message.Body || !message.ReceiptHandle) throw new Error('INVALID_MESSAGE');
    const started = Date.now();
    const event = parseEvent(message.Body);
    const result = await this.processor.process(event);
    // A failed delete is intentionally retryable; the committed event is idempotent.
    await this.clients.sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }));
    console.log(JSON.stringify({ action: 'event.acknowledged', eventId: event.data.eventId, messageId: message.MessageId, result, durationMs: Date.now() - started }));
  }

  stop(): void { this.running = false; this.abort.abort(); }

  async run(): Promise<void> {
    let failures = 0;
    try {
      while (this.running) {
        try {
          if (!this.queueUrl) {
            this.queueUrl = this.config.queueUrl ?? (await this.clients.sqs.send(new GetQueueUrlCommand({ QueueName: this.config.queueName }), { abortSignal: this.abort.signal })).QueueUrl;
            if (!this.queueUrl) throw new Error('QUEUE_NOT_FOUND');
          }
          const response = await this.clients.sqs.send(new ReceiveMessageCommand({
            QueueUrl: this.queueUrl, MaxNumberOfMessages: 1, WaitTimeSeconds: this.config.wait,
            VisibilityTimeout: this.config.visibility, MessageSystemAttributeNames: ['ApproximateReceiveCount'],
          }), { abortSignal: this.abort.signal });
          failures = 0;
          writeFileSync('/tmp/gameevent-worker-heartbeat', String(Date.now()));
          for (const message of response.Messages ?? []) {
            const started = Date.now();
            try { await this.handle(message, this.queueUrl); }
            catch (error) {
              const reason = error instanceof Error && ['INVALID_EVENT', 'INVALID_MESSAGE', 'EVENT_ID_CONFLICT'].includes(error.message) ? error.message : 'PROCESSING_OR_ACK_FAILED';
              console.error(JSON.stringify({ action: 'event.failed', messageId: message.MessageId, attempt: message.Attributes?.ApproximateReceiveCount, reason, durationMs: Date.now() - started }));
            }
          }
        } catch {
          if (!this.running) break;
          console.error(JSON.stringify({ action: 'queue.poll_failed', failures: ++failures }));
          await delay(Math.min(1000 * 2 ** Math.min(failures, 5), 30000), undefined, { signal: this.abort.signal }).catch(() => undefined);
        }
      }
    } finally {
      this.clients.sns.destroy(); this.clients.sqs.destroy();
      try { unlinkSync('/tmp/gameevent-worker-heartbeat'); } catch { /* May not have received a response yet. */ }
    }
  }
}
