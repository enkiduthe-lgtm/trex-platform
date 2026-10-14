import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser = require('cookie-parser');
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validateEnvironment } from './config/environment';

async function bootstrap() {
  validateEnvironment(process.env);
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  (app.getHttpAdapter().getInstance() as { set(name: string, value: unknown): void }).set('trust proxy', 1);
  app.setGlobalPrefix('v1');
  app.use(helmet());
  app.use(cookieParser());
  const corsOrigins = process.env.CORS_ORIGIN?.split(',').map(origin => origin.trim()).filter(Boolean) ?? [];
  app.enableCors({ origin: corsOrigins.length ? corsOrigins : false, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.listen(Number(process.env.PORT ?? 3000));
}
void bootstrap();
