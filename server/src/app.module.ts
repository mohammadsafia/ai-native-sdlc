import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validate } from './config/config.schema';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { JiraModule } from './jira/jira.module';
import { NormalizationModule } from './normalization/normalization.module';
import { ReportModule } from './report/report.module';
import { ProjectsModule } from './projects/projects.module';

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
    ReportModule,
    ProjectsModule,
  ],
})
export class AppModule {}
