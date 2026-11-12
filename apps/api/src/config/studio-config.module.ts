import { Module } from '@nestjs/common';
import { StudioConfig } from './studio-config.js';

@Module({
  providers: [{ provide: StudioConfig, useFactory: () => new StudioConfig(process.env) }],
  exports: [StudioConfig],
})
export class StudioConfigModule {}
