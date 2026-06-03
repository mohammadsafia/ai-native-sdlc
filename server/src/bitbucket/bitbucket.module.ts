// server/src/bitbucket/bitbucket.module.ts
import { Module } from '@nestjs/common';
import { BitbucketClient } from './bitbucket.client';
import { BitbucketConnectorService } from './bitbucket.connector.service';
import { BitbucketController } from './bitbucket.controller';

@Module({
  providers: [BitbucketClient, BitbucketConnectorService],
  controllers: [BitbucketController],
  exports: [BitbucketConnectorService],
})
export class BitbucketModule {}
