import { fileURLToPath } from 'node:url';
import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { integerEnv } from '../config.js';
import { ProcessedEvent, MatchResult } from './entities.js';

export default defineConfig({
  entities: [ProcessedEvent, MatchResult],
  host: process.env.DB_HOST ?? '127.0.0.1', port: integerEnv('DB_PORT', 5436),
  dbName: process.env.DB_NAME ?? 'gameevent', user: process.env.DB_USER ?? 'gameevent',
  password: process.env.DB_PASSWORD ?? 'gameevent_local',
  extensions: [Migrator],
  migrations: { path: fileURLToPath(new URL('./migrations', import.meta.url)), glob: '!(*.d).{js,ts}', snapshot: false, transactional: true, allOrNothing: true },
  pool: { min: 0, max: 5 },
  driverOptions: { connectionTimeoutMillis: 3000, statement_timeout: 5000, idle_in_transaction_session_timeout: 10000, lock_timeout: 5000 },
  debug: false,
});
