// server/src/bitbucket/bitbucket.controller.ts
import { Controller, Post, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { BitbucketConnectorService } from './bitbucket.connector.service';

@ApiTags('sync')
@Controller('sync-bitbucket')
export class BitbucketController {
  constructor(private readonly connector: BitbucketConnectorService) {}

  @Post(':workspace/:repo')
  @ApiOperation({ summary: 'Trigger a Bitbucket repo sync (commits + PRs)' })
  @ApiParam({ name: 'workspace', description: 'Bitbucket workspace slug' })
  @ApiParam({ name: 'repo', description: 'Repository slug' })
  @ApiResponse({ status: 201, description: 'Sync completed successfully' })
  async sync(
    @Param('workspace') workspace: string,
    @Param('repo') repo: string,
  ) {
    return this.connector.sync(workspace, repo);
  }
}
