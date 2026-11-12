import { dropTestSchema } from './postgres-fixture.mjs';

export default async function teardown() {
  const schema = process.env['STUDIO_BROWSER_SCHEMA'];
  if (schema) await dropTestSchema(schema);
}
