import { provideHttpClient } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { LOCALE_ID } from '@angular/core';
import { initializeLocale, interfaceLocale } from './app/core/i18n/locale';

initializeLocale();

// Translation lookup must be ready before component and service modules evaluate.
void import('./app/app').then(({ App }) => bootstrapApplication(App, {
  providers: [provideHttpClient(), { provide: LOCALE_ID, useValue: interfaceLocale }],
}));
