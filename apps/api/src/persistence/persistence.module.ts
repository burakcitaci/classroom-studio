import { Module } from '@nestjs/common';
import { StudioConfigModule } from '../config/studio-config.module.js';
import { StudioConfig } from '../config/studio-config.js';
import { StudioStore } from './studio-store.js';

@Module({
  imports: [StudioConfigModule],
  providers: [{ provide: StudioStore, useFactory: (config: StudioConfig) => StudioStore.connect(config.dataDir, config.databaseUrl, config.databaseSchema), inject: [StudioConfig] }],
  exports: [StudioStore],
})
export class PersistenceModule {}
