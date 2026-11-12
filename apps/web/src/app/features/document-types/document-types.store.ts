import { Injectable, inject, signal } from '@angular/core';
import type { DocumentType, DocumentTypeInput } from '../../../../../../libs/contracts/src';
import { StudioApi } from '../../core/studio-api';
import { Notifications } from '../../core/notifications';

@Injectable({ providedIn: 'root' })
export class DocumentTypesStore {
  private readonly api = inject(StudioApi);
  private readonly notifications = inject(Notifications);
  readonly items = signal<DocumentType[]>([]);
  readonly loading = signal(false);
  private pending?: Promise<void>;
  load(): Promise<void> {
    if (this.pending) return this.pending;
    this.loading.set(true);
    this.pending = this.api.request<DocumentType[]>('/document-types').then(items => { this.items.set(items); })
      .catch(() => { this.notifications.error($localize`:@@typesLoadError:Could not load document types. Try again.`); })
      .finally(() => { this.pending = undefined; this.loading.set(false); });
    return this.pending;
  }
  async save(input: DocumentTypeInput, current?: DocumentType, archived = false): Promise<DocumentType> {
    const result = await this.api.request<DocumentType>('/document-types' + (current ? '/' + current.id : ''), {
      method: current ? 'PATCH' : 'POST', body: current ? { ...input, edit: current.edit, archived } : input,
    });
    this.items.update(items => [...items.filter(item => item.id !== result.id), ...(!result.archived ? [result] : [])]
      .sort((a, b) => a.title.localeCompare(b.title)));
    return result;
  }
}
