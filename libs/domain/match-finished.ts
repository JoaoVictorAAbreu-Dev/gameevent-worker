import { createHash } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { IsISO8601, IsInt, IsString, Length, Matches, Max, Min, validateSync } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MatchFinishedDto {
  @ApiProperty({ example: 'evt-001', minLength: 1, maxLength: 100 })
  @IsString() @Length(1, 100) @Matches(/^[a-zA-Z0-9_-]+$/)
  eventId!: string;

  @ApiProperty({ example: 'match-123', minLength: 1, maxLength: 100 })
  @IsString() @Length(1, 100) @Matches(/^[a-zA-Z0-9_-]+$/)
  matchId!: string;

  @ApiProperty({ example: 'player-456', minLength: 1, maxLength: 100 })
  @IsString() @Length(1, 100) @Matches(/^[a-zA-Z0-9_-]+$/)
  playerId!: string;

  @ApiProperty({ example: 1500, minimum: 0, maximum: 1000000 })
  @IsInt() @Min(0) @Max(1000000)
  score!: number;

  @ApiProperty({ example: '2026-10-26T18:00:00Z', format: 'date-time' })
  @IsISO8601({ strict: true }) @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  finishedAt!: string;
}
export interface MatchFinishedEvent {
  eventType: 'match.finished';
  version: 1;
  data: MatchFinishedDto;
}
export function envelope(data: MatchFinishedDto): MatchFinishedEvent {
  return { eventType: 'match.finished', version: 1, data };
}
export function parseEvent(body: string): MatchFinishedEvent {
  const value: unknown = JSON.parse(body);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_EVENT');
  const event = value as Record<string, unknown>;
  if (event.eventType !== 'match.finished' || event.version !== 1 ||
      Object.keys(event).some(key => !['eventType', 'version', 'data'].includes(key)) ||
      !event.data || typeof event.data !== 'object' || Array.isArray(event.data)) throw new Error('INVALID_EVENT');
  const dto = plainToInstance(MatchFinishedDto, event.data);
  if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length) throw new Error('INVALID_EVENT');
  return envelope(dto);
}
export function payloadHash(event: MatchFinishedEvent): string {
  const d = event.data;
  return createHash('sha256').update(JSON.stringify([
    event.eventType, event.version, d.eventId, d.matchId, d.playerId, d.score, new Date(d.finishedAt).toISOString(),
  ])).digest('hex');
}
