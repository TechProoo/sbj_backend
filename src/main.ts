import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    // Keeps the untouched request bytes on `req.rawBody`. The Paystack
    // webhook is signed over exactly those bytes, and re-serialising the
    // parsed JSON would change the digest.
    rawBody: true,
  });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: config.get<string[]>('corsOrigins'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Reject unknown fields outright: a checkout body carrying a `total` is
      // a client trying to set its own price.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.enableShutdownHooks();

  const port = config.get<number>('port') ?? 4000;

  /*
   * 0.0.0.0, not the default loopback.
   *
   * A container platform routes traffic to the container's own address; a
   * server bound only to localhost answers nothing from outside it and the
   * health check fails with no error in the logs to explain why.
   */
  await app.listen(port, '0.0.0.0');

  const where =
    config.get<string>('nodeEnv') === 'production'
      ? `port ${port}`
      : `http://localhost:${port}/api`;
  logger.log(`SBJ API listening on ${where}`);
}

void bootstrap();
