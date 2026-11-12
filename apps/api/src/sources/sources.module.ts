import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { SourcesController } from './sources.controller.js';
import { SourcesService } from './sources.service.js';

@Module({
  imports: [PersistenceModule, ProvidersModule],
  controllers: [SourcesController],
  providers: [SourcesService],
})
export class SourcesModule {}
