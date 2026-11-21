import { ui } from '../../core/i18n/ui-messages';
import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { StatusBadge, designCopy } from '../../shared/studio-ui';
import { WorkspaceStore } from '../workspace/workspace-store';
import { Icon } from '../../shared/icon/icon';
import { TeacherDialog } from '../../shared/teacher-dialog/teacher-dialog';
import { totalPoints } from '../../../../../../libs/contracts/src';
import { DocumentFiling } from '../classrooms/document-filing';
import { AssessmentBrief } from '../assessment/assessment-brief';
import { AssessmentEditor } from '../assessment/assessment-editor';
import { GenerationAudit } from '../generation/generation-audit';
import { VersionComparison } from '../versions/version-comparison';
import { VersionHistory } from '../versions/version-history';
import { workspaceTabs } from './workspace-tabs';

@Component({
  selector: 'studio-document-workspace',
  imports: [Icon, AssessmentBrief, AssessmentEditor, VersionHistory, VersionComparison, GenerationAudit, DocumentFiling, TeacherDialog, StatusBadge],
  templateUrl: './document-workspace.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentWorkspace {
  protected readonly ui = ui;
  private readonly workspace = inject(WorkspaceStore);

  protected get vm() { return this.workspace.view; }
  protected readonly tabs = workspaceTabs.filter(item => ['brief', 'editor', 'history'].includes(item.id));
  protected readonly copy = designCopy;
  protected readonly editor = viewChild(AssessmentEditor);
  protected get selectedTab() { return this.vm.tab === 'compare' ? 'history' : this.vm.tab === 'audit' ? 'editor' : this.vm.tab; }
  protected tabKeys(event: KeyboardEvent) {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const index = this.tabs.findIndex(item => item.id === this.selectedTab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? this.tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + this.tabs.length) % this.tabs.length;
    this.vm.selectTab(this.tabs[next].id);
    document.getElementById('tab-' + this.selectedTab)?.focus();
  }
  protected readonly points = totalPoints;
  protected showFiling = false;
  protected showDuplicate = false;
}
