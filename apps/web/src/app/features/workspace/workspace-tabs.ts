import type { IconName } from '../../shared/icon/icon';

export type Tab = 'brief' | 'editor' | 'history' | 'compare' | 'audit';

export const workspaceTabs: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'brief', label: $localize`:@@ui_1cff157212cf:Brief & sources`, icon: 'book' },
  { id: 'editor', label: $localize`:@@ui_c7e9fb2ea6c3:Editor`, icon: 'edit' },
  { id: 'history', label: $localize`:@@ui_90ccd6497400:History`, icon: 'history' },
  { id: 'compare', label: $localize`:@@ui_8d105cf44d39:Compare`, icon: 'compare' },
  { id: 'audit', label: $localize`:@@ui_59fbfec3650c:Generation audit`, icon: 'audit' },
];
