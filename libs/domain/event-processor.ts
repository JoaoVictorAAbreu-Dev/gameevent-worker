import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { MatchResult, ProcessedEvent } from '../database/entities.js';
import { MatchFinishedEvent, payloadHash } from './match-finished.js';

export class EventConflictError extends Error {
  constructor() { super('EVENT_ID_CONFLICT'); }
}
@Injectable()
export class EventProcessor {
  constructor(private readonly em: EntityManager) {}

  async process(event: MatchFinishedEvent): Promise<'processed' | 'duplicate'> {
    const hash = payloadHash(event);
    try {
      await this.em.fork().transactional(async tx => {
        const marker = tx.create(ProcessedEvent, {
          eventId: event.data.eventId, eventType: event.eventType, version: event.version, payloadHash: hash, processedAt: new Date(),
        });
        tx.persist(marker);
        // Reserve the unique eventId before writing its result; both writes stay in the same transaction.
        await tx.flush();
        tx.persist(tx.create(MatchResult, {
          processedEvent: marker, matchId: event.data.matchId, playerId: event.data.playerId,
          score: event.data.score, finishedAt: new Date(event.data.finishedAt),
        }));
        await tx.flush();
      });
      return 'processed';
    } catch (error) {
      if (!(error instanceof UniqueConstraintViolationException)) throw error;
      // A uniqueness error aborts the transaction: use a new context to inspect the committed winner.
      const previous = await this.em.fork().findOne(ProcessedEvent, { eventId: event.data.eventId });
      if (!previous) throw error;
      if (previous.payloadHash !== hash) throw new EventConflictError();
      return 'duplicate';
    }
  }
}
