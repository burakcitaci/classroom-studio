import { StudioToaster } from './shared/toaster/studio-toaster';
import { interfaceLocale, rememberLocale, type InterfaceLocale } from './core/i18n/locale';
import { ui } from './core/i18n/ui-messages';
import { ChangeDetectionStrategy, Component, inject, signal, type OnInit } from '@angular/core';
import { ClassroomsPage } from './features/classrooms/classrooms-page';
import { DocumentsPage } from './features/documents/documents-page';
import { DocumentWorkspace } from './features/workspace/document-workspace';
import { WorkspaceStore } from './features/workspace/workspace-store';
import { Icon } from './shared/icon/icon';

@Component({
  selector: 'studio-root',
  imports: [ClassroomsPage, DocumentsPage, DocumentWorkspace, Icon, StudioToaster],
  providers: [WorkspaceStore],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  protected readonly ui = ui;
  private readonly workspace = inject(WorkspaceStore);
  protected get vm() { return this.workspace.view; }

  protected readonly locale = interfaceLocale;
  protected readonly switchingLanguage = signal(false);

  protected async changeLanguage(value: string) {
    if ((value !== 'en' && value !== 'de') || value === this.locale || this.switchingLanguage()) return;
    for (const select of document.querySelectorAll<HTMLSelectElement>('select[data-interface-language]')) select.value = this.locale;
    if (document.querySelector('[role="dialog"] form') || this.vm.noteDraft.text.trim()) {
      this.vm.error = ui('Close the current form or add your notes before switching language.');
      return;
    }
    this.switchingLanguage.set(true);
    if (await this.workspace.prepareLocaleChange()) rememberLocale(value as InterfaceLocale);
    else {
      this.vm.error ||= ui('Could not switch language. Save or resolve your changes and try again.');
      this.switchingLanguage.set(false);
    }
  }

  ngOnInit() { this.workspace.connect(); }
}
