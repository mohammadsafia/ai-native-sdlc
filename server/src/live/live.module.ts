// server/src/live/live.module.ts
import { Module } from '@nestjs/common';
import { LiveDataService } from './live-data.service';
import { JiraModule } from '../jira/jira.module';

@Module({
  imports: [JiraModule],
  providers: [LiveDataService],
  exports: [LiveDataService],
})
export class LiveModule {}
