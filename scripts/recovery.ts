import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { GetQueueUrlCommand, ReceiveMessageCommand, SendMessageCommand } from '@aws-sdk/client-sqs';
import { awsClients } from '../libs/messaging/clients.js';
import { messagingConfig } from '../libs/config.js';
import { base, example, publish, result } from './demo.js';

const compose = (...args: string[]) => execFileSync('docker', ['compose', ...args], { stdio: 'inherit', timeout: 90000 });
async function main() {
  assert.equal(messagingConfig().mode, 'local', 'Demonstração de recuperação exige ambiente local');
  const data = example();
  try {
    compose('stop', 'worker');
    await publish(data);
    const pending = await fetch(`${base}/api/v1/events/${data.eventId}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(pending.status, 202);
    compose('start', 'worker');
    const processed = await result(data.eventId, 120000); assert.equal(processed.result.score, data.score);
    // Restart both processes and the database, preserving the existing PostgreSQL volume.
    compose('restart', 'db');
    compose('up', '-d', '--wait', 'db');
    compose('restart', 'api', 'worker');
    const deadline = Date.now() + 45000;
    let preserved = false;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${base}/api/v1/events/${data.eventId}`, { signal: AbortSignal.timeout(3000) });
        if (response.status === 200) { preserved = (await response.json() as { result: { id: string } }).result.id === processed.result.id; if (preserved) break; }
      } catch { /* API may still be reconnecting. */ }
      await delay(500);
    }
    assert.ok(preserved, 'Resultado deve sobreviver ao reinício');
    const { sns, sqs } = awsClients();
    try {
      const queueName = messagingConfig().queueName;
      const queue = (await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }))).QueueUrl;
      const dlq = (await sqs.send(new GetQueueUrlCommand({ QueueName: `${queueName}-dlq` }))).QueueUrl;
      const poison = JSON.stringify({ invalid: true, demoId: randomUUID() });
      await sqs.send(new SendMessageCommand({ QueueUrl: queue, MessageBody: poison }));
      const dlqDeadline = Date.now() + 360000;
      let found = false;
      while (Date.now() < dlqDeadline && !found) {
        const received = await sqs.send(new ReceiveMessageCommand({ QueueUrl: dlq, WaitTimeSeconds: 5, MaxNumberOfMessages: 10, VisibilityTimeout: 0 }));
        found = received.Messages?.some(message => message.Body === poison) ?? false;
      }
      assert.ok(found, 'Mensagem inválida deve chegar à DLQ após as tentativas reais');
    } finally { sns.destroy(); sqs.destroy(); }
    console.log(JSON.stringify({ demo: 'RECOVERY PASS', eventId: data.eventId, checks: ['fila retém evento com worker parado', 'retomada processa evento', 'resultado persiste após reiniciar banco/API/worker', 'mensagem inválida chega à DLQ'] }));
  } finally { compose('start', 'worker'); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
