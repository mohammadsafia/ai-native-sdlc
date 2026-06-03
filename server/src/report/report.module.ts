// server/src/report/report.module.ts
import { Module } from '@nestjs/common';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { DemoModule } from '../demo/demo.module';

@Module({
  imports: [DemoModule],
  providers: [ReportService],
  controllers: [ReportController],
  exports: [ReportService],
})
export class ReportModule {}
