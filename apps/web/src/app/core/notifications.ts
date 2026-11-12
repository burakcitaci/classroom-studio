import { Injectable } from '@angular/core';
import { toast, type ExternalToast } from '@spartan-ng/brain/sonner';

@Injectable({ providedIn: 'root' })
export class Notifications {
  private readonly named = new Map<string | number, string>();
  private sequence = 0;

  private replace(options: ExternalToast = {}): ExternalToast {
    if (options.id === undefined) return options;
    const name = options.id;
    this.dismiss(name);
    // Replace the component when a persistent notification changes. Sonner's
    // update timer restarts even for infinite durations in this version.
    const id = 'studio-toast-' + ++this.sequence;
    this.named.set(name, id);
    return { ...options, id };
  }
  private options(options: ExternalToast = {}): ExternalToast {
    return {
      cancel: { label: $localize`:@@toastDismiss:Dismiss`, onClick: () => undefined },
      ...options,
    };
  }

  success(message: string, options?: ExternalToast) { return toast.success(message, this.options(this.replace(options))); }
  error(message: string, options?: ExternalToast) { return toast.error(message, this.options(this.replace({ duration: Infinity, important: true, ...options }))); }
  loading(message: string, options?: ExternalToast) { return toast.loading(message, this.options(this.replace({ duration: Infinity, ...options }))); }
  dismiss(id: string | number) { toast.dismiss(this.named.get(id) ?? id); this.named.delete(id); }
}
