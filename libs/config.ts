import 'dotenv/config';

export function integerEnv(name: string, fallback: number, min = 1, max = 65535): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} inválida`);
  return value;
}
export function messagingConfig() {
  const mode = process.env.MESSAGING_MODE ?? 'local';
  if (!['local', 'aws'].includes(mode)) throw new Error('MESSAGING_MODE deve ser local ou aws');
  const endpoint = process.env.AWS_ENDPOINT_URL;
  if (mode === 'local' && !endpoint) throw new Error('AWS_ENDPOINT_URL obrigatório em modo local');
  if (mode === 'aws' && endpoint) throw new Error('Modo aws não permite endpoint customizado');
  if (endpoint && !['http:', 'https:'].includes(new URL(endpoint).protocol)) throw new Error('Endpoint inválido');
  if (mode === 'aws' && (!process.env.SNS_TOPIC_ARN || !process.env.SQS_QUEUE_URL)) {
    throw new Error('Modo aws exige SNS_TOPIC_ARN e SQS_QUEUE_URL');
  }
  return {
    mode, endpoint, region: process.env.AWS_REGION ?? 'us-east-1',
    topicArn: process.env.SNS_TOPIC_ARN ?? 'arn:aws:sns:us-east-1:123456789012:gameevent-match-finished',
    queueName: process.env.SQS_QUEUE_NAME ?? 'gameevent-results',
    queueUrl: process.env.SQS_QUEUE_URL,
    visibility: integerEnv('SQS_VISIBILITY_TIMEOUT', 60, 30, 43200),
    wait: integerEnv('SQS_WAIT_SECONDS', 20, 0, 20),
  };
}
