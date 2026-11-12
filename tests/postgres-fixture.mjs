import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

export async function postgresFixture(schema = 'studio_test_' + randomUUID().replaceAll('-', '')) {
  if (!/^studio_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Unexpected PostgreSQL test schema.');
  const url = process.env.DATABASE_URL ?? 'postgresql://classroom_studio:classroom_studio_dev@127.0.0.1:5433/classroom_studio';
  const admin = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5000 });
  try {
    await admin.query('CREATE SCHEMA "' + schema + '"');
  } catch (error) {
    await admin.end();
    throw error;
  }
  return {
    env: { DATABASE_URL: url, STUDIO_DATABASE_SCHEMA: schema },
    async close() {
      if (!/^studio_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Unexpected PostgreSQL test schema.');
      try { await admin.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE'); }
      finally { await admin.end(); }
    },
  };
}

export async function dropTestSchema(schema) {
  if (!/^studio_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Unexpected PostgreSQL test schema.');
  const admin = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://classroom_studio:classroom_studio_dev@127.0.0.1:5433/classroom_studio',
    max: 1, connectionTimeoutMillis: 5000,
  });
  try { await admin.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE'); }
  finally { await admin.end(); }
}
