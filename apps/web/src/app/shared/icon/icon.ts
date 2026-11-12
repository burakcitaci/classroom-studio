import { ChangeDetectionStrategy, Component, input } from '@angular/core';

const icons = {
  menu: ['M4 6h16 M4 12h16 M4 18h16'],
  grip: ['M9 5v.1 M15 5v.1 M9 12v.1 M15 12v.1 M9 19v.1 M15 19v.1'],
  more: ['M5 12h.1 M12 12h.1 M19 12h.1'],
  logo: ['M3 6c4-2 7-1 9 1 2-2 5-3 9-1v13c-4-2-7-1-9 1-2-2-5-3-9-1Z', 'M12 7v13 M17 2v5 M14.5 4.5h5'],
  preview: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
  docs: ['M6 3h8l4 4v14H6z', 'M14 3v5h5 M9 12h6 M9 16h6'],
  plus: ['M12 5v14 M5 12h14'],
  arrow: ['M4 12h15 m-6-6 6 6-6 6'],
  chevron: ['m9 18 6-6-6-6'],
  down: ['m6 9 6 6 6-6'],
  search: ['M21 21l-4.5-4.5 M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z'],
  spark: ['M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z'],
  grid: ['M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z'],
  leaf: ['M20 4c0 10-4 15-10 15a5 5 0 0 1-5-5c0-6 5-10 15-10Z M4 21l10-10'],
  book: ['M3 5c4-1 7 0 9 2 2-2 5-3 9-2v14c-4-1-7 0-9 2-2-2-5-3-9-2Z M12 7v14'],
  check: ['m5 12 4 4L19 6'],
  clock: ['M12 7v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z'],
  upload: ['M12 16V4m-5 5 5-5 5 5 M4 16v4h16v-4'],
  history: ['M3 12a9 9 0 1 1 3 6.7 M3 5v7h7 M12 7v5l3 2'],
  refresh: ['M20 7v5h-5 M4 17v-5h5 M5.5 8a7.5 7.5 0 0 1 12.4-2L20 9 M4 15l2.1 3a7.5 7.5 0 0 0 12.4-2'],
  compare: ['M3 4h7v16H3z M14 4h7v16h-7z M6 9h1 M17 9h1 M6 13h1 M17 13h1'],
  audit: ['M5 20V10 M12 20V4 M19 20v-7'],
  edit: ['m4 16 12-12 4 4L8 20H4z M13 7l4 4'],
  download: ['M12 3v12m-5-5 5 5 5-5 M4 16v4h16v-4'],
  x: ['M6 6l12 12 M18 6 6 18'],
  up: ['M12 19V5m-6 6 6-6 6 6'],
  bottom: ['M12 5v14m-6-6 6 6 6-6'],
  trash: ['M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v5 M14 11v5'],
  warning: ['M12 4 2 21h20L12 4Z M12 10v4 M12 17v.5'],
  paperclip: ['m8 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8 M7 14l5-5'],
  filter: ['M4 7h16 M7 12h10 M10 17h4'],
} as const;

export type IconName = keyof typeof icons;

@Component({
  selector: 'studio-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    @for (path of icons[name()]; track path) { <path [attr.d]="path"/> }
  </svg>`,
})
export class Icon {
  name = input.required<IconName>();
  readonly icons = icons;
}
