import { BadRequestException, Controller, Get, Header, Param, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { check } from '../http/validation.js';
import { StudioStore } from '../persistence/studio-store.js';
import { exportDocx, exportPrint } from './assessment-export.js';

const copySchema = z.enum(['student', 'teacher']);
const formatSchema = z.enum(['docx', 'print']);

@Controller('documents/:id/export')
export class ExportsController {
  constructor(private readonly store: StudioStore) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async export(@Param('id') id: string, @Query('copy') copyValue: string, @Query('format') formatValue: string,
    @Query('version') version: string | undefined, @Res({ passthrough: true }) response: Response) {
    const copy = check(copySchema, copyValue);
    const format = check(formatSchema, formatValue);
    const data = version ? await this.store.snapshot(id, version) : await this.store.document(id);
    if (!data.draft) throw new BadRequestException('Generate a draft before exporting.');
    if (format === 'print') {
      response.type('html');
      response.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'");
      return exportPrint(data.draft, data.settings, copy);
    }
    return new StreamableFile(await exportDocx(data.draft, data.settings, copy), {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      disposition: 'attachment; filename="classroom-studio-' + copy + '.docx"',
    });
  }
}
