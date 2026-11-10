import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { Assessment, Settings } from '../../../libs/contracts/src/index.js';
import { totalPoints } from '../../../libs/contracts/src/index.js';

type Copy = 'student' | 'teacher';

function presentation(draft: Assessment, settings: Settings, copy: Copy) {
  const german = settings.brief.language === 'de';
  const labels = german
    ? { student: 'Schülerfassung', teacher: 'Lehrkraftfassung', name: 'Name', date: 'Datum', points: 'Punkte',
      answer: 'Lösung', rubric: 'Bewertung', references: 'Quellen', review: 'Hinweise für die Lehrkraft' }
    : { student: 'Student copy', teacher: 'Teacher copy', name: 'Name', date: 'Date', points: 'points',
      answer: 'Answer', rubric: 'Scoring', references: 'Sources', review: 'Teacher notes' };
  let number = 0;
  const evidence = new Map(draft.evidence.map(item => [item.id, item]));
  const sections = draft.sections.map(section => ({
    title: section.title,
    instructions: section.instructions,
    questions: section.questions.map(question => {
      const student = { number: ++number, prompt: question.prompt, points: question.points, lines: question.lines };
      if (copy === 'student') return { ...student, teacher: null };
      const references = question.citations.flatMap(id => {
        const source = evidence.get(id);
        return source ? [source.name + ' §' + (source.ordinal + 1) + ' — ' + source.text] : [];
      });
      return { ...student, teacher: { answer: question.answer, rubric: question.rubric, references } };
    }),
  }));
  return { title: draft.title, instructions: draft.instructions, sections, labels, german,
    subtitle: [labels[copy], settings.brief.subject, settings.brief.grade,
      settings.brief.duration ? settings.brief.duration + ' min' : '', totalPoints(draft) + ' ' + labels.points].filter(Boolean).join(' · '),
    notes: copy === 'teacher' ? [draft.teacherNotes, ...draft.warnings].filter(Boolean) : [],
  };
}

const paragraph = (text: string) => new Paragraph({ children: text.split('\n').map((line, i) => new TextRun({ text: line, break: i ? 1 : 0 })),
  spacing: { after: 110 } });

export function exportDocx(draft: Assessment, settings: Settings, copy: Copy) {
  const data = presentation(draft, settings, copy);
  const labels = data.labels;
  const children: Paragraph[] = [
    new Paragraph({ text: data.title, heading: HeadingLevel.TITLE }),
    paragraph(data.subtitle),
  ];
  if (copy === 'student') children.push(paragraph(labels.name + ' _______________________       ' + labels.date + ' ______________'));
  if (data.instructions) children.push(paragraph(data.instructions));
  for (const section of data.sections) {
    children.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1, keepNext: true }));
    if (section.instructions) children.push(paragraph(section.instructions));
    for (const question of section.questions) {
      const prompt = question.prompt.split('\n');
      children.push(new Paragraph({ spacing: { before: 190, after: 100 }, keepLines: true, keepNext: true, children: [
        new TextRun({ text: question.number + '. ', bold: true }),
        ...prompt.map((text, i) => new TextRun({ text, break: i ? 1 : 0 })),
        new TextRun({ text: '  [' + question.points + ' ' + labels.points + ']', bold: true }),
      ] }));
      if (question.teacher) {
        children.push(paragraph(labels.answer + ' — ' + question.teacher.answer));
        children.push(paragraph(labels.rubric + ' — ' + question.teacher.rubric));
        for (const reference of question.teacher.references) children.push(paragraph(labels.references + ' — ' + reference));
      } else {
        for (let i = 0; i < question.lines; i++) {
          children.push(new Paragraph({ text: '____________________________________________________________________',
            keepNext: i + 1 < Math.min(3, question.lines), spacing: { after: 105 } }));
        }
      }
    }
  }
  if (data.notes.length) {
    children.push(new Paragraph({ text: labels.review, heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
    for (const note of data.notes) children.push(paragraph(note));
  }
  return Packer.toBuffer(new Document({
    title: data.title,
    styles: { default: { document: { run: { font: 'Calibri', size: 23 }, paragraph: { spacing: { line: 280 } } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 },
      margin: { top: 950, bottom: 950, left: 1050, right: 1050 } } }, children }],
  }));
}

const escape = (value: string) => value.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function exportPrint(draft: Assessment, settings: Settings, copy: Copy) {
  const data = presentation(draft, settings, copy);
  const labels = data.labels;
  const text = (value: string) => escape(value).replaceAll('\n', '<br>');
  const sections = data.sections.map(section => `<section><h2>${escape(section.title)}</h2>
    ${section.instructions ? '<p>' + text(section.instructions) + '</p>' : ''}
    ${section.questions.map(question => `<article><h3>${question.number}. ${text(question.prompt)}
      <span>[${question.points} ${labels.points}]</span></h3>
      ${question.teacher
        ? `<p><b>${labels.answer}</b> ${text(question.teacher.answer)}</p><p><b>${labels.rubric}</b> ${text(question.teacher.rubric)}</p>
            ${question.teacher.references.map(ref => '<p><b>' + labels.references + '</b> ' + text(ref) + '</p>').join('')}`
        : '<div class="space" aria-hidden="true">' + '<div></div>'.repeat(question.lines) + '</div>'}</article>`).join('')}</section>`).join('');
  const notes = data.notes.length ? `<section class="notes"><h2>${labels.review}</h2>${data.notes.map(note => '<p>' + text(note) + '</p>').join('')}</section>` : '';
  return `<!doctype html><html lang="${data.german ? 'de' : 'en'}"><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(data.title)}</title>
  <style>
    @page { size: A4; margin: 17mm 18mm }
    * { box-sizing: border-box } body { font: 11pt/1.5 system-ui,sans-serif; color:#171c17; margin:0 }
    main { max-width: 174mm; margin: 14mm auto; padding: 0 3mm }
    h1 { font: 26pt/1.15 Georgia,serif; margin: 0 0 5mm } h2 { font: 17pt Georgia,serif; border-bottom:1px solid #888; padding-bottom:2mm; break-after:avoid }
    h3 { font-size:11pt; margin-bottom:3mm; break-after:avoid } h3 span { white-space:nowrap; color:#454f45 }
    article { break-inside: avoid; margin-bottom: 6mm } .space div { height:8mm; border-bottom: 1px solid #aaa }
    .notes { break-before:page } button { padding: .5rem 1rem; margin-bottom:6mm; cursor:pointer }
    @media print { button { display:none } main { max-width:none; padding:0; margin:0 } }
  </style>
  <main><button onclick="window.print()">${data.german ? 'Drucken / als PDF speichern' : 'Print / save as PDF'}</button>
  <h1>${escape(data.title)}</h1><p>${escape(data.subtitle)}</p>
  ${copy === 'student' ? '<p>' + labels.name + ' ______________________ &nbsp; ' + labels.date + ' ______________</p>' : ''}
  ${data.instructions ? '<p>' + text(data.instructions) + '</p>' : ''}
  ${sections}${notes}</main></html>`;
}
