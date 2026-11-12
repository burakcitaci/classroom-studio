import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async name => JSON.parse(await readFile(new URL('../apps/web/src/locale/' + name, import.meta.url), 'utf8')).translations;
const source = await read('messages.extracted.json');
const placeholders = message => [...message.matchAll(/\{\$([^}]+)\}/g)].map(match => match[1]).sort();
for (const locale of ['en', 'de']) {
  const translations = await read('messages.' + locale + '.json');
  for (const [id, message] of Object.entries(source)) {
    assert.equal(typeof translations[id], 'string', locale + ': missing translation for ' + id + ' (' + message + ')');
    assert.ok(translations[id].trim(), locale + ': empty translation for ' + id);
    assert.deepEqual(placeholders(translations[id]), placeholders(message), locale + ': mismatched placeholders for ' + id);
  }
}
console.log('English and German cover all ' + Object.keys(source).length + ' extracted Angular messages.');
