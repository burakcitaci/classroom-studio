import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { documentContextInputSchema, initialSettings, kinds, settingsSchema, updateSchema, uuid } from '../../../../libs/contracts/src/index.js';
import { ClassroomsService } from '../classrooms/classrooms.service.js';
import { check, editSchema } from '../http/validation.js';
import { StudioStore } from '../persistence/studio-store.js';

const createSchema = z.strictObject({ kind: z.enum(kinds), settings: settingsSchema.optional(), context: documentContextInputSchema.optional() });
const fileSchema = z.strictObject({ edit: editSchema, context: documentContextInputSchema });
const commitSchema = z.strictObject({ edit: editSchema, kind: z.enum(['Teacher', 'Ready']), acceptWarnings: z.boolean().default(false) });
const duplicateSchema = fileSchema.extend({ version: uuid.optional() });
const searchSchema = z.strictObject({
  query: z.string().trim().max(240).default(''),
  type: z.union([uuid, z.enum(kinds)]).optional(),
  status: z.enum(['Ready', 'Draft', 'Planning']).optional(),
  classId: z.union([uuid, z.literal('unfiled')]).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
});
const restoreSchema = z.strictObject({ edit: editSchema });
const renameSchema = z.strictObject({ name: z.string().trim().max(120), nameEdit: editSchema });

@Controller('documents')
export class DocumentsController {
  constructor(private readonly store: StudioStore, private readonly classrooms: ClassroomsService) {}

  @Get()
  list() { return this.store.list(); }

  @Get('search')
  search(@Query() query: unknown) { return this.store.searchDocuments(check(searchSchema, query)); }

  @Post()
  async create(@Body() body: unknown) {
    const input = check(createSchema, body);
    if (input.settings?.sources.length) throw new BadRequestException('Upload sources after creating the document.');
    const settings = input.settings ?? initialSettings(input.kind);
    return this.store.create(input.context ? await this.classrooms.prefill(settings, input.context) : settings, input.context);
  }

  @Get(':id')
  document(@Param('id') id: string) { return this.store.document(id); }

  @Get(':id/activity')
  activity(@Param('id') id: string) { return this.store.activity(id); }

  @Patch(':id')
  save(@Param('id') id: string, @Body() body: unknown) { return this.store.save(id, check(updateSchema, body)); }

  @Patch(':id/location')
  async file(@Param('id') id: string, @Body() body: unknown) {
    const { context, edit } = check(fileSchema, body);
    const current = await this.store.document(id);
    await this.classrooms.validateContext(context, current.context?.classId === context.classId);
    return this.store.fileDocument(id, edit, context);
  }

  @Post(':id/duplicate')
  async duplicate(@Param('id') id: string, @Body() body: unknown) {
    const { edit, context, version } = check(duplicateSchema, body);
    await this.classrooms.validateContext(context);
    return this.store.duplicate(id, edit, context, version);
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

  @Patch(':id/versions/:version')
  renameVersion(@Param('id') id: string, @Param('version') version: string, @Body() body: unknown) {
    const { name, nameEdit } = check(renameSchema, body);
    return this.store.renameSnapshot(id, version, name, nameEdit);
  }
}
