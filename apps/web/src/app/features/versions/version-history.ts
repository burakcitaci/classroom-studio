import { ui } from '../../core/i18n/ui-messages';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { WorkspaceStore } from '../workspace/workspace-store';
import { Icon } from '../../shared/icon/icon';
import { totalPoints } from '../../../../../../libs/contracts/src';
import { evidenceFor } from '../assessment/assessment-evidence';
import { formatTimestamp } from '../../shared/format-timestamp';

@Component({
  selector: 'studio-version-history',
  imports: [Icon],
  templateUrl: './version-history.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VersionHistory {
  protected readonly ui = ui;
  private readonly workspace = inject(WorkspaceStore);

  protected get vm() { return this.workspace.view; }
  protected readonly points = totalPoints;
  protected readonly evidenceFor = evidenceFor;
  protected readonly time = formatTimestamp;
}
