import type { Brief } from '../../../../../libs/contracts/src/index.js';

export function assessmentRequirements(brief: Brief) {
  if (brief.documentType?.audience === 'teacher' || !/abitur/i.test([
    brief.brief, brief.documentType?.title, brief.documentType?.guidance,
  ].join(' '))) return undefined;
  const explicitCount = /\b(?:genau|exactly)\s+(\d+)\s+(?:aufgaben|fragen|questions|tasks)\b/i.exec(brief.brief + ' ' + brief.mix);
  const count = explicitCount ? Number(explicitCount[1]) : /\bAFB\s+(?:I|II|III)\b[^%\r\n]{0,120}\d\s*%/i.test(brief.brief) ? 3 : 6;
  return {
    minimumQuestions: Math.min(40, Math.max(1, count)),
    minimumSections: count >= 3 ? 3 : 1,
    cognitiveAreas: count >= 3 ? ['AFB I: Reproduktion', 'AFB II: Anwendung und Analyse', 'AFB III: Transfer und Bewertung'] : [],
    level: brief.grade || 'Gymnasiale Oberstufe / Abitur practice',
    scope: 'Create substantial, connected tasks rather than a short definition quiz. Include concrete application and reasoned evaluation. These are practice requirements, not a claim of official exam compliance.',
    unspecifiedSettings: 'If duration or total points are unspecified, choose a suitable practice scope and explain assumptions in teacherNotes. Do not claim that missing settings were supplied.',
  };
}

export function isReferenceBoilerplate(text: string) {
  const lines = text.split('\n').filter(line => line.trim());
  const contents = lines.filter(line => /\.{3,}|(?:[.·]\s*){5,}/.test(line)).length;
  if ((contents >= 2 && contents / lines.length >= 0.5) || (contents >= 3 && contents / lines.length >= 0.25)) return true;
  if (/^\s*(?:inhalt(?:sverzeichnis)?|table of contents|vorwort|preface|foreword|impressum|copyright)\b/i.test(text)) return true;
  return /mit diesem buch halten sie|liebe schülerinnen und schüler|online[-– ]?code|umschlaginnenseite|digitale ergänzung zum buch|am ende der teilkapitel|all rights reserved|alle rechte vorbehalten/i.test(text);
}

export function isTaskOnlyPassage(text: string) {
  const tasks = [...text.matchAll(/^\s*\d+[.)]?\s+(?:(?:a|b|c)\s+)?(?:vergleichen|erklären|erstellen|nennen|beschreiben|beurteilen|berechnen|compare|explain|describe|evaluate|calculate)\b/gim)];
  return tasks.length >= 2;
}
