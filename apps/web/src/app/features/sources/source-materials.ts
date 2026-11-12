import { ui } from '../../core/i18n/ui-messages';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { WorkspaceStore } from '../workspace/workspace-store';
import { Icon } from '../../shared/icon/icon';
import { FormsModule } from '@angular/forms';
import { roleLabels, roles } from '../../../../../../libs/contracts/src';

@Component({
  selector: 'studio-source-materials',
  imports: [FormsModule, Icon],
  templateUrl: './source-materials.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourceMaterials {
  protected readonly ui = ui;
  private readonly workspace = inject(WorkspaceStore);

  protected get vm() { return this.workspace.view; }
  protected readonly roles = roles;
  protected readonly roleLabels = roleLabels;
  protected openSource?: string;
  protected drag = false;

  protected drop(event: DragEvent) {
    event.preventDefault();
    this.drag = false;
    void this.vm.upload(event.dataTransfer?.files ?? null);
  }

}
