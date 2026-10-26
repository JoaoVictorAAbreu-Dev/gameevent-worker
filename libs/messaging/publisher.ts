import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { PublishCommand } from '@aws-sdk/client-sns';
import { messagingConfig } from '../config.js';
import { MatchFinishedDto, envelope } from '../domain/match-finished.js';
import { awsClients } from './clients.js';

@Injectable()
export class EventPublisher implements OnModuleDestroy {
  private readonly clients = awsClients();
  private readonly topicArn = messagingConfig().topicArn;

  async publish(data: MatchFinishedDto) {
    try {
      const result = await this.clients.sns.send(new PublishCommand({ TopicArn: this.topicArn, Message: JSON.stringify(envelope(data)) }));
      if (!result.MessageId) throw new Error('Missing MessageId');
      console.log(JSON.stringify({ action: 'event.published', eventId: data.eventId, messageId: result.MessageId }));
      return { eventId: data.eventId, status: 'accepted' as const, messageId: result.MessageId };
    } catch {
      console.error(JSON.stringify({ action: 'event.publish_failed', eventId: data.eventId }));
      throw new ServiceUnavailableException({ code: 'PUBLISH_UNAVAILABLE', message: 'Publicação indisponível. Tente novamente com o mesmo eventId.' });
    }
  }
  onModuleDestroy() { this.clients.sns.destroy(); this.clients.sqs.destroy(); }
}
