import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  Classroom, ClassroomDetail, ClassroomInput, ClassroomSummary, DocumentContextInput, Lesson, LessonInput, Settings,
} from '../../../../libs/contracts/src/index.js';
import { uuid, documentKind } from '../../../../libs/contracts/src/index.js';
import { now, StudioStore } from '../persistence/studio-store.js';

interface ClassroomRow extends Omit<Classroom, 'archived' | 'schoolYear'> {
  archived: number;
  school_year: string;
  lesson_count?: number;
  document_count?: number;
}

interface LessonRow extends LessonInput {
  id: string;
  class_id: string;
  lesson_date: string | null;
  document_count: number;
}

const classroomView = (row: ClassroomRow): Classroom => ({
  id: row.id, title: row.title, subject: row.subject, grade: row.grade, schoolYear: row.school_year,
  description: row.description, language: row.language, archived: Boolean(row.archived),
});
const lessonView = (row: LessonRow): Lesson => ({
  id: row.id, classId: row.class_id, title: row.title, description: row.description,
  goals: row.goals, date: row.lesson_date, documentCount: row.document_count,
});
const lessonQuery = `SELECT l.*, (SELECT COUNT(*) FROM documents d WHERE d.lesson_id = l.id) AS document_count FROM lessons l`;

@Injectable()
export class ClassroomsService {
  constructor(private readonly store: StudioStore) {}

  async list(): Promise<ClassroomSummary[]> {
    return (await this.store.all<ClassroomRow>(`SELECT c.*,
      (SELECT COUNT(*) FROM lessons l WHERE l.class_id = c.id) AS lesson_count,
      (SELECT COUNT(*) FROM documents d WHERE d.class_id = c.id) AS document_count
      FROM classrooms c ORDER BY c.archived, c.updated DESC, c.title`)).map(row => ({
      ...classroomView(row), lessonCount: row.lesson_count ?? 0, documentCount: row.document_count ?? 0,
    }));
  }

  async detail(id: string): Promise<ClassroomDetail> {
    return {
      classroom: await this.get(id),
      lessons: (await this.store.all<LessonRow>(lessonQuery + ' WHERE l.class_id = $1 ORDER BY l.lesson_date IS NULL, l.lesson_date, l.position', id)).map(lessonView),
      documents: await this.store.list(id),
    };
  }

  async create(input: ClassroomInput): Promise<Classroom> {
    const id = randomUUID();
    await this.store.run(`INSERT INTO classrooms (id, title, subject, grade, school_year, description, language, updated)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, id, input.title, input.subject, input.grade, input.schoolYear, input.description, input.language, now());
    return this.get(id);
  }

  async update(id: string, input: ClassroomInput) {
    await this.get(id);
    await this.store.run(`UPDATE classrooms SET title = $1, subject = $2, grade = $3, school_year = $4, description = $5,
      language = $6, updated = $7 WHERE id = $8`, input.title, input.subject, input.grade, input.schoolYear, input.description, input.language, now(), id);
    return this.get(id);
  }

  async archive(id: string, archived: boolean) {
    await this.get(id);
    await this.store.run('UPDATE classrooms SET archived = $1, updated = $2 WHERE id = $3', Number(archived), now(), id);
    return this.get(id);
  }

  async createLesson(classId: string, input: LessonInput) {
    const classroom = await this.get(classId);
    if (classroom.archived) throw new BadRequestException('Reopen this class before adding a lesson.');
    const id = randomUUID();
    await this.store.run(`INSERT INTO lessons (id, class_id, title, description, goals, lesson_date)
      VALUES ($1, $2, $3, $4, $5, $6)`, id, classId, input.title, input.description, input.goals, input.date);
    return this.getLesson(classId, id);
  }

  async updateLesson(classId: string, id: string, input: LessonInput) {
    await this.getLesson(classId, id);
    await this.store.run(`UPDATE lessons SET title = $1, description = $2, goals = $3, lesson_date = $4 WHERE id = $5 AND class_id = $6`,
      input.title, input.description, input.goals, input.date, id, classId);
    return this.getLesson(classId, id);
  }

  async validateContext(context: DocumentContextInput, allowArchived = false) {
    if (!context.classId) return { classroom: null, lesson: null };
    const classroom = await this.get(context.classId);
    if (classroom.archived && !allowArchived) {
      throw new BadRequestException('Reopen this class before filing new work here.');
    }
    const lesson = context.lessonId ? await this.getLesson(classroom.id, context.lessonId) : null;
    return { classroom, lesson };
  }

  async prefill(settings: Settings, context: DocumentContextInput) {
    const { classroom, lesson } = await this.validateContext(context);
    if (!classroom) return settings;
    const brief = { ...settings.brief, subject: classroom.subject, grade: classroom.grade, language: classroom.language };
    if (lesson) {
      const german = classroom.language === 'de';
      const article = brief.kind === 'Exam' ? 'an' : 'a';
      const intro = german ? 'Erstelle Unterrichtsmaterial zur Stunde „' + lesson.title + '“.' :
        'Create ' + article + ' ' + documentKind(brief).toLowerCase() + ' for the lesson “' + lesson.title + '”.';
      brief.topics = brief.topics || lesson.title;
      brief.brief = brief.brief || [intro, lesson.description,
        lesson.goals ? (german ? 'Lernziele:\n' : 'Learning goals:\n') + lesson.goals : ''].filter(Boolean).join('\n\n').slice(0, 3500);
    }
    return { ...settings, brief };
  }

  private async get(id: string): Promise<Classroom> {
    if (!uuid.safeParse(id).success) throw new NotFoundException('Class was not found.');
    const row = await this.store.one<ClassroomRow>('SELECT * FROM classrooms WHERE id = $1', id);
    if (!row) throw new NotFoundException('Class was not found.');
    return classroomView(row);
  }

  private async getLesson(classId: string, id: string): Promise<Lesson> {
    if (!uuid.safeParse(classId).success || !uuid.safeParse(id).success) throw new NotFoundException('Lesson was not found in this class.');
    const row = await this.store.one<LessonRow>(lessonQuery + ' WHERE l.class_id = $1 AND l.id = $2', classId, id);
    if (!row) throw new NotFoundException('Lesson was not found in this class.');
    return lessonView(row);
  }
}
