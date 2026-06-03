/**
 * Offline OpenAPI document generator.
 *
 * Bootstraps the Nest application WITHOUT starting an HTTP listener,
 * builds the Swagger document (same config as main.ts), writes it to
 * server/swagger.json, then exits cleanly.
 *
 * Usage:
 *   yarn generate:openapi
 *
 * This lets the frontend (yarn dto:gen) consume the typed spec even
 * when Docker / the database is not running.
 */

import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';

// Provide fallback env vars so the ConfigModule validation passes when no
// real .env is present (e.g. CI, or local dev before Docker is up).
// The DB connect itself is tolerant (see prisma.service.ts).
if (!process.env['DATABASE_URL']) {
  process.env['DATABASE_URL'] = 'postgresql://sdlc:sdlc@localhost:5433/sdlc';
}

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function generateOpenApi() {
  // Create the app without an HTTP adapter listener and suppress startup logs.
  const app = await NestFactory.create(AppModule, { logger: false });

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('AI-Native SDLC API')
    .setDescription(
      'Backend API for the AI-Native SDLC Platform — Jira ingestion, normalization, and weekly reports',
    )
    .setVersion('0.1.0')
    .addTag('Health')
    .addTag('Sync')
    .addTag('Projects')
    .addTag('Reports')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const outputPath = path.resolve(__dirname, '..', 'swagger.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf8');
  console.log(`swagger.json written to ${outputPath}`);

  await app.close();
  process.exit(0);
}

generateOpenApi().catch((err) => {
  console.error('Failed to generate OpenAPI spec:', err);
  process.exit(1);
});
