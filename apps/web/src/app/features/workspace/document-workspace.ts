import { ui } from '../../core/i18n/ui-messages';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { WorkspaceStore } from '../workspace/workspace-store';
import { BrnButton } from '@spartan-ng/brain/button';
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
  imports: [BrnButton, Icon, AssessmentBrief, AssessmentEditor, VersionHistory, VersionComparison, GenerationAudit, DocumentFiling, TeacherDialog],
  templateUrl: './document-workspace.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentWorkspace {
  protected readonly ui = ui;
  private readonly workspace = inject(WorkspaceStore);

  protected get vm() { return this.workspace.view; }
  protected readonly tabs = workspaceTabs;
  protected readonly points = totalPoints;
  protected showFiling = false;
}
