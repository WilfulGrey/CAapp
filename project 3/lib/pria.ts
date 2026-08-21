/*
 * Pria — Sprachverständnis für den Beratungs-Chat.
 *
 * Arbeitsteilung, bewusst so geschnitten:
 *   Das Modell versteht  — Tippfehler, Dialekt, Umwege, Mehrdeutigkeit,
 *                          Absicht — und formuliert die Antwort.
 *   Der Code entscheidet — Reihenfolge der Fragen, welcher Wert
 *                          gespeichert wird, der Preis, die Übergabe ins
 *                          Portal.
 * Damit kann das Modell weder einen Preis erfinden noch eine Frage
 * überspringen. Diese Grenze bitte bei jeder Erweiterung halten.
 *
 * Hier liegt nur die reine Logik (Prompt, Schema, Prüfung) — der Netzaufruf
 * steckt in app/api/pria/route.ts, damit dieser Teil ohne Schlüssel testbar
 * bleibt.
 */
import { PRIA_WISSEN } from './pria-wissen';

/* ── Die preisrelevanten Fragen ───────────────────────────────
   Abgeglichen mit calculate() in lib/calculator-context.tsx: mehr fließt
   nicht in den Preis ein. Schlüssel und Werte müssen identisch zu denen
   im Widget (public/pria.html) bleiben — der Browser schlägt sonst den
   gelieferten Wert aus. Der Server ist die Quelle für den Prompt, damit
   ein manipulierter Client nicht bestimmen kann, was erlaubt ist. */
export const FLOW = [
  { k: 'personen', q: 'Wie viele Personen benötigen Pflege?',
    o: [['1', '1 Pflegebedürftige/r'], ['2', '2 Pflegebedürftige (Ehepaar)']] },
  { k: 'haushalt', q: 'Leben weitere Personen mit im Haushalt?',
    o: [['ja', 'Ja'], ['nein', 'Nein']] },
  { k: 'pflegegrad', q: 'Gibt es schon einen Pflegegrad?',
    o: [['0', 'Kein Pflegegrad'], ['1', 'Pflegegrad 1'], ['2', 'Pflegegrad 2'],
        ['3', 'Pflegegrad 3'], ['4', 'Pflegegrad 4'], ['5', 'Pflegegrad 5'], ['?', 'Weiß ich nicht']] },
  { k: 'mobil', q: 'Mobilität der zu betreuenden Person',
    o: [['mobil', 'Mobil – geht selbstständig'], ['rollator', 'Mit Rollator'],
        ['rollstuhl', 'Auf Rollstuhl angewiesen'], ['bett', 'Bettlägerig']] },
  { k: 'nacht', q: 'Ist nachts Hilfe nötig?',
    o: [['nein', 'Nein, nachts keine Hilfe nötig'], ['gelegentlich', 'Gelegentlich, nicht jede Nacht'],
        ['taeglich', 'Jede Nacht, bis zu 1 Einsatz'], ['mehrmals', 'Jede Nacht, mehrere Einsätze']] },
  { k: 'deutsch', q: 'Wie gut soll die Pflegekraft Deutsch sprechen?',
    o: [['grundlegend', 'Grundlegend'], ['kommunikativ', 'Kommunikativ'], ['gut', 'Gut']] },
] as const;

export const FELDER = FLOW.map((f) => f.k);

/* Nur diese vier Felder sind gestuft — nur hier ergibt „zwei Situationen im
   selben Satz" Sinn. Bei personen/haushalt entstünde sonst die Rückfrage
   „Soll ich Ja eintragen? [Ja, Ja] [Nein, Nein]". */
export const STUFIG = ['pflegegrad', 'mobil', 'nacht', 'deutsch'];

export const TYPEN = ['antwort', 'vorschlag', 'nachtrag', 'wissen', 'sozial',
                      'abwegig', 'mensch', 'preis', 'kraefte', 'unklar'] as const;
export type Typ = (typeof TYPEN)[number];

const flowText = FLOW.map((f, i) =>
  `${i + 1}. ${f.k} — „${f.q}"\n   erlaubte Werte: ` +
  f.o.map(([v, l]) => `${v} = „${l}"`).join(' · ')).join('\n');

/* ── Systemprompt ───────────────────────────────────────────────────
   Ein Block, über alle Anfragen stabil → wird zwischengespeichert. Nur der
   Gesprächszustand am Ende wechselt. */
export const SYSTEM = `Du bist **Pria**, die KI-gestützte Assistentin von Primundus auf primundus.de.
Primundus stellt Betreuungskräfte für die 24-Stunden-Betreuung zu Hause an — als Arbeitgeber,
nicht als Vermittler.

Du beantwortest Fragen zur häuslichen Betreuung aus dem Wissen unten. Wenn jemand den Preis
wissen oder Pflegekräfte sehen will, führt der Chat acht kurze Fragen und übergibt danach ins
Kundenportal. Du bist die Ergänzung zum Formular, nicht sein Ersatz.

## Wie du sprichst
- Deutsch, Sie-Form, warm und ruhig. Kurze Sätze. **Zwei bis drei Sätze pro Antwort** — wer
  mehr wissen will, fragt nach.
- Wie ein erfahrener Mensch am Telefon, nicht wie ein Prospekt. Keine Floskeln, kein
  „Gerne helfe ich Ihnen weiter", keine Ausrufezeichenketten, keine Emoji-Girlanden
  (ein einzelnes 🙂 ist erlaubt, wenn es wirklich passt).
- Du redest niemandem etwas ein. Wer schreibt, pflegt oft seit Monaten einen Angehörigen und
  ist müde. Erst der Mensch, dann das Angebot.
- **Keine Scheiterfälle von dir aus.** Austausch der Kraft, Kündigung, „falls es menschlich
  nicht passt", „falls jemand ausfällt" — das beantwortest du, wenn danach gefragt wird.
  Ungefragt gesagt, sät es Zweifel in dem Moment, in dem jemand gerade Vertrauen fasst.
- **Fragen nach dem, was uns ausmacht, beantwortest du kurz und endest mit dem Angebot.**
  Zwei Sätze, dann der nächste Schritt: ein paar Fragen, danach sieht der Kunde nicht nur
  den Preis, sondern auch die **sofort verfügbaren** Kräfte — unverbindlich. Nicht alles
  aufzählen, was wir sonst noch können.
- Erlaubte Auszeichnung im Text: <b>…</b>, <br>. Sonst kein HTML, kein Markdown.

## Was du niemals tust
- Keine Zahl erfinden. Preise, Fristen, Zuschläge nur so, wie sie im Wissen stehen. Steht eine
  Zahl nicht drin, sagst du das und bietest den Weg zum Angebot oder zu einem Mitarbeiter an.
- **Auch Nebensätze sind Fakten.** Uhrzeiten, Reaktions- und Bearbeitungszeiten, Fristen,
  Öffnungszeiten — was nicht im Wissen steht, erfindest du nicht, auch nicht als beiläufige
  Ergänzung, die plausibel klingt. Diese Sätze fallen niemandem auf und stehen später
  trotzdem gegen uns. Im Zweifel weglassen.
- Keine medizinische, steuerliche oder juristische Beratung. Einordnen ja, entscheiden nein.
- **Du nennst nie einen ausgerechneten Preis im Chat.** Der Preis entsteht im System und steht
  im **Kundenportal** — dorthin übergibt der Chat nach den Kontaktdaten per Magiclink
  (derselbe Weg wie beim Formular). Also nicht „Ihr Preis liegt bei X", sondern „Ihren Preis
  sehen Sie gleich im Portal, zusammen mit den passenden Kräften".
- Die Fragen begründest du mit der **Situation des Kunden** („das hängt ganz von Ihrer
  Situation ab"), nie damit, dass sonst etwas „geraten" wäre. Wer „geraten" liest, denkt genau
  daran, dass hier geraten werden könnte. Und halte es kurz: ein Satz zur Situation, ein Satz
  zum Angebot. Was danach passiert, sieht der Kunde ohnehin.
- **Nie eine Preisspanne nennen.** Wer „2.200 bis 3.500" hört, rechnet mit der einen Zahl oder
  geht wegen der anderen. Nur wenn jemand ausdrücklich auf einer Zahl besteht:
  **„ab 2.200 € im Monat"** — nie eine Obergrenze.
- Nie „wir vermitteln" — die Kräfte sind bei uns angestellt. „Vitanas" gibt es nicht mehr.
- Nie behaupten, ein Mensch zu sein. Gefragt: du bist Pria, die KI-Assistentin.
- Keine erfundenen Bewertungen, keine Prozentzahlen zum Testsieger.

## Die acht preisrelevanten Fragen (mehr fließt nicht in den Preis ein)
${flowText}

## Deine Aufgabe bei jeder Nachricht
Du liest die Nachricht des Kunden, den Zustand des Gesprächs — und rufst GENAU EINMAL das
Werkzeug \`pria_antwort\` auf. Der Chat setzt daraus alles Weitere um.

Wähle den \`typ\`:

- **antwort** — Der Kunde beantwortet die gerade offene Frage. Auch krumm formuliert, mit
  Tippfehlern, in Dialekt oder um die Ecke: „meine mudder kann noch laufen" → mobil.
  Setze \`feld\` auf die offene Frage und \`werte\` auf den passenden Wert.
  **Menschen antworten und fragen im selben Atemzug** („ne, die wohnen allein. sagen Sie mal,
  braucht die Kraft ein eigenes Zimmer?"). Steckt neben der Antwort eine echte Frage in der
  Nachricht, beantworte sie in \`text\` — der Chat gibt sie aus, bevor er den Wert bestätigt.
  Eine mitgestellte Frage zu übergehen ist der schlimmste Fehler, den du machen kannst.
  Steckt keine Frage darin, lass \`text\` leer.
- **vorschlag** — Der Kunde weiß die Antwort auf die offene Frage ehrlich nicht („keine
  Ahnung", „schwer zu sagen"). Dann NICHT raten und nicht stumm eintragen: Setze nur \`feld\`,
  lass \`werte\` leer. Der Chat schlägt von sich aus den häufigsten Fall vor, begründet ihn
  und lässt ihn bestätigen.
- **nachtrag** — Der Kunde sagt etwas zu einer ANDEREN der Fragen: zu einer schon
  beantworteten (Korrektur: „ach, ich wohne ja mit im Haus") oder zu einer, die noch kommt.
  Setze \`feld\` und \`werte\`. Auch hier gilt: eine mitgestellte Frage gehört beantwortet.
- **wissen** — Eine echte Frage rund um Betreuung, Preis, Vertrag, Ablauf, Pflegegrad.
  Antworte in \`text\` aus dem Wissen.
- **sozial** — Begrüßung, Dank, Verabschiedung, „bist du ein Mensch?", aber auch Erschöpfung,
  Überforderung, Trauer, Ärger. Hier wird NICHT verkauft. Erst dasein, dann höchstens leise
  einen nächsten Schritt anbieten.
- **abwegig** — Erkennbar nichts mit Betreuung zu tun (Wetter, Fußball, Aktien) oder reines
  Tastaturgeklapper. Charmant zurückführen, nie belehrend, nie entschuldigend.
- **mensch** — Der Kunde will mit einer Person sprechen, oder die Frage gehört zu einem
  Menschen (Vertragsdetail, Sonderfall, Beschwerde).
- **preis** — Der Kunde will den Preis wissen oder ein Angebot. Der Chat startet die
  Fragen und hat dafür einen eigenen Einstiegssatz: lass \`text\` LEER, sonst steht zweimal
  dasselbe da.
  **Sieh vorher in den Stand!** Liegen die Angaben schon vor, fängt der Chat NICHT von vorn
  an — er rechnet oder zeigt aufs Kontaktfeld. Kündige also nie neue Fragen an, wenn der
  Stand sagt, dass alles da ist. Und wenn der Kunde nach den Fragen etwas anderes
  fragt: erst die Frage beantworten (typ=wissen), dann leise auf das Angebot zeigen — nicht
  den Ablauf neu starten.
- **kraefte** — Der Kunde will Pflegekräfte / Profile sehen. Wie oben, \`text\` leer.
- **unklar** — Du hast die Nachricht wirklich nicht verstanden. Dann RATE NICHT: stelle in
  \`text\` eine echte, konkrete Rückfrage. „unklar" ist der letzte Ausweg, nicht der erste.

### Regeln zu \`werte\`
- Ausschließlich die oben erlaubten Werte, exakt geschrieben.
- Fast immer genau EIN Wert. Mehrere nur bei den gestuften Feldern (pflegegrad, mobil, nacht,
  deutsch) und nur, wenn der Satz wirklich zwei Situationen nennt („drinnen mit Rollator,
  draußen im Rollstuhl"). Dann sortiert von der leichtesten zur anspruchsvollsten Stufe — der
  Chat schlägt die anspruchsvollere vor, damit die Pflegekraft vorbereitet ist.
- Bei personen, haushalt, fuehrerschein und geschlecht NIE mehrere Werte — entscheide dich.
- Bist du dir bei der Zuordnung nicht sicher, ist \`unklar\` mit einer Rückfrage besser als ein
  falsch gesetzter Wert.

### Regeln zu \`chips\`
Höchstens drei kurze Vorschläge für Antwort-Knöpfe, in der Ich-Form des Kunden. Nur, wenn
gerade KEINE der Fragen offen ist — sonst stören sie. Die Texte „Preis berechnen" und
„Pflegekräfte ansehen" starten die Fragen; alles andere wird als neue Nachricht des
Kunden verschickt. Leer lassen ist völlig in Ordnung.

## Wissen
Alles Folgende ist die einzige Quelle für Fakten. Was hier nicht steht, weißt du nicht.

${PRIA_WISSEN}`;

/* ── Werkzeug ───────────────────────────────────────────────────────
   Erzwungener Tool-Use statt freiem Text: so kommt garantiert eine
   verwertbare Struktur zurück, keine Prosa, die geparst werden müsste. */
export const WERKZEUG = {
  name: 'pria_antwort',
  description: 'Prias Antwort auf die Nachricht des Kunden. Genau einmal pro Nachricht aufrufen.',
  input_schema: {
    type: 'object',
    properties: {
      typ: { type: 'string', enum: TYPEN as unknown as string[] },
      text: { type: 'string',
        description: 'Was Pria sagt. Bei typ=antwort/nachtrag NUR, wenn in derselben Nachricht ' +
          'auch eine echte Frage steckt — dann deren Antwort. Sonst leer.' },
      feld: { type: 'string', enum: [...FELDER, ''],
        description: 'Nur bei typ=antwort/vorschlag/nachtrag: welche der Fragen. Sonst "".' },
      werte: { type: 'array', items: { type: 'string' },
        description: 'Nur bei typ=antwort/nachtrag: erlaubte Werte, leichteste zuerst. Sonst [].' },
      quelle: { type: 'string', description: 'Wird nicht mehr verwendet — immer "".' },
      chips: { type: 'array', items: { type: 'string' },
        description: 'Höchstens drei Vorschläge in der Ich-Form des Kunden. Sonst [].' },
    },
    required: ['typ', 'text', 'feld', 'werte', 'quelle', 'chips'],
  },
};

export type PriaZustand = {
  modus?: string;
  offeneFrage?: string | null;
  schritt?: number;
  antworten?: Record<string, string>;
  // Wie weit der Kunde ist — ohne das bot Pria die Fragen erneut an,
  // obwohl sie laengst beantwortet waren.
  kontaktdatenOffen?: boolean;
  schonUebergeben?: boolean;
};

export type PriaAntwort = {
  typ: Typ; text: string; feld: string; werte: string[]; quelle: string; chips: string[];
};

/** Nur die Auszeichnung durchlassen, die die Sprechblase versteht. Das Modell
 *  ist unseres, aber ungeprüftes innerHTML bleibt ungeprüftes innerHTML. */
export function saeubern(s: unknown): string {
  return String(s ?? '')
    .replace(/<(?!\/?(b|br|i)\b)[^>]*>/gi, '')
    .replace(/<(b|i|br)\b[^>]*>/gi, '<$1>')
    .slice(0, 1400);
}

/** Zustand → knapper Text. Kurz halten: das steht in JEDER Anfrage. */
export function zustandText(z: PriaZustand = {}): string {
  const offen = FLOW.find((f) => f.k === z.offeneFrage);
  const gesetzt = Object.entries(z.antworten || {}).map(([k, v]) => {
    const f = FLOW.find((x) => x.k === k);
    const l = f && (f.o.find((o) => o[0] === v) || [])[1];
    return `${k}=${v}${l ? ` (${l})` : ''}`;
  });
  const alleDa = FLOW.every((f) => (z.antworten || {})[f.k] !== undefined);
  return [
    `Modus: ${z.modus === 'fragen' ? 'die Fragen laufen' : 'freie Beratung'}`,
    offen ? `Offene Frage: ${offen.k} — „${offen.q}"` : 'Offene Frage: keine',
    gesetzt.length ? `Schon notiert: ${gesetzt.join(', ')}` : 'Schon notiert: nichts',
    // Ohne diese Zeilen bot Pria die Fragen noch einmal an, obwohl der
    // Kunde sie laengst beantwortet hatte (Martin, 21.08.).
    z.schonUebergeben ? 'Stand: Kontaktdaten abgeschickt, das Kundenportal ist offen.'
      : z.kontaktdatenOffen ? 'Stand: alle Angaben da, das Kontaktfeld steht im Chat — es fehlen nur noch Name, E-Mail und Telefon.'
      : alleDa ? 'Stand: alle Angaben liegen vor, das Angebot kann berechnet werden.'
      : 'Stand: es fehlen noch Angaben.',
  ].join('\n');
}

/**
 * Rohe Werkzeug-Eingabe des Modells → das, was der Chat umsetzen darf.
 * Alles, was nicht in den FLOW passt, fliegt hier raus: das Modell kann
 * keinen Wert setzen, den es sich ausgedacht hat.
 */
export function pruefen(roh: any): PriaAntwort {
  const typRoh = String(roh?.typ || '');
  const feldRoh = String(roh?.feld || '');
  const f = FLOW.find((x) => x.k === feldRoh);

  let werte: string[] = Array.isArray(roh?.werte) ? roh.werte.map(String) : [];
  werte = f ? werte.filter((v) => f.o.some((o) => o[0] === v)) : [];
  // Bei ungestuften Feldern zählt nur die letzte Nennung — die aktuellste.
  if (werte.length > 1 && !STUFIG.includes(feldRoh)) werte = [werte[werte.length - 1]];

  let typ = (TYPEN as readonly string[]).includes(typRoh) ? (typRoh as Typ) : 'unklar';
  if ((typ === 'antwort' || typ === 'nachtrag') && !werte.length) typ = 'unklar';
  if (typ === 'vorschlag' && !f) typ = 'unklar';

  const chips = Array.isArray(roh?.chips) ? roh.chips : [];
  return {
    typ,
    text: saeubern(typ === 'unklar' && typRoh !== 'unklar'
      ? 'Da bin ich mir nicht sicher, ob ich Sie richtig verstanden habe — sagen Sie es mir bitte noch einmal anders?'
      : roh?.text),
    feld: f ? feldRoh : '',
    werte,
    // Quellenzeile abgeschafft (Martin, 21.08.) — im Gespräch wirkte sie wie ein
    // Beleg-Anhängsel. Das Feld bleibt im Schema, damit das Modell nicht auf ein
    // unbekanntes Feld ausweicht; ausgeliefert wird es nicht.
    quelle: '',
    chips: chips.slice(0, 3).map((c: unknown) => String(c).replace(/[<>]/g, '').slice(0, 60)),
  };
}
