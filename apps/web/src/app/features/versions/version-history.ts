import { EmptyState, designCopy } from '../../shared/studio-ui';
import type { Revision } from '../../../../../../libs/contracts/src';
import { ui } from '../../core/i18n/ui-messages';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { WorkspaceStore } from '../workspace/workspace-store';
import { Icon } from '../../shared/icon/icon';
import { totalPoints } from '../../../../../../libs/contracts/src';
import { evidenceFor } from '../assessment/assessment-evidence';
import { formatTimestamp } from '../../shared/format-timestamp';

@Component({
  selector: 'studio-version-history',
  imports: [Icon, EmptyState],
  templateUrl: './version-history.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VersionHistory {
  protected readonly ui = ui;
  protected readonly copy = designCopy;
  protected compare(version: Revision) { this.vm.compareLeft = version.id; this.vm.compareRight = 'working'; this.vm.selectTab('compare'); }
  private readonly workspace = inject(WorkspaceStore);

  protected get vm() { return this.workspace.view; }
  protected readonly points = totalPoints;
  protected readonly evidenceFor = evidenceFor;
  protected readonly time = formatTimestamp;
}
