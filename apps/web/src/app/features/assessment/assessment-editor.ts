import { Notifications } from '../../core/notifications';
import { ui } from '../../core/i18n/ui-messages';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { WorkspaceStore } from '../workspace/workspace-store';
import { Icon } from '../../shared/icon/icon';
import { FormsModule } from '@angular/forms';
import { readinessIssues, totalPoints, type Assessment, type Job, type JobSummary, type Question, type ReadinessIssue } from '../../../../../../libs/contracts/src';
import { evidenceFor } from './assessment-evidence';
import { CdkDrag, CdkDragHandle, CdkDropList, moveItemInArray, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { designCopy } from '../../shared/studio-ui';

type Section = Assessment['sections'][number];

@Component({
  selector: 'studio-assessment-editor',
  imports: [FormsModule, Icon, CdkDrag, CdkDragHandle, CdkDropList],
  templateUrl: './assessment-editor.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssessmentEditor {
  protected readonly ui = ui;
  private readonly workspace = inject(WorkspaceStore);

  protected get vm() { return this.workspace.view; }
  protected readonly points = totalPoints;
  protected readonly evidenceFor = evidenceFor;
  protected readonly copy = designCopy;
  protected readonly showRail = signal(false);
  protected readonly selectedQuestion = signal('');
  protected get questions() { return this.vm.draft?.sections.flatMap(section => section.questions) ?? []; }
  protected get focusedQuestion() { return this.questions.find(question => question.id === this.selectedQuestion()) ?? this.questions[0]; }
  protected drop(event: CdkDragDrop<Question[]>, section: Section) {
    if (event.previousIndex === event.currentIndex) return;
    moveItemInArray(section.questions, event.previousIndex, event.currentIndex);
    this.vm.change();
  }
  protected readonly previewJob = signal<Job | undefined>(undefined);
  private readonly notifications = inject(Notifications);
  private readonly reviewedWarnings = signal<string | null>(null);
  protected get warningsReviewed() { return this.reviewedWarnings() === JSON.stringify(this.vm.draft?.warnings ?? []); }
  protected acknowledgeWarnings(checked: boolean) {
    this.reviewedWarnings.set(checked ? JSON.stringify(this.vm.draft?.warnings ?? []) : null);
    this.notifications.dismiss('review-notes');
  }

  protected revealReviewNotes() {
    const notes = document.getElementById('draft-review-notes');
    notes?.scrollIntoView({ block: 'center', behavior: 'auto' });
    notes?.focus({ preventScroll: true });
  }

  protected readonly showPreflight = signal(false);
  protected get readiness() { return this.vm.draft ? readinessIssues(this.vm.draft, this.vm.settings.brief) : []; }

  protected issueMessage(issue: ReadinessIssue) {
    switch (issue.code) {
      case 'noQuestions': return $localize`:@@readyNeedsQuestion:Add a question before marking this version ready.`;
      case 'pointsMismatch': return $localize`:@@readyPointsMismatch:The draft has ${issue.actual}:actual: points. The plan calls for ${issue.expected}:expected:.`;
      case 'missingAnswer': return $localize`:@@readyMissingAnswer:Question ${issue.question}:question: needs an answer.`;
      case 'missingScoring': return $localize`:@@readyMissingScoring:Question ${issue.question}:question: needs scoring guidance.`;
    }
  }

  protected focusIssue(issue: ReadinessIssue) {
    if (!('questionId' in issue)) return;
    this.vm.showTeacher.set(true);
    requestAnimationFrame(() => document.getElementById(issue.code + '-' + issue.questionId)?.focus());
  }

  markReady() {
    if (this.vm.draft?.warnings.length && !this.warningsReviewed) {
      this.revealReviewNotes();
      this.notifications.error($localize`:@@reviewNotesRequired:Review the notes above and select “I reviewed the notes” before marking this draft as ready.`, {
        id: 'review-notes',
        action: { label: $localize`:@@reviewNotesAction:Show review notes`, onClick: () => this.revealReviewNotes() },
      });
      return;
    }
    this.notifications.dismiss('review-notes');
    if (this.readiness.length) {
      this.showPreflight.set(true);
      requestAnimationFrame(() => document.getElementById('readiness-issues')?.focus());
      return;
    }
    void this.vm.saveVersion('Ready', this.warningsReviewed);
  }


  protected editBlank() {
    if (!this.vm.draft) {
      this.vm.draft = { title: $localize`:@@ui_53d5bfdb3865:Untitled ` + this.vm.typeTitle.toLowerCase(), instructions: '',
        sections: [{ id: crypto.randomUUID(), title: $localize`:@@ui_8238deed4280:Section 1`, instructions: '', questions: [] }],
        teacherNotes: '', evidence: [], warnings: [] };
      this.vm.change();
    }
    this.vm.selectTab('editor');
  }

  protected addSection() {
    if (!this.vm.draft || this.vm.draft.sections.length >= 8) return;
    this.vm.draft.sections.push({ id: crypto.randomUUID(), title: $localize`:@@ui_4b82f2bc32ff:Section ` + (this.vm.draft.sections.length + 1), instructions: '', questions: [] });
    this.vm.change();
  }

  protected addQuestion(section: Section) {
    if (section.questions.length >= 30 || (this.vm.draft?.sections.flatMap(row => row.questions).length ?? 0) >= 40) return;
    section.questions.push({ id: crypto.randomUUID(), prompt: $localize`:@@ui_10c979393197:New question`, points: 1, lines: 3, answer: '', rubric: '', citations: [] });
    this.vm.change();
  }

  protected move(section: Section, index: number, offset: number) {
    const next = index + offset;
    if (next < 0 || next >= section.questions.length) return;
    [section.questions[index], section.questions[next]] = [section.questions[next], section.questions[index]];
    this.vm.change();
  }

  protected moveTo(section: Section, question: Question, id: string) {
    const destination = this.vm.draft?.sections.find(item => item.id === id);
    if (!destination || destination === section || destination.questions.length >= 30) return;
    section.questions = section.questions.filter(item => item.id !== question.id);
    destination.questions.push(question);
    this.vm.change();
  }

  protected removeQuestion(section: Section, index: number) { section.questions.splice(index, 1); this.vm.change(); }
  protected removeSection(index: number) {
    if (this.vm.draft && this.vm.draft.sections.length > 1 && !this.vm.draft.sections[index].questions.length) {
      this.vm.draft.sections.splice(index, 1);
      this.vm.change();
    }
  }

  protected get pendingPreviews() {
    return this.vm.jobs.filter(job => job.hasPreview && this.vm.draft?.sections.some(section =>
      section.questions.some(question => question.id === job.settings.questionId)));
  }

  protected async previewReplacement(summary: JobSummary) {
    try { this.previewJob.set(await this.vm.loadJob(summary.id)); }
    catch (error) { this.notifications.error(error instanceof Error ? error.message : String(error)); }
  }

  protected replaceQuestion(job: Job) {
    const section = this.vm.draft?.sections.find(row => row.questions.some(q => q.id === job.settings.questionId));
    if (!section || !job.preview || !this.vm.draft) return;
    const current = section.questions.findIndex(question => question.id === job.settings.questionId);
    section.questions[current] = structuredClone(job.preview);
    const ids = new Set(this.vm.draft.evidence.map(item => item.id));
    this.vm.draft.evidence.push(...job.evidence.filter(item => job.preview?.citations.includes(item.id) && !ids.has(item.id)));
    this.vm.draft.warnings = [...new Set([...this.vm.draft.warnings, ...job.warnings])].slice(0, 24);
    this.previewJob.set(undefined);
    this.vm.notice = $localize`:@@ui_6c0dbf121b69:Question replaced in the working draft.`;
    this.vm.change();
  }
}
