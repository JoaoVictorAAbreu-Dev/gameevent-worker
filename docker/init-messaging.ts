import { CreateTopicCommand, SetSubscriptionAttributesCommand, SubscribeCommand } from '@aws-sdk/client-sns';
import { CreateQueueCommand, GetQueueAttributesCommand, SetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { fileURLToPath } from 'node:url';
import { awsClients } from '../libs/messaging/clients.js';
import { messagingConfig } from '../libs/config.js';

export async function initMessaging(prefix?: string, visibility = 60, maxReceives = 5) {
  const config = messagingConfig();
  if (config.mode !== 'local') throw new Error('Inicialização automática permitida somente em modo local');
  const { sns, sqs } = awsClients();
  const queueName = prefix ?? config.queueName;
  const topicName = prefix ? `${prefix}-topic` : 'gameevent-match-finished';
  try {
    const dlq = await sqs.send(new CreateQueueCommand({ QueueName: `${queueName}-dlq`, Attributes: { MessageRetentionPeriod: '1209600' } }));
    if (!dlq.QueueUrl) throw new Error('DLQ_URL_MISSING');
    const dlqAttrs = await sqs.send(new GetQueueAttributesCommand({ QueueUrl: dlq.QueueUrl, AttributeNames: ['QueueArn'] }));
    const queue = await sqs.send(new CreateQueueCommand({ QueueName: queueName }));
    if (!queue.QueueUrl) throw new Error('QUEUE_URL_MISSING');
    const attrs = await sqs.send(new GetQueueAttributesCommand({ QueueUrl: queue.QueueUrl, AttributeNames: ['QueueArn'] }));
    const topic = await sns.send(new CreateTopicCommand({ Name: topicName }));
    if (!topic.TopicArn || !attrs.Attributes?.QueueArn || !dlqAttrs.Attributes?.QueueArn) throw new Error('RESOURCE_ARN_MISSING');
    await sqs.send(new SetQueueAttributesCommand({ QueueUrl: queue.QueueUrl, Attributes: {
      VisibilityTimeout: String(visibility), ReceiveMessageWaitTimeSeconds: '20', MessageRetentionPeriod: '345600',
      RedrivePolicy: JSON.stringify({ deadLetterTargetArn: dlqAttrs.Attributes.QueueArn, maxReceiveCount: maxReceives }),
      Policy: JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'sns.amazonaws.com' }, Action: 'sqs:SendMessage', Resource: attrs.Attributes.QueueArn, Condition: { ArnEquals: { 'aws:SourceArn': topic.TopicArn } } }] }),
    } }));
    await sqs.send(new SetQueueAttributesCommand({ QueueUrl: dlq.QueueUrl, Attributes: {
      RedriveAllowPolicy: JSON.stringify({ redrivePermission: 'byQueue', sourceQueueArns: [attrs.Attributes.QueueArn] }),
    } }));
    const subscription = await sns.send(new SubscribeCommand({ TopicArn: topic.TopicArn, Protocol: 'sqs', Endpoint: attrs.Attributes.QueueArn, Attributes: { RawMessageDelivery: 'true' } }));
    if (!subscription.SubscriptionArn) throw new Error('SUBSCRIPTION_MISSING');
    await sns.send(new SetSubscriptionAttributesCommand({ SubscriptionArn: subscription.SubscriptionArn, AttributeName: 'RawMessageDelivery', AttributeValue: 'true' }));
    return { topicArn: topic.TopicArn, queueUrl: queue.QueueUrl, dlqUrl: dlq.QueueUrl, subscriptionArn: subscription.SubscriptionArn };
  } finally { sns.destroy(); sqs.destroy(); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initMessaging(undefined, messagingConfig().visibility).then(resources => console.log(JSON.stringify(resources))).catch(() => { console.error('Falha ao inicializar mensageria local'); process.exitCode = 1; });
}
