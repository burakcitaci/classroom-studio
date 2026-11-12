import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph,
  Tab, TabStopType, TextRun } from 'docx';
import type { Assessment, Settings } from '../../../../libs/contracts/src/index.js';
import { normalizeSectionHeading, totalPoints } from '../../../../libs/contracts/src/index.js';

type Copy = 'student' | 'teacher';

function presentation(draft: Assessment, settings: Settings, copy: Copy) {
  const german = settings.brief.language === 'de';
  const labels = german
    ? { student: 'Schülerfassung', teacher: 'Lehrkraftfassung', name: 'Name', date: 'Datum', grade: 'Klasse', subject: 'Fach', points: 'Punkte',
      time: 'Arbeitszeit', total: 'Gesamtpunkte', question: 'Aufgabe', instructions: 'Hinweise',
      page: 'Seite', of: 'von', answer: 'Lösung', rubric: 'Bewertung', references: 'Quellen',
      review: 'Hinweise für die Lehrkraft', print: 'Drucken / als PDF speichern',
      printHint: 'Für eine saubere Druckfassung „Kopf- und Fußzeilen“ im Druckdialog deaktivieren.' }
    : { student: 'Student copy', teacher: 'Teacher copy', name: 'Name', date: 'Date', grade: 'Class', subject: 'Subject', points: 'points',
      time: 'Time', total: 'Total points', question: 'Question', instructions: 'Instructions',
      page: 'Page', of: 'of', answer: 'Answer', rubric: 'Scoring', references: 'Sources',
      review: 'Teacher notes', print: 'Print / save as PDF',
      printHint: 'Turn off “Headers and footers” in the print dialog to remove the browser’s URL and date.' };
  let number = 0;
  const evidence = new Map(draft.evidence.map(item => [item.id, item]));
  const sections = draft.sections.map(section => ({
    title: normalizeSectionHeading(section.title),
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
  const { subject, grade, duration } = settings.brief;
  const details = [
    { label: labels.grade, value: grade },
    { label: labels.subject, value: subject },
    { label: labels.time, value: duration ? duration + ' min' : '' },
    { label: labels.total, value: String(totalPoints(draft)) },
  ].filter(item => item.value);
  return { title: draft.title, instructions: draft.instructions, sections, labels, german, details,
    notes: copy === 'teacher' ? [draft.teacherNotes, ...draft.warnings].filter(Boolean) : [],
  };
}

const lines = (text: string) => text.split('\n').map((line, i) => new TextRun({ text: line, break: i ? 1 : 0 }));
const paragraph = (text: string, label?: string) => new Paragraph({
  children: [...(label ? [new TextRun({ text: label + ': ', bold: true })] : []), ...lines(text)],
  spacing: { after: 115 },
});
const rule = { style: BorderStyle.SINGLE, size: 4, color: 'A9A9A9' };
const pageWidth = 11906;
const sideMargin = 1134;
const textWidth = pageWidth - 2 * sideMargin;

export function exportDocx(draft: Assessment, settings: Settings, copy: Copy) {
  const data = presentation(draft, settings, copy);
  const labels = data.labels;
  const children: Paragraph[] = [];
  if (copy === 'student') {
    children.push(new Paragraph({ tabStops: [{ type: TabStopType.LEFT, position: 5700 }],
      keepNext: true, spacing: { after: 260 }, children: [
        new TextRun({ text: labels.name + '  ', bold: true }), new TextRun('_______________________'),
        new TextRun({ children: [new Tab(), labels.date + '  '], bold: true }), new TextRun('______________'),
      ] }));
  }
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { after: 80 },
    children: [new TextRun({ text: labels[copy], size: 20, bold: true, color: '444444' })] }));
  children.push(new Paragraph({ text: data.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, keepNext: true }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { after: 210 },
    children: data.details.flatMap(({ label, value }, index) => [
      new TextRun({ text: (index ? '   ·   ' : '') + label + ': ', bold: true }), new TextRun(value),
    ]) }));
  if (data.instructions) children.push(paragraph(data.instructions, labels.instructions));
  for (const section of data.sections) {
    children.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1, keepNext: true,
      border: { bottom: { ...rule, space: 4 } } }));
    if (section.instructions) children.push(new Paragraph({ children: lines(section.instructions), keepNext: true,
      spacing: { after: 115 } }));
    for (const question of section.questions) {
      children.push(new Paragraph({ spacing: { before: 190, after: 65 }, keepNext: true,
        tabStops: [{ type: TabStopType.RIGHT, position: textWidth }], children: [
        new TextRun({ text: labels.question + ' ' + question.number, bold: true }),
        new TextRun({ children: [new Tab(), '/ ' + question.points + ' ' + labels.points], color: '4A4A4A' }),
      ] }));
      children.push(new Paragraph({ children: lines(question.prompt), keepLines: true,
        keepNext: !!question.teacher || question.lines > 0, spacing: { after: 110 } }));
      if (question.teacher) {
        children.push(paragraph(question.teacher.answer, labels.answer));
        children.push(paragraph(question.teacher.rubric, labels.rubric));
        for (const reference of question.teacher.references) children.push(paragraph(reference, labels.references));
      } else {
        for (let i = 0; i < question.lines; i++) {
          children.push(new Paragraph({ text: ' ', border: { bottom: rule, between: rule },
            keepNext: i + 1 < question.lines, spacing: { line: 425, lineRule: 'exact' } }));
        }
      }
    }
  }
  if (data.notes.length) {
    children.push(new Paragraph({ text: labels.review, heading: HeadingLevel.HEADING_1, keepNext: true }));
    for (const note of data.notes) children.push(paragraph(note));
  }
  return Packer.toBuffer(new Document({
    title: data.title,
    styles: { default: {
      document: { run: { font: 'Arial', size: 22 }, paragraph: { spacing: { line: 280 } } },
      title: { run: { font: 'Arial', size: 36, bold: true, color: '222222' }, paragraph: { spacing: { after: 120 } } },
      heading1: { run: { font: 'Arial', size: 25, bold: true, color: '222222' },
        paragraph: { spacing: { before: 260, after: 155 } } },
    } },
    sections: [{ properties: { page: { size: { width: pageWidth, height: 16838 },
      margin: { top: 1020, bottom: 1020, left: sideMargin, right: sideMargin } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [
        new TextRun({ size: 18, children: [labels.page + ' ', PageNumber.CURRENT, ' ' + labels.of + ' ', PageNumber.TOTAL_PAGES] }),
      ] })] }) }, children }],
  }));
}

const escape = (value: string) => value.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function exportPrint(draft: Assessment, settings: Settings, copy: Copy) {
  const data = presentation(draft, settings, copy);
  const labels = data.labels;
  const text = (value: string) => escape(value).replaceAll('\n', '<br>');
  const details = data.details.map(({ label, value }) =>
    `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('');
  const sections = data.sections.map(section => {
    const [firstQuestion = '', ...remaining] = section.questions.map(question => `<article><h3>${labels.question} ${question.number}
      <span class="marks">${copy === 'student' ? '/ ' : ''}${question.points} ${labels.points}</span></h3>
      <p class="prompt">${text(question.prompt)}</p>
      ${question.teacher
        ? `<div class="solution"><p><b>${labels.answer}:</b> ${text(question.teacher.answer)}</p>
            <p><b>${labels.rubric}:</b> ${text(question.teacher.rubric)}</p></div>
            ${question.teacher.references.map(ref => '<p class="reference"><b>' + labels.references + ':</b> ' + text(ref) + '</p>').join('')}`
        : question.lines ? '<div class="answer-space" aria-hidden="true">' + '<div></div>'.repeat(question.lines) + '</div>' : ''}</article>`);
    return `<section><div class="section-start"><h2>${escape(section.title)}</h2>
      ${section.instructions ? '<p class="section-instructions">' + text(section.instructions) + '</p>' : ''}
      ${firstQuestion}</div>${remaining.join('')}</section>`;
  }).join('');
  const notes = data.notes.length ? `<section class="notes"><h2>${labels.review}</h2>${data.notes.map(note => '<p>' + text(note) + '</p>').join('')}</section>` : '';
  return `<!doctype html><html lang="${data.german ? 'de' : 'en'}"><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(data.title)}</title>
  <style>
    @page {
      size: A4;
      margin: 18mm 20mm;
      @bottom-right { content: "${labels.page} " counter(page) " ${labels.of} " counter(pages); font: 9pt Arial, sans-serif; }
    }
    * { box-sizing: border-box }
    body { font: 11pt/1.45 Arial, sans-serif; color: #222; margin: 0; overflow-wrap: anywhere }
    p { margin: 0 0 2.5mm; orphans: 2; widows: 2 }
    .exam-header { margin-bottom: 4.5mm; break-inside: avoid }
    .identity { display: grid; grid-template-columns: 3fr 2fr; gap: 9mm; margin: 0 0 5mm }
    .identity span { display: flex; align-items: baseline; gap: 2mm }
    .identity span::after { content: ""; flex: 1; border-bottom: 1px solid #777 }
    .copy { margin-bottom: 1.5mm; font-weight: bold; color: #444; text-align: center }
    h1 { font-size: 18pt; line-height: 1.2; text-align: center; margin: 0 0 4mm }
    .details { display: flex; flex-wrap: wrap; justify-content: center; gap: 1mm 5mm; margin: 0 }
    .details div { display: flex; flex-wrap: wrap; gap: .5mm 1.5mm }
    dt { font-weight: bold }
    dt::after { content: ":" }
    dd { margin: 0 }
    .instructions { margin-bottom: 4mm }
    h2 { font-size: 13pt; margin: 5mm 0 2.5mm; padding-bottom: 1.5mm; border-bottom: 1px solid #aaa; break-after: avoid }
    h3 { display: flex; justify-content: space-between; gap: 3mm; font-size: 11pt; margin: 0 0 2mm; break-after: avoid }
    .marks { font-weight: normal; color: #444; white-space: nowrap }
    .section-instructions, .prompt:has(+ .answer-space), .prompt:has(+ .solution) { break-after: avoid }
    article, .section-start { break-inside: avoid }
    article { margin-bottom: 4mm }
    .answer-space > div { height: 7.5mm; border-bottom: 1px solid #a3a3a3; break-inside: avoid }
    .solution { border-left: 2px solid #888; padding: 1.5mm 3mm; background: #f4f4f4 }
    .solution p:last-child { margin-bottom: 0 }
    .reference { color: #444; font-size: 9pt; margin-top: 2mm }
    .toolbar { max-width: 210mm; margin: auto; padding: 3mm 4mm; display: flex; flex-wrap: wrap; align-items: center; gap: 2mm 4mm; font-size: 10pt }
    .toolbar button { font: inherit; font-weight: bold; padding: 2mm 3mm; cursor: pointer }
    @media screen {
      body { background: #eef0f3 }
      main { max-width: 210mm; min-height: 297mm; margin: 0 auto 5mm; padding: 18mm clamp(5mm, 6vw, 20mm); background: white }
    }
    @media print { .toolbar { display: none } }
  </style>
  <body><div class="toolbar"><button type="button" onclick="window.print()">${labels.print}</button><span>${labels.printHint}</span></div>
  <main><header class="exam-header">
  ${copy === 'student' ? `<div class="identity"><span><b>${labels.name}:</b></span><span><b>${labels.date}:</b></span></div>` : ''}
  <p class="copy">${labels[copy]}</p>
  <h1>${escape(data.title)}</h1><dl class="details">${details}</dl></header>
  ${data.instructions ? `<p class="instructions"><b>${labels.instructions}:</b> ${text(data.instructions)}</p>` : ''}
  ${sections}${notes}</main></body></html>`;
}
