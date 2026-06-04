// server/src/report/report.module.ts
import { Module } from '@nestjs/common';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { NarrativeService } from './narrative.service';
import { DemoModule } from '../demo/demo.module';
import { LiveModule } from '../live/live.module';

@Module({
  imports: [DemoModule, LiveModule],
  providers: [ReportService, NarrativeService],
  controllers: [ReportController],
  exports: [ReportService],
})
export class ReportModule {}
