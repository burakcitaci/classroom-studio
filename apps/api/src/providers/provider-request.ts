export class ProviderError extends Error {}

export class ProviderHttpError extends ProviderError {
  constructor(name: string, readonly status: number, readonly detail?: string) {
    super(name + ' rejected the request (HTTP ' + status + '). Check the local service and model settings.');
  }
}

export async function localRequest(base: string, path: string, options: {
  body?: unknown; method?: string; timeout: number; key?: string; name: string; allowMissing?: boolean;
}): Promise<unknown> {
  try {
    const response = await fetch(new URL(path, base), {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(options.key ? { 'api-key': options.key } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeout),
      redirect: 'error',
    });
    if (response.status === 404 && options.allowMissing) return null;
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      const detail = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error.slice(0, 500) : undefined;
      throw new ProviderHttpError(options.name, response.status, detail);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(options.name + ' did not respond. Check that it is running and try again.');
  }
}
