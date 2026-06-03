// server/src/jira/jira.controller.ts
import { Controller, Post, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { JiraConnectorService } from './jira.connector.service';

@ApiTags('sync')
@Controller('sync')
export class JiraController {
  constructor(private readonly connector: JiraConnectorService) {}

  @Post(':projectKey')
  @ApiOperation({ summary: 'Trigger a Jira project sync' })
  @ApiParam({ name: 'projectKey', description: 'Jira project key, e.g. PROJ' })
  @ApiResponse({ status: 201, description: 'Sync completed successfully' })
  async sync(@Param('projectKey') projectKey: string) {
    return this.connector.sync(projectKey);
  }
}
