import { Module } from '@nestjs/common';
import { DocumentTypesModule } from './document-types/document-types.module.js';
import { ClassroomsModule } from './classrooms/classrooms.module.js';
import { StudioConfigModule } from './config/studio-config.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { ExportsModule } from './exports/exports.module.js';
import { GenerationModule } from './generation/generation.module.js';
import { ProvidersModule } from './providers/providers.module.js';
import { SourcesModule } from './sources/sources.module.js';
import { StudioController } from './studio.controller.js';

@Module({
  imports: [DocumentTypesModule, StudioConfigModule, ProvidersModule, ClassroomsModule, DocumentsModule, SourcesModule, GenerationModule, ExportsModule],
  controllers: [StudioController],
})
export class AppModule {}
