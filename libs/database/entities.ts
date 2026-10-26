import { randomUUID } from 'node:crypto';
import { Entity, PrimaryKey, Property, OneToOne, Check, Index } from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'processed_events' })
@Check({ name: 'processed_events_version_check', expression: 'version = 1' })
@Check({ name: 'processed_events_type_check', expression: "event_type in ('match.finished')" })
export class ProcessedEvent {
  @PrimaryKey({ type: 'uuid' }) id: string = randomUUID();
  @Property({ type: 'string', length: 100, unique: true }) eventId!: string;
  @Property({ type: 'string', length: 40 }) eventType!: string;
  @Property({ type: 'integer' }) version!: number;
  @Property({ type: 'string', length: 64 }) payloadHash!: string;
  @Property({ type: 'timestamptz' }) processedAt: Date = new Date();
}
@Entity({ tableName: 'match_results' })
@Index({ name: 'match_results_match_id_index', properties: ['matchId'] })
@Check({ name: 'match_results_score_check', expression: 'score between 0 and 1000000' })
export class MatchResult {
  @PrimaryKey({ type: 'uuid' }) id: string = randomUUID();
  @OneToOne(() => ProcessedEvent, { owner: true, deleteRule: 'restrict', updateRule: 'cascade' }) processedEvent!: ProcessedEvent;
  @Property({ type: 'string', length: 100 }) matchId!: string;
  @Property({ type: 'string', length: 100 }) playerId!: string;
  @Property({ type: 'integer' }) score!: number;
  @Property({ type: 'timestamptz' }) finishedAt!: Date;
}
