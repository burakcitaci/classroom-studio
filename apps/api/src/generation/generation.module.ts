import { Module } from '@nestjs/common';
import { StudioConfigModule } from '../config/studio-config.module.js';
import { PersistenceModule } from '../persistence/persistence.module.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { GenerationController } from './generation.controller.js';
import { GenerationService } from './generation.service.js';

@Module({
  imports: [StudioConfigModule, PersistenceModule, ProvidersModule],
  controllers: [GenerationController],
  providers: [GenerationService],
})
export class GenerationModule {}
