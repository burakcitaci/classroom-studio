import { randomUUID } from 'node:crypto';
import { Document, Packer, Paragraph } from 'docx';
import { fromBuffer } from 'yauzl';

export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function until(check, { timeout = 10_000, interval = 80 } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await wait(interval);
  }
  throw new Error('Timed out waiting for the expected state.');
}

export async function word(text) {
  return Packer.toBuffer(new Document({ sections: [{ children: text.split('\n').map(line => new Paragraph(line)) }] }));
}

export function readZip(buffer) {
  return new Promise((resolve, reject) => {
    const files = {};
    fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      zip.on('error', reject);
      zip.on('end', () => resolve(files));
      zip.on('entry', entry => {
        if (entry.fileName.endsWith('/')) { zip.readEntry(); return; }
        zip.openReadStream(entry, (error, stream) => {
          if (error) return reject(error);
          const parts = [];
          stream.on('data', part => parts.push(part));
          stream.on('error', reject);
          stream.on('end', () => { files[entry.fileName] = Buffer.concat(parts).toString(); zip.readEntry(); });
        });
      });
      zip.readEntry();
    });
  });
}

export function pdf(message) {
  const content = message ? 'BT /F1 16 Tf 72 700 Td (' + message + ') Tj ET' : 'q 0.8 g 20 20 40 40 re f Q';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream',
  ];
  let file = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(file.length);
    file += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
  }
  const xref = file.length;
  file += 'xref\n0 ' + offsets.length + '\n0000000000 65535 f \n' +
    offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('') +
    'trailer\n<< /Size ' + offsets.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(file, 'ascii');
}

export function apiClient(origin) {
  async function send(path, { method = 'GET', body, key, headers = {} } = {}) {
    return fetch(origin + '/api' + path, {
      method, headers: { ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
        ...(key ? { 'idempotency-key': key } : {}), ...headers },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
  }
  async function json(path, options) {
    const response = await send(path, options);
    if (!response.ok) throw new Error(response.status + ' ' + await response.text());
    return response.json();
  }
  const doc = id => json('/documents/' + id);
  const jobList = id => json('/documents/' + id + '/jobs');
  const create = () => json('/documents', { method: 'POST', body: { kind: 'Exam' } });
  const update = (data, changes) => json('/documents/' + data.id, { method: 'PATCH', body: { edit: data.edit,
    settings: data.settings, draft: data.draft, ...changes } });
  const upload = (id, name, bytes) => {
    const body = new FormData();
    body.append('file', new Blob([bytes]), name);
    return json('/documents/' + id + '/files', { method: 'POST', body });
  };
  const attempt = (data, settings, key = randomUUID()) => json('/documents/' + data.id + '/jobs',
    { method: 'POST', key, body: { edit: data.edit, settings } });
  const terminal = (id, job, timeout) => until(async () => (await jobList(id)).find(row =>
    row.id === job.id && ['failed', 'succeeded'].includes(row.stage)), { timeout, interval: 100 });
  const sourcesReady = (id, sources, timeout) => until(async () => {
    const value = await doc(id);
    const found = value.sources.filter(item => sources.some(source => source.id === item.id));
    return found.length === sources.length && found.every(item => ['ready', 'error'].includes(item.status)) ? value : null;
  }, { timeout, interval: 100 });
  return { send, json, doc, jobList, create, update, upload, attempt, terminal, sourcesReady };
}
