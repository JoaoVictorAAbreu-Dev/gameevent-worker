import { afterEach, describe, expect, it } from '@jest/globals';
import { messagingConfig, integerEnv } from './config.js';
const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });
describe('configuração segura', () => {
  it('exige endpoint local sem fallback para AWS', () => {
    process.env.MESSAGING_MODE = 'local'; delete process.env.AWS_ENDPOINT_URL;
    expect(() => messagingConfig()).toThrow('AWS_ENDPOINT_URL');
  });
  it('não permite endpoint customizado no modo AWS', () => {
    process.env.MESSAGING_MODE = 'aws'; process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';
    expect(() => messagingConfig()).toThrow('endpoint customizado');
  });
  it('exige recursos explícitos no modo AWS', () => {
    process.env.MESSAGING_MODE = 'aws'; delete process.env.AWS_ENDPOINT_URL; delete process.env.SNS_TOPIC_ARN;
    expect(() => messagingConfig()).toThrow('SNS_TOPIC_ARN');
  });
  it('rejeita porta inválida', () => { process.env.DB_PORT = '0'; expect(() => integerEnv('DB_PORT', 5436)).toThrow(); });
});
