import { ChangeDetectionStrategy, Component, Directive, input } from '@angular/core';
import { ui } from '../core/i18n/ui-messages';
import { interfaceLocale } from '../core/i18n/locale';
import { Icon, type IconName } from './icon/icon';

// Presentation-only copy; the existing translation catalogs remain untouched.
export const designCopy = interfaceLocale === 'de' ? {
  plan: 'Plan', sources: 'Quellen', draft: 'Entwurf', ready: 'Bereit', menu: 'Menü öffnen',
  why: 'Warum diese Fragen?', compare: 'Mit aktuellem Entwurf vergleichen',
  savePlan: 'Speichere deinen Plan, um einen Entwurf zu erstellen.',
  language: 'Beim Wechsel wird die Seite neu geladen. Dein Dokument wird zuerst gespeichert.',
  summary: 'Überblick', next: 'Nächste Stunde', noLesson: 'Noch keine Stunde geplant',
  drag: 'Frage ziehen', createClass: 'Erstelle deine erste Klasse', status: 'Nach Status filtern',
  noRuns: 'Noch keine Erstellung', noVersions: 'Noch keine gespeicherten Versionen',
  progress: 'Dokumentfortschritt',
} : {
  plan: 'Plan', sources: 'Sources', draft: 'Draft', ready: 'Ready', menu: 'Open menu',
  why: 'Why these questions?', compare: 'Compare with current',
  savePlan: 'Save your plan to generate.',
  language: 'Switching reloads the page. Your document is saved first.',
  summary: 'Overview', next: 'Next lesson', noLesson: 'No lesson scheduled yet',
  drag: 'Drag question', createClass: 'Create your first class', status: 'Filter by status',
  noRuns: 'No generation attempts yet', noVersions: 'No saved versions yet',
  progress: 'Document progress',
};

@Directive({ selector: 'button[studioButton]', host: {
  class: 'btn', '[class.primary]': 'variant() === "primary"',
  '[class.ghost]': 'variant() === "ghost"', '[class.destructive]': 'variant() === "destructive"',
  '[class.small]': 'size() === "sm"', '[class.large]': 'size() === "lg"',
} })
export class StudioButton {
  readonly variant = input<'primary' | 'secondary' | 'ghost' | 'destructive'>('secondary');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
}

@Component({ selector: 'studio-status-badge', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="status-badge" [class.planning]="status() === 'Planning'" [class.draft]="status() === 'Draft'" [class.ready]="status() === 'Ready'"><span class="status-dot" aria-hidden="true"></span>{{ ui(status()) }}</span>`,
})
export class StatusBadge {
  readonly status = input.required<'Planning' | 'Draft' | 'Ready'>();
  protected readonly ui = ui;
}

@Component({ selector: 'studio-save-indicator', imports: [Icon], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="save-state" [class.unsaved]="dirty()" [class.saving]="saving()" role="status">@if (saving()) { <span class="spinner"></span> } @else { <studio-icon [name]="dirty() ? 'clock' : 'check'" /> }{{ ui(saving() ? 'Saving changes…' : dirty() ? 'Unsaved changes' : 'Saved locally') }}</span>`,
})
export class SaveIndicator {
  readonly dirty = input(false);
  readonly saving = input(false);
  protected readonly ui = ui;
}

@Component({ selector: 'studio-page-header', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<header class="page-heading"><div><h1>{{ title() }}</h1>@if (description()) { <p>{{ description() }}</p> }</div><div class="button-row"><ng-content /></div></header>`,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly description = input('');
}

@Component({ selector: 'studio-empty-state', imports: [Icon], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="empty-state"><span class="empty-icon"><studio-icon [name]="icon()" /></span><h2>{{ title() }}</h2><p>{{ description() }}</p><div class="button-row"><ng-content /></div></div>`,
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly description = input('');
  readonly icon = input<IconName>('docs');
}

@Component({ selector: 'studio-skeleton', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="skeleton-panel panel" role="status" [attr.aria-label]="label()"><span class="sr-only">{{ label() }}</span><div class="skeleton skeleton-title"></div>@for (row of rows; track row) { <div class="skeleton-row"><span class="skeleton skeleton-icon"></span><span class="skeleton skeleton-line"></span><span class="skeleton skeleton-short"></span></div> }</div>`,
})
export class Skeleton {
  readonly label = input(ui('Opening your workspace…'));
  protected readonly rows = [1, 2, 3, 4];
}
