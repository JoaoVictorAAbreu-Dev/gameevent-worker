import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Res, ServiceUnavailableException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { Response } from 'express';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MatchFinishedDto } from '../../libs/domain/match-finished.js';
import { EventPublisher } from '../../libs/messaging/publisher.js';
import { MatchResult } from '../../libs/database/entities.js';
import { ErrorResponse } from './http.js';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly publisher: EventPublisher, private readonly em: EntityManager) {}

  @Post('match-finished') @HttpCode(202)
  @ApiOperation({ summary: 'Publicar resultado de partida' })
  @ApiBody({ type: MatchFinishedDto })
  @ApiResponse({ status: 202, description: 'SNS confirmou publicação; processamento é assíncrono.', schema: { example: { eventId: 'evt-001', status: 'accepted', messageId: 'sns-message-id' } } })
  @ApiResponse({ status: 400, type: ErrorResponse })
  @ApiResponse({ status: 503, type: ErrorResponse, description: 'Publicação indisponível; repetir com o mesmo eventId.' })
  publish(@Body() dto: MatchFinishedDto) { return this.publisher.publish(dto); }

  @Get(':eventId')
  @ApiParam({ name: 'eventId', example: 'evt-001' })
  @ApiResponse({ status: 200, description: 'Resultado processado.', schema: { example: { eventId: 'evt-001', eventType: 'match.finished', version: 1, status: 'processed', processedAt: '2026-10-26T18:00:01Z', result: { id: 'uuid', matchId: 'match-123', playerId: 'player-456', score: 1500, finishedAt: '2026-10-26T18:00:00Z' } } } })
  @ApiResponse({ status: 202, description: 'Sem resultado disponível; não distingue identificador desconhecido de evento em trânsito.', schema: { example: { eventId: 'evt-001', status: 'not_available', message: 'Resultado ainda não disponível. O evento pode estar em trânsito ou não ter sido recebido.' } } })
  @ApiResponse({ status: 400, type: ErrorResponse })
  async get(@Param('eventId') eventId: string, @Res({ passthrough: true }) response: Response) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(eventId)) {
      throw new BadRequestException({ code: 'INVALID_EVENT_ID', message: 'eventId inválido.' });
    }
    const result = await this.em.findOne(MatchResult, { processedEvent: { eventId } }, { populate: ['processedEvent'] });
    if (!result) {
      response.status(202);
      return { eventId, status: 'not_available', message: 'Resultado ainda não disponível. O evento pode estar em trânsito ou não ter sido recebido.' };
    }
    const marker = result.processedEvent;
    return { eventId, eventType: marker.eventType, version: marker.version, status: 'processed', processedAt: marker.processedAt.toISOString(), result: {
      id: result.id, matchId: result.matchId, playerId: result.playerId, score: result.score, finishedAt: result.finishedAt.toISOString(),
    } };
  }
}
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly em: EntityManager) {}
  @Get()
  @ApiResponse({ status: 200, schema: { example: { status: 'ok', database: 'up' } } })
  @ApiResponse({ status: 503, type: ErrorResponse })
  async health() {
    try { await this.em.getConnection().execute('select 1'); return { status: 'ok', database: 'up' }; }
    catch { throw new ServiceUnavailableException({ code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.' }); }
  }
}
