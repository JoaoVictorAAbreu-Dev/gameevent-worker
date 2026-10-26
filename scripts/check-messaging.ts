import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PublishCommand } from '@aws-sdk/client-sns';
import { ChangeMessageVisibilityCommand, DeleteMessageCommand, DeleteQueueCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import { DeleteTopicCommand } from '@aws-sdk/client-sns';
import { awsClients } from '../libs/messaging/clients.js';
import { initMessaging } from '../docker/init-messaging.js';

async function main() {
  const r = await initMessaging(`compat-${randomUUID()}`, 1, 2);
  const { sns, sqs } = awsClients();
  try {
    const body = JSON.stringify({ compatibility: true });
    await sns.send(new PublishCommand({ TopicArn: r.topicArn, Message: body }));
    const receive = () => sqs.send(new ReceiveMessageCommand({ QueueUrl: r.queueUrl, WaitTimeSeconds: 1, MaxNumberOfMessages: 1, MessageSystemAttributeNames: ['ApproximateReceiveCount'] }));
    const first = (await receive()).Messages?.[0];
    assert.equal(first?.Body, body, 'SNS deve entregar payload raw na SQS');
    assert.ok(first?.ReceiptHandle);
    const invisible = await receive();
    // With 1-second visibility a long poll can already see it again; explicitly force the next attempt.
    const current = invisible.Messages?.[0] ?? first;
    await sqs.send(new ChangeMessageVisibilityCommand({ QueueUrl: r.queueUrl, ReceiptHandle: current.ReceiptHandle, VisibilityTimeout: 0 }));
    let dlqMessage;
    for (let i = 0; i < 10 && !dlqMessage; i++) {
      const next = (await receive()).Messages?.[0];
      if (next?.ReceiptHandle) await sqs.send(new ChangeMessageVisibilityCommand({ QueueUrl: r.queueUrl, ReceiptHandle: next.ReceiptHandle, VisibilityTimeout: 0 }));
      dlqMessage = (await sqs.send(new ReceiveMessageCommand({ QueueUrl: r.dlqUrl, WaitTimeSeconds: 1 }))).Messages?.[0];
    }
    assert.equal(dlqMessage?.Body, body, 'Mensagem deve chegar à DLQ');
    await sqs.send(new DeleteMessageCommand({ QueueUrl: r.dlqUrl, ReceiptHandle: dlqMessage?.ReceiptHandle }));
    console.log('PASS: SDK v3, SNS raw → SQS, reentrega e DLQ');
  } finally {
    await sns.send(new DeleteTopicCommand({ TopicArn: r.topicArn }));
    await sqs.send(new DeleteQueueCommand({ QueueUrl: r.queueUrl }));
    await sqs.send(new DeleteQueueCommand({ QueueUrl: r.dlqUrl }));
    sns.destroy(); sqs.destroy();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
