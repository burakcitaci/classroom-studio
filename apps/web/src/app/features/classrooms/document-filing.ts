import { ui } from '../../core/i18n/ui-messages';
import { ChangeDetectionStrategy, Component, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ClassroomSummary, DocumentContext, Lesson } from '../../../../../../libs/contracts/src';
import { TeacherDialog } from '../../shared/teacher-dialog/teacher-dialog';
import { WorkspaceStore } from '../workspace/workspace-store';
import { ClassroomsApi } from './classrooms-api';

@Component({
  selector: 'studio-document-filing',
  imports: [FormsModule, TeacherDialog],
  templateUrl: './document-filing.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentFiling implements OnInit {
  protected readonly ui = ui;
  readonly context = input.required<DocumentContext | null>();
  readonly closed = output<void>();
  private readonly api = inject(ClassroomsApi);
  private readonly workspace = inject(WorkspaceStore);
  private loadId = 0;

  protected classId = '';
  protected lessonId = '';
  protected readonly classes = signal<ClassroomSummary[]>([]);
  protected readonly lessons = signal<Lesson[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  async ngOnInit() {
    const context = this.context();
    this.classId = context?.classId ?? '';
    this.lessonId = context?.lessonId ?? '';
    try {
      const classes = await this.api.list();
      this.classes.set(classes.filter(item => !item.archived || item.id === context?.classId));
      await this.loadLessons();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : $localize`:@@ui_c3965316d97f:Could not load classes.`);
      this.loading.set(false);
    }
  }

  protected chooseClass(id: string) {
    this.classId = id;
    this.lessonId = '';
    void this.loadLessons();
  }

  private async loadLessons() {
    const token = ++this.loadId;
    this.loading.set(true);
    this.error.set('');
    try {
      const detail = this.classId ? await this.api.detail(this.classId) : null;
      if (token === this.loadId) this.lessons.set(detail?.lessons ?? []);
    } catch (error) {
      if (token === this.loadId) this.error.set(error instanceof Error ? error.message : $localize`:@@ui_588c1089d9f6:Could not load lessons.`);
    } finally {
      if (token === this.loadId) this.loading.set(false);
    }
  }

  protected async save() {
    this.saving.set(true);
    try {
      if (await this.workspace.fileDocument({ classId: this.classId || null, lessonId: this.lessonId || null })) {
        this.closed.emit();
      } else {
        this.error.set(this.workspace.view.error || $localize`:@@ui_4e82cdc69cd3:Could not file this document.`);
      }
    } finally { this.saving.set(false); }
  }
}
