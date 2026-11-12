import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BrnSonnerImports, toast, type ToastAction, type ToastT } from '@spartan-ng/brain/sonner';
import { Icon } from '../icon/icon';

@Component({
  selector: 'studio-toaster',
  imports: [BrnSonnerImports, Icon],
  templateUrl: './studio-toaster.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioToaster {
  protected activate(action: ToastAction, item: ToastT, event: MouseEvent) {
    toast.dismiss(item.id);
    action.onClick(event);
  }
}
