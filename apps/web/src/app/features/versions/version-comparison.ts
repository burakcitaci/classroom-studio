import { EmptyState } from '../../shared/studio-ui';
import { ui } from '../../core/i18n/ui-messages';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { WorkspaceStore } from '../workspace/workspace-store';

import { FormsModule } from '@angular/forms';
import { roleLabels } from '../../../../../../libs/contracts/src';
import { compare, type Side } from './compare-versions';

@Component({
  selector: 'studio-version-comparison',
  imports: [FormsModule, EmptyState],
  templateUrl: './version-comparison.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VersionComparison {
  protected readonly ui = ui;
  private readonly workspace = inject(WorkspaceStore);

  protected get vm() { return this.workspace.view; }
  protected get diff() {
    const left = this.side(this.vm.compareLeft);
    const right = this.side(this.vm.compareRight);
    return left && right ? compare(left, right) : null;
  }

  protected get sourceDiff() {
    const left = this.side(this.vm.compareLeft);
    const right = this.side(this.vm.compareRight);
    const describe = (side: Side) => side.settings.sources.map(source => (this.vm.doc?.sources.find(item => item.id === source.id)?.name ?? $localize`:@@ui_99516c0ec448:Archived source`) + ' · ' + ui(roleLabels[source.role]))
      .sort().join('\n') || $localize`:@@ui_909ea4071138:No selected sources`;
    return left && right ? { left: describe(left), right: describe(right) } : null;
  }

  private side(id: string): Side | undefined {
    if (id === 'working') return this.vm.draft ? { draft: this.vm.draft, settings: this.vm.settings, label: $localize`:@@ui_9b4b98750504:Working draft` } : undefined;
    const found = this.vm.revisions.find(row => row.id === id);
    return found ? { ...found, label: $localize`:@@ui_03283ea975df:Version ` + found.number + ' · ' + found.kind } : undefined;
  }
}
