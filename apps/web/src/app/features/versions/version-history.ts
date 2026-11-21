import { DocumentFiling } from '../classrooms/document-filing';
import { FormsModule } from '@angular/forms';
import { TeacherDialog } from '../../shared/teacher-dialog/teacher-dialog';
import { EmptyState, designCopy } from '../../shared/studio-ui';
import type { Revision } from '../../../../../../libs/contracts/src';
import { ui } from '../../core/i18n/ui-messages';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { WorkspaceStore } from '../workspace/workspace-store';
import { Icon } from '../../shared/icon/icon';
import { normalizeSectionHeading, totalPoints } from '../../../../../../libs/contracts/src';
import { evidenceFor } from '../assessment/assessment-evidence';
import { formatTimestamp } from '../../shared/format-timestamp';

@Component({
  selector: 'studio-version-history',
  imports: [DocumentFiling, Icon, EmptyState, FormsModule, TeacherDialog],
  templateUrl: './version-history.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VersionHistory {
  protected duplicateVersion?: Revision;
  protected readonly ui = ui;
  protected readonly normalizeHeading = normalizeSectionHeading;
  protected renaming?: Revision;
  protected nameDraft = '';
  protected savingName = false;
  protected editName(version: Revision) { this.renaming = version; this.nameDraft = version.name ?? ''; }
  protected async saveName() {
    if (!this.renaming || this.savingName) return;
    this.savingName = true;
    try { if (await this.vm.renameVersion(this.renaming, this.nameDraft)) this.renaming = undefined; }
    finally { this.savingName = false; }
  }
  protected readonly copy = designCopy;
  protected compare(version: Revision) { this.vm.compareLeft = version.id; this.vm.compareRight = 'working'; this.vm.selectTab('compare'); }
  private readonly workspace = inject(WorkspaceStore);

  protected get vm() { return this.workspace.view; }
  protected readonly points = totalPoints;
  protected readonly evidenceFor = evidenceFor;
  protected readonly time = formatTimestamp;
}
