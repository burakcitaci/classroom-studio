import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { WorkspaceStore } from './workspace-store';
import { Icon } from '../../shared/icon/icon';
import { designCopy, StudioButton } from '../../shared/studio-ui';
import { ui } from '../../core/i18n/ui-messages';

@Component({ selector: 'studio-generation-controls', imports: [Icon, StudioButton], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  @if (vm.provider === 'ollama') {
    <section class="panel mt-4" aria-labelledby="draft-review-mode-heading">
      <h2 id="draft-review-mode-heading" i18n="@@draftReviewOptions">Draft review</h2>
      <div class="field-grid mt-3">
        <label class="field">
          <span i18n="@@draftReviewMode">Review mode</span>
          <select #reviewChoice [value]="vm.reviewMode()" (change)="vm.chooseReview(reviewChoice.value)" [disabled]="vm.busy || !!vm.active">
            <option value="standard" [selected]="vm.reviewMode() === 'standard'" i18n="@@draftReviewStandard">Standard generation</option>
            <option value="local" [selected]="vm.reviewMode() === 'local'" i18n="@@draftReviewLocal">Local source review</option>
            @if (vm.geminiReview) { <option value="gemini" [selected]="vm.reviewMode() === 'gemini'" i18n="@@draftReviewGemini">Local review and Gemini second opinion</option> }
          </select>
        </label>
        @if (vm.reviewMode() !== 'standard' && vm.reviewerModels.length) {
          <label class="field">
            <span i18n="@@draftReviewModel">Ollama source reviewer</span>
            <select #reviewer [value]="vm.reviewerModel" (change)="vm.preferredReviewer.set(reviewer.value)" [disabled]="vm.busy || !!vm.active">
              @for (model of vm.reviewerModels; track model) { <option [value]="model" [selected]="model === vm.reviewerModel">{{ model }}</option> }
            </select>
          </label>
        }
      </div>
      @if (vm.reviewMode() !== 'standard') {
        @if (!vm.loadingModels && vm.reviewerModels.length < 1) {
          <p role="status" i18n="@@draftReviewNeedsModel">Local review needs a second installed Ollama text model. Refresh the model list after adding one.</p>
        } @else {
          <p i18n="@@draftReviewLocalHelp">The second model checks answers against retrieved excerpts. Findings can trigger one revision by the drafting model.</p>
        }
      }
      @if (vm.reviewMode() === 'gemini') {
        <p id="gemini-review-data" i18n="@@draftReviewCloudHelp">Google receives the plan, grade, point target, and the draft’s questions, instructions, answers and scoring. Original uploads, retrieved excerpts and private notes stay in Studio. Draft text can contain material drawn from your sources.</p>
        <label class="check-label mt-3"><input type="checkbox" #cloudConsent [checked]="vm.cloudReviewConfirmed()" (change)="vm.cloudReviewConfirmed.set(cloudConsent.checked)" [disabled]="vm.busy || !!vm.active" aria-describedby="gemini-review-data">
          <span i18n="@@draftReviewCloudConsent">Send this run’s plan and draft to Gemini</span>
        </label>
      }
    </section>
  }
  <div class="plan-generate-footer">
    <div class="generation-help" id="generation-help">@if (vm.planEditing) { {{ copy.savePlan }} } @else if (vm.active) { {{ ui('Progress is saved. You can leave or refresh this page.') }} } @else if (vm.provider === 'demo') { {{ ui('Demo mode generates sample questions.') }} } @else if (!vm.generationModel) { {{ ui('Choose an Ollama model before generating.') }} } @else { {{ vm.generationModel }} }</div>
    <div class="generate-split">
      <button studioButton variant="primary" (click)="vm.generate()" aria-describedby="generation-help" [title]="vm.planEditing ? copy.savePlan : ''" [disabled]="!vm.provider || vm.busy || vm.planEditing || !!vm.active || vm.reviewBlocked || (vm.provider === 'ollama' && !vm.generationModel)">@if (vm.active || vm.busy) { <span class="spinner"></span> } @else { <studio-icon name="spark" /> }
        @if (vm.active) { {{ ui('Generating…') }} }
        @else if (vm.reviewMode() !== 'standard') { <ng-container i18n="@@generateReviewedDraft">Generate with review</ng-container> }
        @else { {{ vm.draft ? ui('Generate new draft') : ui('Generate draft') }} }
      </button>
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
