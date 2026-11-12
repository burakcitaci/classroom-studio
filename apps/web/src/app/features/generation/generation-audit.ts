import { interfaceLocale } from '../../core/i18n/locale';
import { EmptyState, designCopy } from '../../shared/studio-ui';
import { ui } from '../../core/i18n/ui-messages';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { WorkspaceStore } from '../workspace/workspace-store';
import { Icon } from '../../shared/icon/icon';
import { roleLabels, type Job } from '../../../../../../libs/contracts/src';
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
  protected currentAudit?: string;
  protected readonly time = formatTimestamp;
  protected number(value: number) { return new Intl.NumberFormat(interfaceLocale, { maximumFractionDigits: 2 }).format(value); }
  protected revisionFor(job: Job) { return this.vm.revisions.find(item => item.id === job.versionId); }
  protected jobRole(job: Job, id: string) {
    const role = job.settings.sources.find(item => item.id === id)?.role;
    return role ? roleLabels[role] : $localize`:@@ui_6da13addb000:Source`;
  }
}
