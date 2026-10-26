import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../libs/database/database.module.js';
import { EventPublisher } from '../../libs/messaging/publisher.js';
import { EventsController, HealthController } from './events.controller.js';
@Module({ imports: [DatabaseModule], controllers: [EventsController, HealthController], providers: [EventPublisher] })
export class ApiModule {}
