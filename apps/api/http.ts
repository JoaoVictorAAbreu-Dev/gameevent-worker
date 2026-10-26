import { ArgumentsHost, Catch, ExceptionFilter, HttpException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Response } from 'express';
import { SwaggerModule, DocumentBuilder, ApiProperty } from '@nestjs/swagger';

export class ErrorResponse {
  @ApiProperty({ example: 400 }) statusCode!: number;
  @ApiProperty({ example: 'VALIDATION_ERROR' }) code!: string;
  @ApiProperty({ example: 'Entrada inválida.' }) message!: string;
  @ApiProperty({ required: false, type: [String] }) details?: string[];
}
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const statusCode = exception instanceof HttpException ? exception.getStatus() : 500;
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const info = typeof body === 'object' && body ? body as { code?: string; message?: string | string[] } : {};
    const validation = Array.isArray(info.message);
    response.status(statusCode).json({
      statusCode, code: info.code ?? (validation ? 'VALIDATION_ERROR' : statusCode === 404 ? 'ROUTE_NOT_FOUND' : 'INTERNAL_ERROR'),
      message: validation ? 'Entrada inválida.' : info.message ?? (statusCode >= 500 ? 'Serviço indisponível.' : 'Requisição inválida.'),
      ...(validation ? { details: info.message } : {}),
    });
  }
}
export function configureHttp(app: INestApplication) {
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true }));
  app.useGlobalFilters(new HttpErrorFilter());
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('GameEvent Worker').setDescription('Resultados assíncronos via SNS e SQS. 202 na publicação não significa processamento concluído.').setVersion('1.0.0').build());
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs-json' });
  return document;
}
