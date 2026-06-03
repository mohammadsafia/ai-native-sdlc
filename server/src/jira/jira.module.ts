// server/src/jira/jira.module.ts
import { Module } from '@nestjs/common';
import { JiraClient } from './jira.client';
import { JiraConnectorService } from './jira.connector.service';
import { JiraController } from './jira.controller';
import { NormalizationModule } from '../normalization/normalization.module';

@Module({
  imports: [NormalizationModule],
  providers: [JiraClient, JiraConnectorService],
  controllers: [JiraController],
  exports: [JiraConnectorService],
})
export class JiraModule {}
