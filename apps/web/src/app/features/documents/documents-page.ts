import { DocumentTypesManager } from '../document-types/document-types-manager';
import type { DocumentType } from '../../../../../../libs/contracts/src';
import { interfaceLocale } from '../../core/i18n/locale';
import { ui } from '../../core/i18n/ui-messages';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { WorkspaceStore } from '../workspace/workspace-store';
import { TeacherDialog } from '../../shared/teacher-dialog/teacher-dialog';
import { BrnButton } from '@spartan-ng/brain/button';
import { Icon } from '../../shared/icon/icon';
import { FormsModule } from '@angular/forms';
import { kinds, type DocumentSummary } from '../../../../../../libs/contracts/src';

@Component({
  selector: 'studio-documents-page',
  imports: [BrnButton, FormsModule, Icon, TeacherDialog, DocumentTypesManager],
  templateUrl: './documents-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentsPage {
  protected readonly ui = ui;
  private readonly workspace = inject(WorkspaceStore);

  protected get vm() { return this.workspace.view; }
  protected readonly kinds = kinds;
  protected search = '';
  protected filter = 'All types';
  protected classFilter = 'all';
  protected showCreate = false;
  protected createKind = 'Exam';
  protected showTypes = false;
  protected async useType(type: DocumentType) { this.showTypes = false; await this.vm.create(type.id); }
  protected readonly createError = signal('');

  protected openCreate() {
    this.createError.set('');
    this.showCreate = true;
  }

  protected async createDocument() {
    this.createError.set('');
    if (await this.vm.create(this.createKind)) this.showCreate = false;
    else this.createError.set(this.vm.error || $localize`:@@ui_0f40473ce3e0:Could not create the document.`);
  }

  protected clearFilters() {
    this.search = '';
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
