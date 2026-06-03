// server/src/projects/projects.module.ts
import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { ReportModule } from '../report/report.module';
import { DemoModule } from '../demo/demo.module';

@Module({
  imports: [ReportModule, DemoModule],
  providers: [ProjectsService],
  controllers: [ProjectsController],
})
export class ProjectsModule {}
