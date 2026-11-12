import { loadTranslations } from '@angular/localize';
import { registerLocaleData } from '@angular/common';
import germanLocale from '@angular/common/locales/de';
import german from '../../../locale/messages.de.json';

export type InterfaceLocale = 'en' | 'de';
const preferenceKey = 'classroom-studio.interface-locale';

function savedLocale(): string | null {
  try { return localStorage.getItem(preferenceKey); } catch { return null; }
}

const requested = new URLSearchParams(location.search).get('lang');
const preferred = requested === 'en' || requested === 'de' ? requested : savedLocale();
export const interfaceLocale: InterfaceLocale = preferred === 'de' ? 'de'
  : preferred === 'en' ? 'en' : navigator.language.startsWith('de') ? 'de' : 'en';

export function initializeLocale() {
  if (requested === 'en' || requested === 'de') {
    try { localStorage.setItem(preferenceKey, requested); } catch { /* URL keeps the preference for this session. */ }
  }
  registerLocaleData(germanLocale, 'de');
  if (interfaceLocale === 'de') loadTranslations(german.translations);
  $localize.locale = interfaceLocale;
  document.documentElement.lang = interfaceLocale;
}

export function rememberLocale(locale: InterfaceLocale) {
  try { localStorage.setItem(preferenceKey, locale); } catch { /* The current session can still switch languages. */ }
  // A query parameter also supports browsers where local storage is unavailable.
  const url = new URL(location.href);
  url.searchParams.set('lang', locale);
  location.assign(url);
}
