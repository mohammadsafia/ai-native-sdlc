// server/src/report/report.module.ts
import { Module } from '@nestjs/common';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { NarrativeService } from './narrative.service';
import { DemoModule } from '../demo/demo.module';

@Module({
  imports: [DemoModule],
  providers: [ReportService, NarrativeService],
  controllers: [ReportController],
  exports: [ReportService],
})
export class ReportModule {}
