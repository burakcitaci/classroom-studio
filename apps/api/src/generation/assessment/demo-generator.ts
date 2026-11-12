import type { GenerationContext, Generator, ModelOutput, ModelQuestion } from './assessment-schema.js';

const ecosystem = {
  en: [
    ['A meadow contains clover, rabbits and foxes. Draw a food chain for these organisms and label the producer.', 'Clover → rabbit → fox. Clover is the producer.'],
    ['After a dry month, grass growth slows. Explain one possible effect on rabbits and one effect farther along the food chain.', 'Less grass means less food for rabbits. A smaller rabbit population may leave predators with less prey.'],
    ['A class finds fungi growing on a fallen branch. Explain why the fungi matter to the ecosystem.', 'Fungi break down dead material and return nutrients that plants can use.'],
    ['A school garden adds flowering plants and sees more pollinating insects. Predict one possible effect on plants in the garden and explain it.', 'More visits can transfer more pollen, which may help more plants produce seeds or fruit.'],
    ['A pond loses many of its aquatic plants after several cloudy weeks. Predict one possible effect on the animals and explain your reasoning.', 'Plant-eating animals could have less food, which may also affect animals that eat them.'],
  ],
  de: [
    ['Auf einer Wiese leben Klee, Kaninchen und Füchse. Zeichne eine Nahrungskette und kennzeichne den Produzenten.', 'Klee → Kaninchen → Fuchs. Klee ist der Produzent.'],
    ['Nach einem trockenen Monat wächst das Gras langsamer. Erkläre eine mögliche Folge für Kaninchen und eine weitere Folge in der Nahrungskette.', 'Kaninchen finden weniger Futter. Bei weniger Kaninchen finden ihre Fressfeinde möglicherweise weniger Beute.'],
    ['Eine Klasse entdeckt Pilze auf einem abgebrochenen Ast. Erkläre, warum die Pilze für das Ökosystem wichtig sind.', 'Pilze bauen totes Material ab und führen Nährstoffe zurück, die Pflanzen nutzen können.'],
    ['Im Schulgarten wachsen mehr Blütenpflanzen und es kommen mehr bestäubende Insekten. Sage eine mögliche Folge für die Pflanzen voraus und begründe sie.', 'Durch mehr Besuche kann mehr Pollen übertragen werden. Dadurch können mehr Samen oder Früchte entstehen.'],
    ['In einem Teich wachsen nach mehreren trüben Wochen deutlich weniger Wasserpflanzen. Nenne eine mögliche Folge für die Tiere und begründe sie.', 'Pflanzenfresser könnten weniger Futter finden. Das kann auch ihre Fressfeinde beeinflussen.'],
  ],
};

const localization = {
  en: {
    sections: ['Core concepts', 'Apply your knowledge'], instruction: 'Answer in complete sentences. Show your reasoning where asked.',
    notes: 'Review the wording and scoring before sharing this assessment.',
    demo: 'Demo mode uses templates. Verify the questions, solutions and source relevance before using them.',
    generic: (topic: string) => [
      ['Define one key concept in ' + topic + ' and give a concrete example.', 'A correct definition with a specific, relevant example.'],
      ['Describe two related ideas from ' + topic + ' and explain how they differ.', 'Two accurate descriptions and one meaningful difference.'],
      ['Choose a classroom example related to ' + topic + '. Explain which concept it illustrates.', 'A relevant example and an explanation tied to the concept.'],
      ['Apply one principle from ' + topic + ' to an unfamiliar example and justify your choice.', 'An appropriate principle, a valid application and a justification.'],
      ['Give a new example of ' + topic + ' and explain which details support your interpretation.', 'A relevant new example with a reason based on its details.'],
    ],
    rubric: (points: number) => 'Award up to ' + points + ' points for the correct idea and a clear explanation as requested.',
    kinds: ['Exam', 'Quiz', 'Worksheet', 'Practice Test', 'Custom assessment'],
  },
  de: {
    sections: ['Grundwissen', 'Wissen anwenden'], instruction: 'Antworte in ganzen Sätzen. Begründe deine Antwort, wenn danach gefragt wird.',
    notes: 'Prüfe die Formulierungen und die Bewertung vor der Weitergabe.',
    demo: 'Der Demomodus verwendet Vorlagen. Prüfe Aufgaben, Lösungen und Quellenbezug vor dem Einsatz.',
    generic: (topic: string) => [
      ['Definiere einen wichtigen Begriff zu „' + topic + '“ und nenne ein konkretes Beispiel.', 'Eine korrekte Definition und ein passendes konkretes Beispiel.'],
      ['Beschreibe zwei verwandte Ideen zu „' + topic + '“ und erkläre den Unterschied.', 'Zwei korrekte Beschreibungen und ein nachvollziehbarer Unterschied.'],
      ['Wähle ein Unterrichtsbeispiel zu „' + topic + '“ und erkläre, welchen Begriff es veranschaulicht.', 'Ein passendes Beispiel und eine Erklärung mit Bezug zum Begriff.'],
      ['Wende ein Prinzip zu „' + topic + '“ auf ein neues Beispiel an und begründe deine Wahl.', 'Ein geeignetes Prinzip, eine richtige Anwendung und eine Begründung.'],
      ['Nenne ein neues Beispiel zu „' + topic + '“ und begründe deine Einordnung anhand konkreter Merkmale.', 'Ein passendes Beispiel und eine Begründung anhand konkreter Merkmale.'],
    ],
    rubric: (points: number) => 'Vergib bis zu ' + points + ' Punkte für eine fachlich richtige und nachvollziehbare Antwort.',
    kinds: ['Klassenarbeit', 'Quiz', 'Arbeitsblatt', 'Übungstest', 'Individuelle Lernkontrolle'],
  },
};

export class DemoGenerator implements Generator {
  readonly model = 'Classroom templates (demo)';

  async generate({ settings, evidence, existing }: GenerationContext) {
    const { brief } = settings;
    const language = brief.language;
    const labels = localization[language];
    const topic = brief.topics || brief.subject || brief.brief.slice(0, 80).replace(/[.!?]$/, '');
    const isEcosystem = /ecosystem|food chain|food web|ökosystem|nahrungskette|nahrungsnetz/i.test(
      [brief.brief, brief.subject, brief.topics].join(' '));
    const bank = isEcosystem ? ecosystem[language] : labels.generic(topic);
    const defaultCount = brief.kind === 'Quiz' ? 3 : 4;
    const total = existing?.points ?? brief.totalPoints ?? (defaultCount * 5);
    const count = existing ? 1 : Math.min(total, defaultCount);
    const makeQuestion = (i: number): ModelQuestion => {
      const [prompt, answer] = bank[existing ? bank.length - 1 : i];
      const points = Math.floor(total / count) + Number(i < total % count);
      const support = isEcosystem ? evidence.findIndex(item => {
        const cues = [
          /producer|produzent|clover|klee/i, /grass|gras|rabbit|kaninchen/i,
          /fungi|pilze|decomposer|zersetz/i, /pollinat|bestäub/i, /pond|teich/i,
        ];
        return cues[existing ? bank.length - 1 : i].test(item.text);
      }) : -1;
      return { prompt, points, lines: i % 2 ? 4 : 3, answer, rubric: labels.rubric(points),
        citations: support >= 0 ? [support + 1] : [] };
    };
    const questions = Array.from({ length: count }, (_, i) => makeQuestion(i));
    if (existing && questions[0].prompt === existing.prompt) {
      const [prompt, answer] = bank[1];
      questions[0] = { ...questions[0], prompt, answer, citations: [] };
    }
    const split = Math.ceil(count / 2);
    const titleTopic = isEcosystem ? (language === 'de' ? 'Ökosysteme' : 'Ecosystems') : topic;
    const kind = brief.documentType?.title ?? labels.kinds[['Exam', 'Quiz', 'Worksheet', 'Practice Test', 'Custom'].indexOf(brief.kind)];
    const output: ModelOutput = {
      title: (titleTopic + ' · ' + kind).slice(0, 180),
      instructions: labels.instruction,
      sections: [{ title: labels.sections[0], instructions: '', questions: questions.slice(0, split) }],
      teacherNotes: labels.notes,
      warnings: [labels.demo],
    };
    if (questions.length > split) output.sections.push({ title: labels.sections[1], instructions: '', questions: questions.slice(split) });
    return { output };
  }
}
