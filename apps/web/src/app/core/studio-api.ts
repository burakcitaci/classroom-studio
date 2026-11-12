import { ui } from './i18n/ui-messages';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  key?: string;
}

@Injectable({ providedIn: 'root' })
export class StudioApi {
  private readonly http = inject(HttpClient);

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    try {
      return await firstValueFrom(this.http.request<T>(options.method ?? 'GET', '/api' + path, {
        body: options.body,
        headers: options.key ? { 'Idempotency-Key': options.key } : undefined,
      }));
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        const message = typeof error.error?.message === 'string' ? error.error.message : $localize`:@@ui_d017fd0e6715:The request could not be completed.`;
        throw new ApiError(ui(message), error.status);
      }
      throw error;
    }
  }
}
