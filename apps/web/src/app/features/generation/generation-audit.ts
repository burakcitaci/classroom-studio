import { interfaceLocale } from '../../core/i18n/locale';
import { EmptyState, designCopy } from '../../shared/studio-ui';
import { ui } from '../../core/i18n/ui-messages';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { WorkspaceStore } from '../workspace/workspace-store';
import { Icon } from '../../shared/icon/icon';
import { roleLabels, type Job, type JobSummary } from '../../../../../../libs/contracts/src';
import { formatTimestamp } from '../../shared/format-timestamp';

@Component({
  selector: 'studio-generation-audit',
  imports: [Icon, EmptyState],
  templateUrl: './generation-audit.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerationAudit {
  protected readonly copy = designCopy;
  protected readonly ui = ui;
  private readonly workspace = inject(WorkspaceStore);

  protected get vm() { return this.workspace.view; }
  protected readonly currentAudit = signal('');
  protected readonly detail = signal<Job | undefined>(undefined);
  protected readonly error = signal('');
  private readonly selectedState = computed(() => {
    const job = this.vm.jobs.find(summary => summary.id === this.currentAudit());
    return job ? [job.id, job.stage, job.reviewStep].join('|') : '';
  });

  constructor() {
    effect(() => {
      const state = this.selectedState();
      if (state) void this.loadDetail(state);
    });
  }

  protected toggleAudit(summary: JobSummary) {
    this.detail.set(undefined);
    this.error.set('');
    this.currentAudit.set(this.currentAudit() === summary.id ? '' : summary.id);
  }

  private async loadDetail(state: string) {
    const id = this.currentAudit();
    try {
      const job = await this.workspace.loadJob(id);
      if (this.selectedState() === state) {
        this.detail.set(job);
        this.error.set('');
      }
    } catch (error) {
      if (this.selectedState() === state) {
        this.detail.set(undefined);
        this.error.set(error instanceof Error ? error.message : String(error));
      }
    }
  }
  protected readonly time = formatTimestamp;
  protected number(value: number) { return new Intl.NumberFormat(interfaceLocale, { maximumFractionDigits: 2 }).format(value); }
  protected revisionFor(job: Job) { return this.vm.revisions.find(item => item.id === job.versionId); }
  protected jobRole(job: Job, id: string) {
    const role = job.settings.sources.find(item => item.id === id)?.role;
    return role ? roleLabels[role] : $localize`:@@ui_6da13addb000:Source`;
  }
}
