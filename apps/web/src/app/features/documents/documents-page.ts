import { PageHeader, StatusBadge, StudioButton, designCopy } from '../../shared/studio-ui';
import { interfaceLocale } from '../../core/i18n/locale';
import { ui } from '../../core/i18n/ui-messages';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { WorkspaceStore } from '../workspace/workspace-store';
import { TeacherDialog } from '../../shared/teacher-dialog/teacher-dialog';
import { BrnButton } from '@spartan-ng/brain/button';
import { Icon } from '../../shared/icon/icon';
import { FormsModule } from '@angular/forms';
import { type DocumentSummary } from '../../../../../../libs/contracts/src';

@Component({
  selector: 'studio-documents-page',
  imports: [BrnButton, FormsModule, Icon, TeacherDialog, PageHeader, StatusBadge, StudioButton],
  templateUrl: './documents-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentsPage {
  protected readonly ui = ui;
  private readonly workspace = inject(WorkspaceStore);

  protected get vm() { return this.workspace.view; }
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

  protected clearFilters() {
    this.search = '';
    this.statusFilter = 'all';
    this.classFilter = 'all';
    this.filter = 'All types';
  }

  protected get classOptions() {
    const options = new Map(this.vm.list.flatMap(item => item.context ? [[item.context.classId, item.context.classTitle] as const] : []));
    return [...options].sort((a, b) => a[1].localeCompare(b[1]));
  }

  protected get filtered() {
    const term = this.search.toLowerCase().trim();
    return this.vm.list.filter(item => (this.filter === 'All types' || (item.documentType?.id === this.filter || item.kind === this.filter)) &&
      (this.statusFilter === 'all' || item.status === this.statusFilter) &&
      (this.classFilter === 'all' || this.classFilter === (item.context?.classId ?? 'unfiled')) &&
      [item.title, item.subject, item.grade, item.context?.classTitle ?? '', item.context?.lessonTitle ?? '']
        .some(value => value.toLowerCase().includes(term)));
  }

  protected summaryLabel(item: DocumentSummary) {
    if (item.context) return [item.context.classTitle, item.context.lessonTitle].filter(Boolean).join(' · ');
    return [item.subject, item.grade].filter(Boolean).join(' · ') || (item.language === 'de' ? $localize`:@@ui_da91388c72d3:German` : $localize`:@@ui_649df08a448e:English`);
  }
  protected shortDate(value: string) { return new Date(value).toLocaleDateString(interfaceLocale, { month: 'short', day: 'numeric' }); }
}
