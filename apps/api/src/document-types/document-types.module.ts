import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module.js';
import { DocumentTypesController } from './document-types.controller.js';
import { DocumentTypesService } from './document-types.service.js';

@Module({ imports: [PersistenceModule], providers: [DocumentTypesService], controllers: [DocumentTypesController], exports: [DocumentTypesService] })
export class DocumentTypesModule {}
