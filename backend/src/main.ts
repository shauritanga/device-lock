import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Allow dashboard consoles + local marketing site (localhost and 127.0.0.1).
  const corsOrigins = (
    process.env.CORS_ORIGINS ??
    [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5500',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://127.0.0.1:5500',
    ].join(',')
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // Signature images arrive as PNG data URLs; the 100kb default is too small.
  app.useBodyParser('json', { limit: '1mb' });

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.setGlobalPrefix('v1', { exclude: ['health'] });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  await app.listen(port);

  Logger.log(`Device-Lock backend listening on http://localhost:${port}`, 'Bootstrap');
}
bootstrap();
