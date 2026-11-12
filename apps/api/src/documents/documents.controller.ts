import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { documentContextInputSchema, initialSettings, kinds, settingsSchema, updateSchema } from '../../../../libs/contracts/src/index.js';
import { ClassroomsService } from '../classrooms/classrooms.service.js';
import { check, editSchema } from '../http/validation.js';
import { StudioStore } from '../persistence/studio-store.js';

const createSchema = z.strictObject({ kind: z.enum(kinds), settings: settingsSchema.optional(), context: documentContextInputSchema.optional() });
const fileSchema = z.strictObject({ edit: editSchema, context: documentContextInputSchema });
const commitSchema = z.strictObject({ edit: editSchema, kind: z.enum(['Teacher', 'Ready']), acceptWarnings: z.boolean().default(false) });
const restoreSchema = z.strictObject({ edit: editSchema });

@Controller('documents')
export class DocumentsController {
  constructor(private readonly store: StudioStore, private readonly classrooms: ClassroomsService) {}

  @Get()
  list() { return this.store.list(); }

  @Post()
  async create(@Body() body: unknown) {
    const input = check(createSchema, body);
    if (input.settings?.sources.length) throw new BadRequestException('Upload sources after creating the document.');
    const settings = input.settings ?? initialSettings(input.kind);
    return this.store.create(input.context ? await this.classrooms.prefill(settings, input.context) : settings, input.context);
  }

  @Get(':id')
  document(@Param('id') id: string) { return this.store.document(id); }

  @Patch(':id')
  save(@Param('id') id: string, @Body() body: unknown) { return this.store.save(id, check(updateSchema, body)); }

  @Patch(':id/location')
  async file(@Param('id') id: string, @Body() body: unknown) {
    const { context, edit } = check(fileSchema, body);
    const current = await this.store.document(id);
    await this.classrooms.validateContext(context, current.context?.classId === context.classId);
    return this.store.fileDocument(id, edit, context);
  }

  @Get(':id/versions')
  versions(@Param('id') id: string) { return this.store.snapshots(id); }

  @Post(':id/versions')
  commit(@Param('id') id: string, @Body() body: unknown) {
    const { edit, kind, acceptWarnings } = check(commitSchema, body);
    return this.store.commit(id, edit, kind, acceptWarnings);
  }

  @Post(':id/versions/:version/restore')
  restore(@Param('id') id: string, @Param('version') version: string, @Body() body: unknown) {
    return this.store.restore(id, version, check(restoreSchema, body).edit);
  }
}
