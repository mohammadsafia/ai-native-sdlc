// server/src/report/report.controller.ts
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOkResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ReportService } from './report.service';
import { WeeklyReportDto } from './report.dto';

@ApiTags('report')
@Controller('projects/:key/weekly-report')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get()
  @ApiParam({ name: 'key', description: 'Jira project key', example: 'PROJ' })
  @ApiQuery({ name: 'windowDays', required: false, type: Number, description: 'Reporting window in days (default 7)' })
  @ApiQuery({ name: 'staleDays', required: false, type: Number, description: 'Days of inactivity before story is stale (default 3)' })
  @ApiQuery({ name: 'overloadThreshold', required: false, type: Number, description: 'Max concurrent in-progress per assignee before resource-overload risk fires (default 5)' })
  @ApiOkResponse({ type: WeeklyReportDto, description: 'Weekly status & risk report for the project' })
  async getWeeklyReport(
    @Param('key') key: string,
    @Query('windowDays') windowDays?: string,
    @Query('staleDays') staleDays?: string,
    @Query('overloadThreshold') overloadThreshold?: string,
  ): Promise<WeeklyReportDto> {
    return this.reportService.compute(key, {
      windowDays: windowDays ? parseInt(windowDays, 10) : undefined,
      staleDays: staleDays ? parseInt(staleDays, 10) : undefined,
      overloadThreshold: overloadThreshold ? parseInt(overloadThreshold, 10) : undefined,
    });
  }
}
