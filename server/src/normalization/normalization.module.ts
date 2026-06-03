// server/src/normalization/normalization.module.ts
import { Module } from '@nestjs/common';
import { NormalizeService } from './normalize.service';

@Module({
  providers: [NormalizeService],
  exports: [NormalizeService],
})
export class NormalizationModule {}
