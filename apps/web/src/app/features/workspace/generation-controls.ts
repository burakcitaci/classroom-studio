import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { WorkspaceStore } from './workspace-store';
import { Icon } from '../../shared/icon/icon';
import { designCopy, StudioButton } from '../../shared/studio-ui';
import { ui } from '../../core/i18n/ui-messages';

@Component({ selector: 'studio-generation-controls', imports: [Icon, StudioButton], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="plan-generate-footer">
    <div class="generation-help" id="generation-help">@if (vm.planEditing) { {{ copy.savePlan }} } @else if (vm.active) { {{ ui('Progress is saved. You can leave or refresh this page.') }} } @else if (vm.provider === 'demo') { {{ ui('Demo mode generates sample questions.') }} } @else if (!vm.generationModel) { {{ ui('Choose an Ollama model before generating.') }} } @else { {{ vm.generationModel }} }</div>
    <div class="generate-split">
      <button studioButton variant="primary" (click)="vm.generate()" aria-describedby="generation-help" [title]="vm.planEditing ? copy.savePlan : ''" [disabled]="!vm.provider || vm.busy || vm.planEditing || !!vm.active || (vm.provider === 'ollama' && !vm.generationModel)">@if (vm.active || vm.busy) { <span class="spinner"></span> } @else { <studio-icon name="spark" /> }{{ vm.active ? ui('Generating…') : vm.draft ? ui('Generate new draft') : ui('Generate draft') }}</button>
      @if (vm.provider === 'ollama') {
        <details class="overflow-menu model-menu"><summary class="btn" [attr.aria-label]="ui('Ollama model')"><studio-icon name="down" /></summary><div class="menu-popover">
          <label class="field" for="document-ollama-model">{{ ui('Ollama model') }}<select id="document-ollama-model" #modelChoice (change)="vm.chooseGenerationModel(modelChoice.value)" [disabled]="vm.loadingModels || vm.busy || !!vm.active || !vm.ollamaModels.length"><option value="" disabled [selected]="!vm.generationModel">{{ vm.loadingModels ? ui('Loading models…') : ui('Choose a model') }}</option>@for (model of vm.ollamaModels; track model) { <option [value]="model" [selected]="model === vm.generationModel">{{ model }}</option> }</select></label>
          <button class="btn small" (click)="vm.loadModels()" [disabled]="vm.loadingModels"><studio-icon name="refresh" />{{ ui('Refresh models') }}</button>
        </div></details>
      }
    </div>
    @if (vm.provider === 'ollama' && vm.modelListError) { <div class="message danger model-error" role="alert"><div>{{ vm.modelListError }}</div><button class="btn small" (click)="vm.loadModels()" [disabled]="vm.loadingModels">{{ ui('Retry') }}</button></div> }
  </div>`,
})
export class GenerationControls {
  private readonly workspace = inject(WorkspaceStore);
  protected get vm() { return this.workspace.view; }
  protected readonly copy = designCopy;
  protected readonly ui = ui;
}
