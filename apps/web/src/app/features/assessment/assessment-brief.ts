import { GenerationControls } from '../workspace/generation-controls';
import { DocumentTypesManager } from '../document-types/document-types-manager';
import type { DocumentType } from '../../../../../../libs/contracts/src';
import { ui } from '../../core/i18n/ui-messages';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { WorkspaceStore } from '../workspace/workspace-store';
import { Icon } from '../../shared/icon/icon';
import { FormsModule } from '@angular/forms';
import { modes, type RagMode } from '../../../../../../libs/contracts/src';
import { SourceMaterials } from '../sources/source-materials';

@Component({
  selector: 'studio-assessment-brief',
  imports: [FormsModule, Icon, SourceMaterials, DocumentTypesManager, GenerationControls],
  templateUrl: './assessment-brief.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssessmentBrief {
  protected readonly ui = ui;
  private readonly workspace = inject(WorkspaceStore);

  protected get vm() { return this.workspace.view; }
  protected showTypes = false;
  protected readonly hasSelectedType = (type: DocumentType) => type.id === this.vm.settings.brief.documentType?.id;
  protected readonly modes = modes;
  protected readonly modeInfo: Record<RagMode, string> = {
    Off: $localize`:@@ui_7c690a44b31f:Use your brief and pasted notes.`,
    Basic: $localize`:@@ui_f4f3deac8bcf:Find excerpts with similar meaning.`,
    Advanced: $localize`:@@ui_6cbbec3b1fa7:Blend meaning and keywords. Remove repeats.`,
    Graph: $localize`:@@ui_baf82268b190:Follow related topics and nearby passages.`,
  };
}
