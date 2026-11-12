import { designCopy, Skeleton } from '../../shared/studio-ui';
import { interfaceLocale } from '../../core/i18n/locale';
import { ui } from '../../core/i18n/ui-messages';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  type Brief, type Classroom, type ClassroomDetail, type ClassroomInput, type ClassroomSummary,
  type DocumentContextInput, type DocumentSummary, type Lesson, type LessonInput,
} from '../../../../../../libs/contracts/src';
import { BrnButton } from '@spartan-ng/brain/button';
import { Icon } from '../../shared/icon/icon';
import { TeacherDialog } from '../../shared/teacher-dialog/teacher-dialog';
import { WorkspaceStore } from '../workspace/workspace-store';
import { ClassroomsApi } from './classrooms-api';
import { ClassDocuments } from './class-documents';

type Form =
  | { kind: 'class'; value: ClassroomInput; id?: string }
  | { kind: 'lesson'; classId: string; value: LessonInput; id?: string }
  | { kind: 'document'; context: DocumentContextInput; label: string; value: string };

const emptyClass: ClassroomInput = { title: '', subject: '', grade: '', schoolYear: '', description: '', language: interfaceLocale };
const emptyLesson: LessonInput = { title: '', description: '', goals: '', date: null };
const example: ClassroomInput = {
  ...emptyClass, title: $localize`:@@ui_a5f210429e36:Biology · Grade 5`, subject: $localize`:@@ui_ffa48e0bbc31:Biology`, grade: $localize`:@@ui_75fd665a6b14:Grade 5`,
  description: $localize`:@@ui_f906d482ff78:Life science lessons, investigations, and assessments for Grade 5.`,
};

@Component({
  selector: 'studio-classrooms-page',
  imports: [BrnButton, FormsModule, Icon, TeacherDialog, ClassDocuments, Skeleton],
  templateUrl: './classrooms-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassroomsPage {
  protected readonly ui = ui;
  protected readonly copy = designCopy;
  readonly locationChange = output<{ classTitle: string; lessonTitle?: string } | null>();
  protected readonly nextLessons = signal<Record<string, Lesson | undefined>>({});
  protected readonly sortedLessons = computed(() => [...(this.detail()?.lessons ?? [])].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999')));
  protected subjectHue(subject: string) { return [...subject].reduce((hue, letter) => (hue * 31 + letter.charCodeAt(0)) % 360, 160); }
  protected sample() { void this.workspace.create('Exam', true); }
  readonly classId = input<string>();
  readonly lessonId = input<string>();
  private readonly workspace = inject(WorkspaceStore);
  private readonly api = inject(ClassroomsApi);
  private loadId = 0;

  protected get customTypes() { return this.workspace.documentTypes.items(); }
  protected readonly search = signal('');
  protected readonly archived = signal(false);
  protected readonly classes = signal<ClassroomSummary[]>([]);
  protected readonly detail = signal<ClassroomDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly formError = signal('');
  protected readonly saving = signal(false);
  protected readonly form = signal<Form | null>(null);

  protected readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();
    return this.classes().filter(item => item.archived === this.archived() &&
      [item.title, item.subject, item.grade, item.schoolYear].some(value => value.toLowerCase().includes(query)));
  });
  protected readonly activeCount = computed(() => this.classes().filter(item => !item.archived).length);
  protected readonly archiveCount = computed(() => this.classes().length - this.activeCount());
  protected readonly lesson = computed(() => this.detail()?.lessons.find(item => item.id === this.lessonId()));
  protected readonly documents = computed(() => {
    const docs = this.detail()?.documents ?? [];
    const lesson = this.lesson();
    return lesson ? docs.filter(item => item.context?.lessonId === lesson.id) : docs;
  });

  constructor() {
    effect(() => {
      const id = this.classId();
      this.lessonId();
      untracked(() => void this.load(id));
    });
  }

  private async load(id?: string) {
    const token = ++this.loadId;
    if (this.detail()?.classroom.id !== id) this.detail.set(null);
    this.loading.set(true);
    this.error.set('');
    try {
      if (id) {
        const detail = await this.api.detail(id);
        if (token === this.loadId) {
          this.detail.set(detail);
          this.locationChange.emit({ classTitle: detail.classroom.title, lessonTitle: detail.lessons.find(item => item.id === this.lessonId())?.title });
        }
      } else {
        const list = await this.api.list();
        if (token === this.loadId) {
          this.classes.set(list);
          this.locationChange.emit(null);
          void this.loadNextLessons(list, token);
        }
      }
    } catch (error) {
      if (token === this.loadId) this.error.set(this.message(error));
    } finally {
      if (token === this.loadId) this.loading.set(false);
    }
  }

  private async loadNextLessons(list: ClassroomSummary[], token: number) {
    const today = new Date().toLocaleDateString('sv-SE');
    const rows = await Promise.all(list.filter(item => !item.archived && item.lessonCount).map(async item => {
      try { const detail = await this.api.detail(item.id); return [item.id, detail.lessons.filter(lesson => lesson.date && lesson.date >= today).sort((a, b) => a.date!.localeCompare(b.date!))[0]] as const; }
      catch { return [item.id, undefined] as const; }
    }));
    if (token === this.loadId) this.nextLessons.set(Object.fromEntries(rows));
  }

  protected openClass(id?: string, lesson?: string) { void this.workspace.openClass(id, lesson, true); }

  protected openDocument(document: DocumentSummary) {
    void this.workspace.open(document.id, document.status === 'Planning' ? 'brief' : 'editor', true);
  }

  protected newClass(useExample = false) {
    this.edit({ kind: 'class', value: { ...(useExample ? example : emptyClass) } });
  }

  protected editClass({ id, title, subject, grade, schoolYear, description, language }: Classroom) {
    this.edit({ kind: 'class', id, value: { title, subject, grade, schoolYear, description, language } });
  }

  protected editLesson(classId: string, lesson?: Lesson) {
    const value = lesson ? { title: lesson.title, description: lesson.description, goals: lesson.goals, date: lesson.date } : { ...emptyLesson };
    this.edit({ kind: 'lesson', classId, id: lesson?.id, value });
  }

  protected manageTypes() { this.close(); void this.workspace.openTypes(true); }

  protected newDocument(classroom: Classroom, lesson?: Lesson) {
    this.edit({ kind: 'document', context: { classId: classroom.id, lessonId: lesson?.id ?? null },
      label: lesson?.title ?? classroom.title, value: this.customTypes[0]?.id ?? '' });
  }

  private edit(form: Form) {
    this.formError.set('');
    this.form.set(form);
  }

  protected close() { this.form.set(null); }

  protected async save(form: Form) {
    if (this.saving()) return;
    this.saving.set(true);
    this.formError.set('');
    try {
      if (form.kind === 'class') {
        const classroom = await this.api.saveClass(form.value, form.id);
        if (form.id) await this.load(classroom.id);
        else await this.workspace.openClass(classroom.id, undefined, true);
      } else if (form.kind === 'lesson') {
        const lesson = await this.api.saveLesson(form.classId, { ...form.value, date: form.value.date || null }, form.id);
        await this.load(form.classId);
        await this.workspace.openClass(form.classId, lesson.id, true);
      } else {
        const created = await this.workspace.create(form.value, false, form.context);
        if (!created) {
          this.formError.set(this.workspace.view.error || $localize`:@@ui_13d65d60f498:Could not create this document.`);
          return;
        }
      }
      this.close();
    } catch (error) { this.formError.set(this.message(error)); }
    finally { this.saving.set(false); }
  }

  protected async archive(classroom: Classroom) {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      await this.api.setArchived(classroom.id, !classroom.archived);
      await this.load(classroom.id);
    } catch (error) { this.error.set(this.message(error)); }
    finally { this.saving.set(false); }
  }

  protected retry() { void this.load(this.classId()); }

  protected dateLabel(date: string) {
    return new Date(date + 'T12:00:00').toLocaleDateString(interfaceLocale, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  private message(error: unknown) { return error instanceof Error ? error.message : $localize`:@@ui_83a6fd7b7878:Please try again.`; }
}
