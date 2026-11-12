import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module.js';
import { ExportsController } from './exports.controller.js';

@Module({ imports: [PersistenceModule], controllers: [ExportsController] })
export class ExportsModule {}
