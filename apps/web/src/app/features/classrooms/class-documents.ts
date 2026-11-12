import { ui } from '../../core/i18n/ui-messages';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { DocumentSummary } from '../../../../../../libs/contracts/src';
import { StatusBadge } from '../../shared/studio-ui';
import { Icon } from '../../shared/icon/icon';

@Component({
  selector: 'studio-class-documents',
  imports: [Icon, StatusBadge],
  templateUrl: './class-documents.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassDocuments {
  protected readonly ui = ui;
  readonly documents = input.required<DocumentSummary[]>();
  readonly openDocument = output<DocumentSummary>();
}
