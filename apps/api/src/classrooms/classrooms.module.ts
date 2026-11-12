import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module.js';
import { ClassroomsController } from './classrooms.controller.js';
import { ClassroomsService } from './classrooms.service.js';

@Module({
  imports: [PersistenceModule],
  controllers: [ClassroomsController],
  providers: [ClassroomsService],
  exports: [ClassroomsService],
})
export class ClassroomsModule {}
