import { interfaceLocale } from '../core/i18n/locale';
export function formatTimestamp(value: string) { return new Date(value).toLocaleString(interfaceLocale, { dateStyle: 'medium', timeStyle: 'short' }); }
