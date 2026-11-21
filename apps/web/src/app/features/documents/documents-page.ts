import { PageHeader, StatusBadge, StudioButton, designCopy } from '../../shared/studio-ui';
import { interfaceLocale } from '../../core/i18n/locale';
import { ui } from '../../core/i18n/ui-messages';
import { ChangeDetectionStrategy, Component, inject, signal, type OnDestroy, type OnInit } from '@angular/core';
import { WorkspaceStore } from '../workspace/workspace-store';
import { TeacherDialog } from '../../shared/teacher-dialog/teacher-dialog';
import { BrnButton } from '@spartan-ng/brain/button';
import { Icon } from '../../shared/icon/icon';
import { FormsModule } from '@angular/forms';
import { type ClassroomSummary, type DocumentPage, type DocumentSummary } from '../../../../../../libs/contracts/src';

import { StudioApi } from '../../core/studio-api';
import { ClassroomsApi } from '../classrooms/classrooms-api';

@Component({
  selector: 'studio-documents-page',
  imports: [BrnButton, FormsModule, Icon, TeacherDialog, PageHeader, StatusBadge, StudioButton],
  templateUrl: './documents-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentsPage implements OnInit, OnDestroy {
  protected readonly ui = ui;
  private readonly workspace = inject(WorkspaceStore);

  protected get vm() { return this.workspace.view; }
  private readonly api = inject(StudioApi);
  private readonly classes = inject(ClassroomsApi);
  protected readonly classOptions = signal<ClassroomSummary[]>([]);
  protected readonly page = signal<DocumentPage>({ items: [], hasMore: false });
  protected readonly loading = signal(true);
  protected readonly searchError = signal('');
  protected pageNumber = 1;
  private searchToken = 0;
  private searchTimer?: ReturnType<typeof setTimeout>;
  protected search = '';
  protected filter = 'All types';
  protected classFilter = 'all';
  protected showCreate = false;
  protected createKind = '';
  protected readonly copy = designCopy;
  protected statusFilter = 'all';
  protected get hasFilters() { return !!this.search || this.classFilter !== 'all' || this.filter !== 'All types' || this.statusFilter !== 'all'; }
  protected readonly createError = signal('');

  protected openCreate() {
    this.createError.set('');
    this.createKind = this.vm.documentTypes.items()[0]?.id ?? '';
    this.showCreate = true;
  }

  protected async createDocument() {
    this.createError.set('');
    if (await this.vm.create(this.createKind)) this.showCreate = false;
    else this.createError.set(this.vm.error || $localize`:@@ui_0f40473ce3e0:Could not create the document.`);
  }

  ngOnInit() {
    void this.classes.list().then(items => this.classOptions.set(items.sort((a, b) => a.title.localeCompare(b.title, interfaceLocale))))
      .catch(() => undefined);
    void this.loadPage(1);
  }

  ngOnDestroy() {
    this.searchToken++;
    clearTimeout(this.searchTimer);
  }

  protected filterChanged() {
    clearTimeout(this.searchTimer);
    this.searchToken++;
    this.loading.set(true);
    this.searchTimer = setTimeout(() => { void this.loadPage(1); }, 180);
  }

  protected async loadPage(number: number) {
    const token = ++this.searchToken;
    this.loading.set(true);
    this.searchError.set('');
    const query = new URLSearchParams({ query: this.search.trim(), page: String(number) });
    if (this.filter !== 'All types') query.set('type', this.filter);
    if (this.statusFilter !== 'all') query.set('status', this.statusFilter);
    if (this.classFilter !== 'all') query.set('classId', this.classFilter);
    try {
      const page = await this.api.request<DocumentPage>('/documents/search?' + query);
      if (token !== this.searchToken) return;
      this.pageNumber = number;
      this.page.set(page);
    } catch (error) {
      if (token === this.searchToken) this.searchError.set(error instanceof Error ? error.message : String(error));
    } finally {
      if (token === this.searchToken) this.loading.set(false);
    }
  }

  protected clearFilters() {
    this.search = '';
    this.statusFilter = 'all';
    this.classFilter = 'all';
    this.filter = 'All types';
    this.filterChanged();
  }

  protected get filtered() { return this.page().items; }

  protected summaryLabel(item: DocumentSummary) {
    if (item.context) return [item.context.classTitle, item.context.lessonTitle].filter(Boolean).join(' · ');
    return [item.subject, item.grade].filter(Boolean).join(' · ') || (item.language === 'de' ? $localize`:@@ui_da91388c72d3:German` : $localize`:@@ui_649df08a448e:English`);
  }
  protected shortDate(value: string) { return new Date(value).toLocaleDateString(interfaceLocale, { month: 'short', day: 'numeric' }); }
}
