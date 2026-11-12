import { Module } from '@nestjs/common';
import { ClassroomsModule } from '../classrooms/classrooms.module.js';
import { PersistenceModule } from '../persistence/persistence.module.js';
import { DocumentsController } from './documents.controller.js';

@Module({ imports: [PersistenceModule, ClassroomsModule], controllers: [DocumentsController] })
export class DocumentsModule {}
