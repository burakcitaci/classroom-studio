import { Body, Controller, Delete, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { check, editSchema } from '../http/validation.js';
import { MAX_UPLOAD } from './extract-text.js';
import { SourcesService } from './sources.service.js';

const noteSchema = z.strictObject({ name: z.string().trim().min(1).max(120), text: z.string().trim().min(1).max(9000) });

@Controller('documents/:id')
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  @Get('materials')
  materials(@Param('id') id: string) { return this.sources.materials(id); }

  @Post('materials/:source')
  attachMaterial(@Param('id') id: string, @Param('source') source: string) { return this.sources.attachMaterial(id, source); }

  @Post('sources/:source/share')
  shareMaterial(@Param('id') id: string, @Param('source') source: string) { return this.sources.shareMaterial(id, source); }

  @Post('files')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD, files: 1, fields: 0, parts: 2 } }))
  file(@Param('id') id: string, @UploadedFile() file?: Express.Multer.File) { return this.sources.addFile(id, file); }

  @Post('notes')
  note(@Param('id') id: string, @Body() body: unknown) {
    const { name, text } = check(noteSchema, body);
    return this.sources.addNote(id, name, text);
  }

  @Post('sources/:source/retry')
  retry(@Param('id') id: string, @Param('source') source: string) { return this.sources.retry(id, source); }

  @Post('sources/:source/archive')
  archive(@Param('id') id: string, @Param('source') source: string, @Body() body: unknown) {
    return this.sources.archive(id, source, check(z.strictObject({ edit: editSchema }), body).edit);
  }

  @Delete('sources/:source')
  remove(@Param('id') id: string, @Param('source') source: string) { return this.sources.remove(id, source); }
}
