import 'reflect-metadata';
import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './modules/app.module';

async function bootstrap() {
  const origin = process.env.APP_ORIGIN ?? 'http://localhost:5173';
  if (process.env.NODE_ENV === 'production' && !process.env.APP_ORIGIN) {
    throw new Error('APP_ORIGIN must be set in production');
  }
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({ origin, credentials: true, methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT ?? 3001), '0.0.0.0');
}

void bootstrap();
