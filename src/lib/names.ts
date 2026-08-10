// Geschlechts-Erkennung aus dem Vornamen + einheitliche, FORMALE Kundenanrede.
//
// Portiert aus der Mail-Seite (project 3/lib/calculation.ts) — dieselben
// kuratierten Namens-Sets, damit Portal-Anrede und Mail-Anrede konsistent sind.
// Bewusst OHNE den npm-"gender-detection"-Fallback der Mail-Seite (keine
// Browser-Dependency); kuratierte Sets + ein paar ergänzte gängige DE-Namen
// (z. B. Jürgen, Maria). Alle Einträge kleingeschrieben — Lookup lowercased.

const FEMALE_NAMES = new Set([
  'aaliya', 'abby', 'ada', 'adela', 'adelheid', 'adeline', 'adriana', 'agata', 'agatha', 'agnes', 'aiko', 'aila',
  'aileen', 'aimee', 'aisha', 'alana', 'alba', 'aleksandra', 'alexa', 'alexandra', 'alexia', 'alexis', 'alice', 'alicia',
  'alina', 'alissa', 'aliyah', 'alke', 'allie', 'allison', 'alma', 'almut', 'alona', 'alva', 'alwine', 'amalia',
  'amanda', 'amara', 'amaya', 'amelia', 'amelie', 'ami', 'amira', 'amy', 'ana', 'anastasia', 'andrea', 'andreja',
  'angela', 'angelika', 'angelina', 'anita', 'anja', 'anna', 'annalena', 'anne', 'annegret', 'annelies', 'annelore', 'annette',
  'anni', 'annika', 'antje', 'antonia', 'anuschka', 'aoife', 'arabell', 'ariadne', 'ariane', 'astrid', 'aurélie', 'aurora',
  'ava', 'babette', 'barbara', 'beatrice', 'beatrix', 'belen', 'bella', 'bente', 'berit', 'bernadette', 'bettina', 'bianca',
  'birgit', 'birgitt', 'birgitta', 'birgitte', 'borbala', 'brigitta', 'brigitte', 'britt', 'brittany', 'bruna', 'brunhilde', 'camila',
  'camilla', 'cara', 'carina', 'carla', 'carlotta', 'caro', 'carola', 'carolina', 'caroline', 'catharina', 'catharine', 'catrina',
  'cecile', 'cecilia', 'charlotte', 'chiara', 'chloe', 'christel', 'christiane', 'christina', 'christine', 'claudia', 'claudine', 'constanze',
  'corinna', 'cornelia', 'dagmar', 'dana', 'daniela', 'daria', 'deborah', 'diana', 'dina', 'dominique', 'dorothea', 'edda',
  'edith', 'elena', 'eleonora', 'eliane', 'elisa', 'elisabeth', 'elizabeth', 'elke', 'ella', 'ellen', 'elsa', 'elsbeth',
  'else', 'elvira', 'emilia', 'emma', 'erika', 'erna', 'ernestine', 'eva', 'eveline', 'evelyn', 'fatima', 'felicitas',
  'filippa', 'fiona', 'franziska', 'frauke', 'frederike', 'frieda', 'gabriela', 'gabriele', 'gabi', 'gaby', 'gerda', 'gertrud',
  'gisela', 'greta', 'gudrun', 'gülay', 'hanna', 'hannah', 'hannelore', 'heidemarie', 'heidi', 'heike', 'helene', 'helga',
  'henriette', 'hildegard', 'hildegarde', 'hilke', 'hilde', 'ida', 'ilka', 'ilona', 'ilse', 'imke', 'ines', 'ingeborg',
  'ingrid', 'irina', 'iris', 'irmgard', 'irmtraud', 'isabel', 'isabelle', 'isadora', 'jacqueline', 'jana', 'janet', 'janna',
  'jasmin', 'jennifer', 'jessica', 'jette', 'johanna', 'jolanta', 'josefine', 'josephine', 'julia', 'juliane', 'justine', 'karin',
  'karla', 'katharina', 'katharine', 'kathrin', 'katja', 'katrin', 'katrina', 'katrine', 'klara', 'klaudia', 'klarissa', 'kordula',
  'kristin', 'kristina', 'lara', 'larissa', 'laura', 'lea', 'leah', 'lena', 'leonie', 'leonora', 'lieselotte', 'lilli',
  'lillian', 'lilly', 'lina', 'linda', 'lisa', 'lisbeth', 'lore', 'lori', 'lotte', 'lotta', 'louisa', 'louise',
  'lucia', 'luisa', 'luise', 'luzie', 'lydia', 'magdalena', 'maja', 'malin', 'mara', 'margarita', 'margareta', 'margarethe',
  'margit', 'margot', 'marianna', 'marie', 'marielle', 'marina', 'marita', 'marlene', 'marta', 'martina', 'mary', 'mathilde',
  'maud', 'melanie', 'melinda', 'melissa', 'merle', 'mia', 'michelle', 'mira', 'miriam', 'mirja', 'monika', 'nadine',
  'natalia', 'natalie', 'nathalie', 'nele', 'nicola', 'nicole', 'nina', 'nora', 'natascha', 'odette', 'olivia', 'ottilie',
  'patrizia', 'paula', 'pauline', 'petra', 'pia', 'renate', 'ronja', 'rosa', 'rosalie', 'roswitha', 'ruth', 'sabrina',
  'sandra', 'sara', 'sarah', 'silke', 'silvia', 'simona', 'simone', 'sina', 'sofia', 'sonja', 'sophie', 'stefanie',
  'stella', 'stephanie', 'susanne', 'sybille', 'sylvia', 'tamara', 'tanja', 'tatjana', 'teresa', 'theresa', 'theres', 'tina',
  'ulrike', 'ursula', 'uta', 'veronika', 'victoria', 'viola', 'virginia', 'walburga', 'waltraud', 'wanda', 'wiebke', 'wilhelmine',
  'xenia', 'yvonne', 'zoe', 'maria', 'marianne', 'regina', 'renata', 'jadwiga', 'halina', 'krystyna', 'malgorzata', 'grazyna',
  'danuta', 'beata', 'margarete', 'hedwig', 'traute', 'waltraut', 'liselotte', 'annerose', 'rosemarie', 'marlies', 'marlis', 'wibke',
  'elfriede',
]);

const MALE_NAMES = new Set([
  'aaron', 'adam', 'alexander', 'alfred', 'alois', 'andre', 'andreas', 'axel', 'bastian', 'benedikt', 'benjamin', 'bernd',
  'bo', 'burkhard', 'carsten', 'christian', 'christoph', 'claus', 'clemens', 'cornelius', 'damian', 'daniel', 'david', 'dieter',
  'dietmar', 'dirk', 'dominik', 'edgar', 'elias', 'emilio', 'eric', 'erik', 'ernst', 'eugen', 'fabian', 'felix',
  'finn', 'florian', 'frank', 'franz', 'frederik', 'gabriel', 'georg', 'gerhard', 'gottfried', 'guido', 'gunnar', 'günter',
  'günther', 'hans', 'hansjörg', 'hanspeter', 'harry', 'hartmut', 'heinz', 'helge', 'helmut', 'henning', 'henrik', 'herbert',
  'heiko', 'holger', 'horst', 'hubert', 'hugo', 'jakob', 'jan', 'jens', 'joachim', 'joe', 'joel', 'joerg',
  'johannes', 'jonas', 'jonathan', 'jochen', 'jörg', 'joern', 'kai', 'karl', 'kilian', 'klaus', 'kevin', 'konrad',
  'kristian', 'lars', 'leo', 'leon', 'leopold', 'lorenz', 'lothar', 'lucas', 'lukas', 'manfred', 'marco', 'markus',
  'martin', 'matthias', 'max', 'maximilian', 'michael', 'mike', 'moritz', 'nikolaj', 'nikolaus', 'nils', 'norbert', 'oliver',
  'oscar', 'oskar', 'otto', 'patrice', 'patrick', 'paul', 'peter', 'philipp', 'ralf', 'reinhard', 'richard', 'robert',
  'rolf', 'sebastian', 'simon', 'stefan', 'steffen', 'stephan', 'steven', 'sven', 'thomas', 'thorsten', 'tillman', 'tim',
  'tobias', 'tom', 'torsten', 'ulrich', 'uwe', 'valentin', 'victor', 'volker', 'werner', 'willi', 'will', 'willhelm',
  'wolf', 'wolfram', 'xaver', 'jürgen', 'juergen', 'jurgen', 'tomasz', 'wolfgang', 'rainer', 'reiner', 'detlef', 'egon',
  'siegfried', 'wilfried', 'manuel', 'marcel', 'mario', 'rudolf', 'rudi', 'kurt', 'walter', 'ludwig', 'bruno', 'jakub',
  'piotr', 'andrzej', 'krzysztof', 'hartwig', 'eckhard', 'gerd',
]);

export type Anrede = 'Frau' | 'Herr' | 'Familie';

/** Leitet die Anrede aus dem Vornamen ab. null = unbekannt → neutral grüßen. */
export function detectGenderFromName(vorname?: string | null): Anrede | null {
  const v = (vorname ?? '').trim();
  if (!v) return null;
  if (v.toLowerCase().includes(' und ') || v.includes(' & ') || v.includes('/')) return 'Familie';
  const firstWord = v.split(/\s+/)[0].toLowerCase();
  if (FEMALE_NAMES.has(firstWord)) return 'Frau';
  if (MALE_NAMES.has(firstWord)) return 'Herr';
  return null;
}

// Namens-Partikel bleiben klein, weil im Text eine Anrede davorsteht:
// „Frau von Stein", nicht „Frau Von Stein".
const NAME_PARTICLES = new Set([
  'von', 'vom', 'van', 'de', 'del', 'della', 'di', 'da', 'dos', 'das',
  'der', 'den', 'ten', 'ter', 'zu', 'zur', 'zum', 'le', 'la', 'y', 'af', 'of',
]);

function capWord(w: string): string {
  if (!w) return w;
  // Nur wenn der Name SCHREIT, wird der Rest kleingeschrieben — sonst bleibt
  // die bewusste Schreibweise erhalten (McDonald, DiCaprio).
  const rest = w === w.toUpperCase() ? w.slice(1).toLowerCase() : w.slice(1);
  return w.charAt(0).toUpperCase() + rest;
}

/**
 * Eigennamen so schreiben, wie man sie schreibt — nicht wie der Kunde sie
 * getippt hat (Martin, 10.08.2026: „wir haben doch keine Großbuchstaben, immer
 * nur der erste Buchstabe"). „RUPPERT" → „Ruppert", „marco" → „Marco",
 * „MÜLLER-LÜDENSCHEIDT" → „Müller-Lüdenscheidt"; bewusst gemischte Schreibung
 * („McDonald") bleibt unangetastet.
 *
 * Gleiche Regel wie in `project 3/lib/email.ts` und der Edge Function
 * `send-scheduled-emails/names.ts` — die drei Runtimes können sich nicht
 * gegenseitig importieren, Änderungen also überall nachziehen.
 */
export function capitalizeName(name?: string | null): string {
  const t = (name ?? '').trim();
  if (!t) return '';

  return t.split(/\s+/).map((word) =>
    word.split('-').map((part) =>
      NAME_PARTICLES.has(part.toLowerCase()) ? part.toLowerCase() : capWord(part),
    ).join('-'),
  ).join(' ');
}

function cap(s?: string | null): string {
  return capitalizeName(s);
}

/**
 * Einheitliche, FORMALE Kundenanrede fürs Portal (Ladescreen + Header).
 * Regel (User-Wunsch 25.06.2026): immer "Herr/Frau {Nachname}", sonst neutral.
 * Anrede aus dem Feld, sonst aus dem Vornamen abgeleitet (Jürgen → Herr →
 * "Herr Schiffer"). Nie bloßer Nachname, nie raten wenn unsicher → dann null.
 */
export function customerSalutation(lead?: {
  anrede?: string | null;
  anrede_text?: string | null;
  vorname?: string | null;
  nachname?: string | null;
} | null): string | null {
  if (!lead) return null;
  const raw = (lead.anrede_text || lead.anrede || '').trim();
  const fieldAnrede: Anrede | null =
    raw === 'Herr' || raw === 'Frau' || raw === 'Familie' ? (raw as Anrede) : null;
  const anrede = fieldAnrede ?? detectGenderFromName(lead.vorname);
  const nachname = cap(lead.nachname);
  if (!anrede || !nachname) return null;
  return `${anrede} ${nachname}`;
}
