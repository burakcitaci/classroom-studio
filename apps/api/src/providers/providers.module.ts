import { Module } from '@nestjs/common';
import { StudioConfigModule } from '../config/studio-config.module.js';
import { StudioConfig } from '../config/studio-config.js';
import { DemoGenerator } from '../generation/assessment/demo-generator.js';
import { DemoIndex } from '../sources/retrieval.js';
import { OllamaGenerator } from './ollama-generator.js';
import { QdrantIndex } from './qdrant-index.js';

export const VECTOR_INDEX = Symbol('VectorIndex');
export const GENERATOR = Symbol('Generator');

@Module({
  imports: [StudioConfigModule],
  providers: [
    {
      provide: VECTOR_INDEX,
      useFactory: (config: StudioConfig) => config.provider === 'demo' ? new DemoIndex() : new QdrantIndex(config),
      inject: [StudioConfig],
    },
    {
      provide: GENERATOR,
      useFactory: (config: StudioConfig) =>
        config.provider === 'demo' ? new DemoGenerator() : new OllamaGenerator(config.ollamaUrl, config.model),
      inject: [StudioConfig],
    },
  ],
  exports: [VECTOR_INDEX, GENERATOR],
})
export class ProvidersModule {}
