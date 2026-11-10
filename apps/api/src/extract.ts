import { SaxesParser } from 'saxes';
import { fromBuffer, type Entry, type ZipFile } from 'yauzl';

export const MAX_UPLOAD = 10 * 1024 * 1024;
export const MAX_TEXT = 64_000;
export const MAX_CHUNKS = 80;
export const MAX_SOURCES = 8;

export function normalize(text: string) {
  return text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function splitText(text: string): string[] {
  const paragraphs = normalize(text).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (const paragraph of paragraphs) {
    let offset = 0;
    while (offset < paragraph.length) {
      let end = Math.min(offset + 1050, paragraph.length);
      if (end < paragraph.length) {
        const breakAt = paragraph.lastIndexOf(' ', end);
        if (breakAt > offset + 800) end = breakAt;
      }
      chunks.push(paragraph.slice(offset, end).trim());
      if (chunks.length >= MAX_CHUNKS) throw new Error('Too many passages. Split the material into shorter files.');
      offset = end >= paragraph.length ? end : end - 100;
    }
  }
  return chunks;
}

function readZip(buffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const missing = new Error('This file does not contain a Word document. Save it again as .docx.');
    fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) return reject(missing);
      let found = false;
      zip.on('error', reject);
      zip.on('end', () => { if (!found) reject(missing); });
      zip.on('entry', (entry: Entry) => {
        if (entry.fileName !== 'word/document.xml') {
          zip.readEntry();
          return;
        }
        found = true;
        readEntry(zip, entry).then(resolve, reject).finally(() => zip.close());
      });
      if (zip.entryCount > 1500) {
        zip.close();
        reject(new Error('This Word file has too many parts. Save a text-only copy and upload that.'));
        return;
      }
      zip.readEntry();
    });
  });
}

function readEntry(zip: ZipFile, entry: Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const limit = 3 * 1024 * 1024;
    const errorMessage = 'This Word document is too complex. Save a shorter text-only copy.';
    if (entry.uncompressedSize > limit) return reject(new Error(errorMessage));
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) return reject(new Error('The Word file could not be read. Save it again and retry.'));
      const parts: Buffer[] = [];
      let size = 0;
      stream.on('data', (part: Buffer) => {
        size += part.length;
        if (size > limit) stream.destroy(new Error(errorMessage));
        else parts.push(part);
      });
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(parts)));
    });
  });
}

async function wordText(buffer: Buffer) {
  const xml = (await readZip(buffer)).toString('utf8');
  const parser = new SaxesParser({ xmlns: true });
  const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  let text = '';
  let reading = false;
  parser.on('doctype', () => { throw new Error('Unsupported Word markup. Save a text-only copy.'); });
  parser.on('opentag', tag => {
    if (tag.uri !== namespace) return;
    if (tag.local === 't') reading = true;
    if (tag.local === 'tab' || tag.local === 'br') text += ' ';
  });
  parser.on('text', content => { if (reading) text += content; });
  parser.on('closetag', tag => {
    if (tag.uri !== namespace) return;
    if (tag.local === 't') reading = false;
    if (tag.local === 'p') text += '\n\n';
  });
  parser.write(xml).close();
  return text;
}

export async function extractText(buffer: Buffer, extension: string) {
  let raw: string;
  switch (extension) {
    case '.pdf': {
      if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('The file is not a readable PDF. Export it again as PDF.');
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buffer), disableFontFace: true, isEvalSupported: false, verbosity: 0 });
      try {
        const result = await parser.getText({ first: 40, pageJoiner: '\n\n' });
        if (result.total > 40) throw new Error('PDFs are limited to 40 pages. Upload a shorter extract.');
        raw = result.text;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('PDFs are limited')) throw error;
        throw new Error('This PDF could not be read. Unlock it or export a new PDF with selectable text.');
      } finally {
        await parser.destroy();
      }
      break;
    }
    case '.docx': {
      try { raw = await wordText(buffer); }
      catch { throw new Error('This DOCX is unreadable or too complex. Save a fresh Word copy or upload a TXT file.'); }
      break;
    }
    case '.txt': {
      try { raw = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
      catch { throw new Error('Save the text file as UTF-8 and upload it again.'); }
      if (raw.includes('\u0000')) throw new Error('Upload a plain UTF-8 text file.');
      break;
    }
    default: throw new Error('Upload a PDF, DOCX, or UTF-8 TXT file.');
  }
  const text = normalize(raw);
  if (text.length > MAX_TEXT) throw new Error('The extracted text is too long. Split the material into shorter files.');
  if (!/[\p{L}\p{N}]{2}/u.test(text)) {
    throw new Error(extension === '.pdf'
      ? 'No selectable text found. Run OCR on the scanned PDF or paste the text as notes.'
      : 'No readable text found. Add text or upload a text-only copy.');
  }
  return { text, chunks: splitText(text) };
}
