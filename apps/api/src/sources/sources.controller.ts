import { Body, Controller, Delete, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { check } from '../http/validation.js';
import { MAX_UPLOAD } from './extract-text.js';
import { SourcesService } from './sources.service.js';

const noteSchema = z.strictObject({ name: z.string().trim().min(1).max(120), text: z.string().trim().min(1).max(9000) });

@Controller('documents/:id')
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

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

  @Delete('sources/:source')
  remove(@Param('id') id: string, @Param('source') source: string) { return this.sources.remove(id, source); }
}
