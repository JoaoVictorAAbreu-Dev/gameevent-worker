import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../libs/database/database.module.js';
import { EventProcessor } from '../../libs/domain/event-processor.js';
import { EventConsumer } from '../../libs/messaging/consumer.js';
@Module({ imports: [DatabaseModule], providers: [EventProcessor, EventConsumer] })
export class WorkerModule {}
