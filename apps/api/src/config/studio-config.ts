export class StudioConfig {
  readonly provider: 'demo' | 'ollama';
  readonly dataDir: string;
  readonly databaseUrl: string;
  readonly databaseSchema: string;
  readonly port: number;
  readonly ollamaUrl: string;
  readonly model: string;
  readonly embedding: string;
  readonly qdrantUrl: string;
  readonly qdrantKey?: string;
  readonly demoDelay: number;

  constructor(env: NodeJS.ProcessEnv) {
    const provider = env['STUDIO_PROVIDER'] ?? 'demo';
    if (provider !== 'demo' && provider !== 'ollama') throw new Error('Set STUDIO_PROVIDER to demo or ollama.');
    this.provider = provider;
    this.dataDir = env['STUDIO_DATA'] || '.studio';
    this.databaseUrl = env['DATABASE_URL'] || 'postgresql://classroom_studio:classroom_studio_dev@127.0.0.1:5433/classroom_studio';
    this.databaseSchema = env['STUDIO_DATABASE_SCHEMA'] || 'public';
    this.port = Number(env['STUDIO_PORT'] || 4300);
    this.ollamaUrl = env['OLLAMA_URL'] || 'http://127.0.0.1:11434';
    this.model = env['OLLAMA_MODEL'] || 'qwen3:8b';
    this.embedding = env['OLLAMA_EMBED_MODEL'] || 'nomic-embed-text';
    this.qdrantUrl = env['QDRANT_URL'] || 'http://127.0.0.1:6335';
    this.qdrantKey = env['QDRANT_API_KEY'];
    this.demoDelay = provider === 'demo'
      ? env['NODE_ENV'] === 'test' ? Math.min(5000, Number(env['STUDIO_TEST_DELAY'] ?? 0)) : 400
      : 0;
  }
}
