import { SNSClient } from '@aws-sdk/client-sns';
import { SQSClient } from '@aws-sdk/client-sqs';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { messagingConfig } from '../config.js';

export function awsClients() {
  const config = messagingConfig();
  const shared = {
    region: config.region, endpoint: config.endpoint, maxAttempts: 2,
    ...(config.mode === 'local' ? { credentials: { accessKeyId: 'local', secretAccessKey: 'local' } } : {}),
  };
  return {
    sns: new SNSClient({ ...shared, requestHandler: new NodeHttpHandler({ connectionTimeout: 2000, requestTimeout: 5000 }) }),
    sqs: new SQSClient({ ...shared, requestHandler: new NodeHttpHandler({ connectionTimeout: 2000, requestTimeout: 25000 }) }),
  };
}
