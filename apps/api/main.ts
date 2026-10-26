import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ApiModule } from './app.module.js';
import { configureHttp } from './http.js';
import { integerEnv } from '../../libs/config.js';

async function main() {
  const app = await NestFactory.create(ApiModule);
  configureHttp(app);
  app.enableShutdownHooks();
  await app.listen(integerEnv('PORT', 3004), process.env.HOST ?? '127.0.0.1');
}
main().catch(() => { console.error(JSON.stringify({ action: 'api.start_failed' })); process.exitCode = 1; });
