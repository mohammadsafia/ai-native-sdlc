import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validate } from './config/config.schema';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { JiraModule } from './jira/jira.module';
import { NormalizationModule } from './normalization/normalization.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    HealthModule,
    PrismaModule,
    NormalizationModule,
    JiraModule,
  ],
})
export class AppModule {}
