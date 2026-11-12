import type { NextFunction, Request, Response } from 'express';

export function localOnly(request: Request, response: Response, next: NextFunction) {
  const isLocal = (host: string) => /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  const host = request.get('host') ?? '';
  const origin = request.get('origin');
  const badOrigin = origin && origin !== 'http://' + host && origin !== 'http://127.0.0.1:4200' && origin !== 'http://localhost:4200';
  if (!isLocal(host) || badOrigin || request.get('sec-fetch-site') === 'cross-site') {
    response.status(403).json({ message: 'Open Classroom Studio on localhost.' });
    return;
  }
  response.set('X-Content-Type-Options', 'nosniff');
  if (request.path.startsWith('/api')) response.set('Cache-Control', 'no-store');
  next();
}
