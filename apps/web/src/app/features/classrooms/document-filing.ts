import { ui } from '../../core/i18n/ui-messages';
import { ChangeDetectionStrategy, Component, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ClassroomSummary, DocumentContext, Lesson, Revision } from '../../../../../../libs/contracts/src';
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
  readonly duplicate = input(false);
  readonly version = input<Revision>();
  protected get title() {
    return this.duplicate() ? $localize`:@@duplicateDocument:Duplicate document` : $localize`:@@ui_780a5add242b:Organize document`;
  }
  protected get description() {
    return this.duplicate() ? $localize`:@@duplicateDocumentHelp:Choose a destination for the new editable copy.`
      : $localize`:@@ui_47046024420b:Choose where this document should appear in your class planner.`;
  }
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
      this.classes.set(classes.filter(item => !item.archived || (!this.duplicate() && item.id === context?.classId)));
      if (this.duplicate() && !this.classes().some(item => item.id === this.classId)) this.classId = this.lessonId = '';
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
      const context = { classId: this.classId || null, lessonId: this.lessonId || null };
      const saved = this.duplicate() ? await this.workspace.duplicateDocument(context, this.version()) : await this.workspace.fileDocument(context);
      if (saved) {
        this.closed.emit();
      } else {
        this.error.set(this.workspace.view.error || this.title);
      }
    } finally { this.saving.set(false); }
  }
}
