import { ui } from '../../core/i18n/ui-messages';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { BrnDialog, BrnDialogClose, BrnDialogContent, BrnDialogDescription, BrnDialogTitle } from '@spartan-ng/brain/dialog';
import { Icon } from '../icon/icon';

@Component({
  selector: 'studio-teacher-dialog',
  imports: [BrnDialog, BrnDialogClose, BrnDialogContent, BrnDialogDescription, BrnDialogTitle, Icon],
  templateUrl: './teacher-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherDialog {
  protected readonly ui = ui;
  readonly title = input.required<string>();
  readonly description = input('');
  readonly busy = input(false);
  readonly closed = output<void>();
}
