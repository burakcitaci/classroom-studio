import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { StudioConfig } from '../dist/api/apps/api/src/config/studio-config.js';
import { StudioStore } from '../dist/api/apps/api/src/persistence/studio-store.js';

const tables = [
  'classrooms', 'lessons', 'documents', 'document_types', 'sources', 'class_materials', 'chunks', 'revisions', 'jobs',
];
const positioned = ['lessons', 'sources', 'jobs'];
const manifestName = 'classroom-studio-backup.json';
const schemaName = /^[a-z][a-z0-9_]{0,62}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const config = new StudioConfig(process.env);

function originals(sources) {
  return sources.filter(source => source.type === 'file' && !source.original_id).map(source => source.id);
}

async function create(directory) {
  await mkdir(directory);
  await mkdir(join(directory, 'uploads'));
  const store = await StudioStore.connect(config.dataDir, config.databaseUrl, config.databaseSchema);
  try {
    await store.transaction(async () => {
      await store.run('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const records = {};
      for (const table of tables) {
        const row = await store.one('SELECT coalesce(json_agg(t), \'[]\'::json)::text AS data FROM ' + table + ' t');
        records[table] = JSON.parse(row.data);
      }
      const uploads = {};
      for (const id of originals(records.sources)) {
        const target = join(directory, 'uploads', id);
        await copyFile(store.file(id), target, constants.COPYFILE_EXCL);
        uploads[id] = sha256(await readFile(target));
      }
      const migrations = (await store.all('SELECT name FROM migrations ORDER BY name')).map(row => row.name);
      await writeFile(join(directory, manifestName), JSON.stringify({ format: 1, migrations, records, uploads }, null, 2), { flag: 'wx' });
    });
  } finally { await store.close(); }
  console.log('Created a Classroom Studio backup in ' + directory);
}

async function inspect(directory) {
  const backup = JSON.parse(await readFile(join(directory, manifestName), 'utf8'));
  if (backup.format !== 1 || !Array.isArray(backup.migrations) ||
    !tables.every(table => Array.isArray(backup.records?.[table])) || !backup.uploads ||
    typeof backup.uploads !== 'object' || Array.isArray(backup.uploads)) {
    throw new Error('This directory does not contain a supported Classroom Studio backup.');
  }
  const ids = new Set(originals(backup.records.sources));
  if (ids.size !== Object.keys(backup.uploads).length) throw new Error('The upload list does not match the source records.');
  for (const id of ids) {
    if (typeof id !== 'string' || !uuid.test(id) || !Object.hasOwn(backup.uploads, id)) {
      throw new Error('The backup contains an invalid upload name.');
    }
    const upload = await readFile(join(directory, 'uploads', id));
    if (sha256(upload) !== backup.uploads[id]) throw new Error('An original upload could not be verified.');
  }
  console.table(Object.fromEntries([...tables.map(table => [table, backup.records[table].length]), ['original uploads', ids.size]]));
  return backup;
}

async function restore(directory, schema, dataDirectory) {
  if (!schemaName.test(schema)) throw new Error('Choose a new PostgreSQL schema using lowercase letters, digits and underscores.');
  const backup = await inspect(directory);
  const admin = new Pool({ connectionString: config.databaseUrl, max: 1, connectionTimeoutMillis: 5000 });
  try {
    if ((await admin.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [schema])).rowCount) {
      throw new Error('Choose a schema that does not already exist.');
    }
    await mkdir(dataDirectory);
    await admin.query('CREATE SCHEMA "' + schema + '"');
  } finally { await admin.end(); }

  const store = await StudioStore.connect(dataDirectory, config.databaseUrl, schema);
  try {
    const migrations = (await store.all('SELECT name FROM migrations ORDER BY name')).map(row => row.name);
    if (JSON.stringify(migrations) !== JSON.stringify(backup.migrations)) {
      throw new Error('Restore this backup with a build that uses the same database migrations.');
    }
    for (const [id, digest] of Object.entries(backup.uploads)) {
      const upload = await readFile(join(directory, 'uploads', id));
      if (sha256(upload) !== digest) throw new Error('An original upload changed after verification.');
      await writeFile(store.file(id), upload, { flag: 'wx' });
    }
    await store.transaction(async () => {
      for (const table of tables) {
        await store.run('INSERT INTO ' + table + ' SELECT * FROM json_populate_recordset(NULL::' + table + ', $1::json)',
          JSON.stringify(backup.records[table]));
      }
      for (const table of positioned) {
        await store.run("SELECT setval(pg_get_serial_sequence($1, 'position'), GREATEST(1, COALESCE(max(position), 1)), count(*) > 0) FROM " + table, table);
      }
    });
  } finally { await store.close(); }
  console.log('Restored into PostgreSQL schema ' + schema + ' with uploads in ' + dataDirectory);
  console.log('Set STUDIO_DATABASE_SCHEMA and STUDIO_DATA to those destinations before starting Studio.');
}

try {
  const [action, directory, schema, dataDirectory, ...extra] = process.argv.slice(2);
  if (!directory || extra.length) throw new Error('Usage: studio-backup create|inspect DIRECTORY or studio-backup restore DIRECTORY NEW_SCHEMA NEW_DATA_DIR');
  if (action === 'create' && !schema) await create(resolve(directory));
  else if (action === 'inspect' && !schema) await inspect(resolve(directory));
  else if (action === 'restore' && schema && dataDirectory) await restore(resolve(directory), schema, resolve(dataDirectory));
  else throw new Error('Usage: studio-backup create|inspect DIRECTORY or studio-backup restore DIRECTORY NEW_SCHEMA NEW_DATA_DIR');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
