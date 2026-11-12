import { Injectable, inject } from '@angular/core';
import type {
  Classroom, ClassroomDetail, ClassroomInput, ClassroomSummary, Lesson, LessonInput,
} from '../../../../../../libs/contracts/src';
import { StudioApi } from '../../core/studio-api';

@Injectable({ providedIn: 'root' })
export class ClassroomsApi {
  private readonly api = inject(StudioApi);

  list() { return this.api.request<ClassroomSummary[]>('/classes'); }

  detail(id: string) { return this.api.request<ClassroomDetail>('/classes/' + encodeURIComponent(id)); }

  saveClass(input: ClassroomInput, id?: string) {
    return this.api.request<Classroom>(id ? '/classes/' + id : '/classes', {
      method: id ? 'PATCH' : 'POST', body: input,
    });
  }

  setArchived(id: string, archived: boolean) {
    return this.api.request<Classroom>('/classes/' + id + '/status', { method: 'PATCH', body: { archived } });
  }

  saveLesson(classId: string, input: LessonInput, id?: string) {
    const collection = '/classes/' + classId + '/lessons';
    return this.api.request<Lesson>(id ? collection + '/' + id : collection, {
      method: id ? 'PATCH' : 'POST', body: input,
    });
  }
}
