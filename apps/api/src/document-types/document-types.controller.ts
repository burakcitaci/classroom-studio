import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { documentTypeInputSchema } from '../../../../libs/contracts/src/index.js';
import { check } from '../http/validation.js';
import { DocumentTypesService } from './document-types.service.js';

const updateSchema = documentTypeInputSchema.extend({ edit: z.number().int().nonnegative(), archived: z.boolean().default(false) });
@Controller('document-types')
export class DocumentTypesController {
  constructor(private readonly types: DocumentTypesService) {}
  @Get() list() { return this.types.list(); }
  @Post() create(@Body() body: unknown) { return this.types.create(check(documentTypeInputSchema, body)); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: unknown) { return this.types.update(id, check(updateSchema, body)); }
}
