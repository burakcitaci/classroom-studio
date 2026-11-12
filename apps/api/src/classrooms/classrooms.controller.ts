import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { classroomSchema, lessonSchema } from '../../../../libs/contracts/src/index.js';
import { check } from '../http/validation.js';
import { ClassroomsService } from './classrooms.service.js';

const archiveSchema = z.strictObject({ archived: z.boolean() });

@Controller('classes')
export class ClassroomsController {
  constructor(private readonly classrooms: ClassroomsService) {}

  @Get()
  list() { return this.classrooms.list(); }

  @Post()
  create(@Body() body: unknown) { return this.classrooms.create(check(classroomSchema, body)); }

  @Get(':classId')
  detail(@Param('classId') classId: string) { return this.classrooms.detail(classId); }

  @Patch(':classId')
  update(@Param('classId') classId: string, @Body() body: unknown) {
    return this.classrooms.update(classId, check(classroomSchema, body));
  }

  @Patch(':classId/status')
  archive(@Param('classId') classId: string, @Body() body: unknown) {
    return this.classrooms.archive(classId, check(archiveSchema, body).archived);
  }

  @Post(':classId/lessons')
  createLesson(@Param('classId') classId: string, @Body() body: unknown) {
    return this.classrooms.createLesson(classId, check(lessonSchema, body));
  }

  @Patch(':classId/lessons/:lessonId')
  updateLesson(@Param('classId') classId: string, @Param('lessonId') lessonId: string, @Body() body: unknown) {
    return this.classrooms.updateLesson(classId, lessonId, check(lessonSchema, body));
  }
}
