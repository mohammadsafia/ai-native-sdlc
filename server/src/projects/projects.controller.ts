// server/src/projects/projects.controller.ts
import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { ProjectSummaryDto } from '../report/report.dto';

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOkResponse({ type: [ProjectSummaryDto], description: 'List all projects with health summary' })
  findAll(): Promise<ProjectSummaryDto[]> {
    return this.projectsService.findAll();
  }

  @Get(':key')
  @ApiParam({ name: 'key', description: 'Jira project key', example: 'PROJ' })
  @ApiOkResponse({ type: ProjectSummaryDto, description: 'Single project health summary' })
  findOne(@Param('key') key: string): Promise<ProjectSummaryDto> {
    return this.projectsService.findOne(key);
  }
}
