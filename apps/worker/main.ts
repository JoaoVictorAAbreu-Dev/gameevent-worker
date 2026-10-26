import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module.js';
import { EventConsumer } from '../../libs/messaging/consumer.js';

async function main() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const consumer = app.get(EventConsumer);
  const shutdown = () => {
    consumer.stop();
    setTimeout(() => process.exit(1), 45000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  try { await consumer.run(); }
  finally { await app.close(); process.removeListener('SIGTERM', shutdown); process.removeListener('SIGINT', shutdown); }
}
main().catch(() => { console.error(JSON.stringify({ action: 'worker.start_failed' })); process.exitCode = 1; });
