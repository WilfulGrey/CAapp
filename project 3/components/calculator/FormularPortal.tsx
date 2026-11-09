"use client";

// Rechner „wie das Portal“ (Registry #151, live seit Martins „Super, mach online“ am 09.11.2026; Entwurf ab 08.11.: „Muss viel
// clean wie portal“). Standard für alle; `?look=alt` zeigt den Stand davor (Rückweg und Vergleich). Bausteine nach dem
// Minimal-Einstieg des Kundenportals (src/components/portal/EinstiegMinimal.tsx, MartaBox.tsx, src/lib/kontakt.ts): heller
// Grund, weiße Karten ohne Rahmen, oben Martas Foto mit Titel und Mini-Ablauf, in der Karte nur „Frage X von 8“, Balken und
// die Frage; unten Siegel und Sterne. Letzter Schritt: Erfolgs-Haken am Titel, Kennzahlen am Knopf, „So geht es weiter“ und
// drei Meinungen. Der Rechner kann nicht aus src/ importieren, daher die Werte hier.
import { useEffect, useState } from "react";
import { SterneText } from "@/components/calculator/BewertungsZeile";
import { SCHRANKE } from "@/lib/kraefte-vorschau";
import { STIMMEN_LETZTER_SCHRITT, STIMMEN_PRUEF_LINK } from "@/lib/kundenstimmen";
import { anzahlText, sternFuellung, type SterneStand } from "@/lib/sterne-zeile";

/** Titel über den Fragen wie die Überschrift der Startseite (Registry #146 / PR #824, live H1 seit 02.11.): „Passende
 *  Pflegekräfte sofort finden“ statt „In 2 Minuten zu Ihrem Preis“. */
export const KOPF_FRAGEN = "Passende Pflegekräfte sofort finden";
/** Mini-Ablauf unter dem Titel wie bei pflege-helfer24 („Fragen beantworten. Kostenlose Angebote erhalten.“), Martin 08.11.:
 *  „keinen Ablauf, dass Kontaktdaten abgefragt werden, also Miniablauf, der passt“. Aus seinen Schritten vom 03.11. ohne den
 *  Kontakt-Schritt und ohne Preis. */
// Martins Wortlaut 08.11.: „Fragen beantworten, Kontaktdaten eingeben und dann und sofort Angebot und passende Pflegekräfte
// finden oder sehen“ („sehen“, weil der Titel darüber schon „finden“ sagt).
export const MINI_ABLAUF = "Fragen beantworten, Kontaktdaten eingeben und sofort Angebot und passende Pflegekräfte sehen.";

/** Kontakt-Schritt als Abschluss. Titel: Martin 08.11. „Ihr persönliches Angebot und Personalauswahl ist fertig …
 *  irgendwie sowas“, nur grammatisch angepasst. Satz: ChatGPT-Plan 03.11. („… um Ihre persönliche Auswahl und Ihr
 *  unverbindliches Angebot zu öffnen“) in der Fassung des OpenAI-Gegenchecks 08.11. Knopf: Martins „Angebot & Pflegekräfte
 *  jetzt ansehen“ (06.06.) passend zum Mini-Ablauf; OpenAI 08.11. OK. Ersetzt Frage und Lohnzeile, damit der Knopf auf dem
 *  iPhone SE (553 px) trotz zweizeiligem Titel im ersten Bild bleibt. 09.11. ohne „unverbindliches“: steht direkt unter dem
 *  Knopf („100 % kostenfrei & unverbindlich“, OpenAI: doppelt), und der Satz bleibt auf dem iPhone SE dreizeilig. */
export const KONTAKT_FERTIG = {
  titel: "Ihr persönliches Angebot und Ihre Personalauswahl sind fertig",
  text: "Geben Sie Ihre Kontaktdaten ein. Danach sehen Sie sofort Ihr Angebot und Ihre passende Pflegekräfte-Auswahl.",
  knopf: "Angebot & Pflegekräfte ansehen →",
};

/** Der Rechner im Portal-Look ist Standard (Registry #151); `?look=alt` zeigt den Stand davor. Startwert `true`, damit die
 *  Seite schon im ersten HTML im neuen Look steht und nichts umspringt; nur `?look=alt` schaltet nach dem Laden zurück. */
export function usePortalLook(): boolean {
  const [an, setAn] = useState(true);
  useEffect(() => {
    try { if (new URLSearchParams(window.location.search).get("look") === "alt") setAn(false); } catch { /* ohne Adresse an */ }
  }, []);
  return an;
}

// Farben des Portals (tailwind.config des CAapp, pm-*).
export const PM = {
  grund: "#F2F1EE", ink: "#1C1C1C", body: "#2E2E2E", muted: "#6B6B6B", mute: "#8B8B8B",
  line: "#E5E3DF", lineSoft: "#F0EDE8", chip: "#DDD5C8", coral: "#E76F63", coralTint: "#FDF0EE",
  green: "#3D7A5C", greenDeep: "#2A5C3F", mint: "#E8F5EE", taupe: "#8B7355", whatsapp: "#25D366",
};
/** Schatten der Formularkarte im Portal (`shadow-lift`). */
export const SCHATTEN_LIFT = "0 1px 2px rgba(28,28,28,.04), 0 14px 38px -16px rgba(28,28,28,.18)";

const ERREICHBAR_VON = 8;
const ERREICHBAR_BIS = 20;

/** Wie `istErreichbar` im Portal: Stunde in Berlin, 8:00 bis 19:59. */
export function istErreichbar(jetzt = new Date()): boolean {
  const teil = new Intl.DateTimeFormat("de-DE", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Berlin" })
    .formatToParts(jetzt).find((t) => t.type === "hour");
  const stunde = Number(teil?.value);
  return stunde >= ERREICHBAR_VON && stunde < ERREICHBAR_BIS;
}

function useErreichbar(): boolean {
  // Erst nach dem Laden lesen (Server kennt die Uhrzeit des Besuchers nicht), dann jede Minute.
  const [ja, setJa] = useState(true);
  useEffect(() => {
    setJa(istErreichbar());
    const t = setInterval(() => setJa(istErreichbar()), 60_000);
    return () => clearInterval(t);
  }, []);
  return ja;
}

const KARTE = "rounded-[20px] bg-white";

// Aufbau wie pflege-helfer24 (Martin 08.11.: „Das ist wirklich clean“, danach zum rosa Kopf: „Zu groß der Header … passt
// alles nicht zusammen“): Titel und Mini-Zeile frei über der Karte, in der Karte nur eine schmale Fortschrittszeile, und
// Marta stellt die Frage (ihr Foto neben der Frage), statt einen eigenen Kopf zu bekommen.

/** Freundlicher Erfolgs-Haken (Martin 09.11.: der kleine dunkle Haken in der Zeile „sieht scheiße aus … freundlicher …
 *  von den Abständen … schöner“): grüner Kreis in einem hellen Mint-Hof, der Haken zeichnet sich beim Öffnen einmal. Ohne
 *  Bewegung, wenn das Gerät reduzierte Bewegung wünscht. */
function ErfolgsHaken({ groesse }: { groesse: number }) {
  const innen = Math.round(groesse * 0.64);
  return (
    // Hof in Grün mit wenig Deckkraft statt Mint: Mint verschwand auf dem hellen Seitengrund fast ganz.
    <span className="haken-hof relative flex flex-none items-center justify-center rounded-full" style={{ width: groesse, height: groesse, backgroundColor: "rgba(61,122,92,.13)" }} aria-hidden="true">
      <span className="haken-kreis flex items-center justify-center rounded-full" style={{ width: innen, height: innen, background: `linear-gradient(150deg, #5A9F79, ${PM.green})`, boxShadow: "0 4px 10px -3px rgba(61,122,92,.5)" }}>
        <svg viewBox="0 0 24 24" width={Math.round(innen * 0.58)} height={Math.round(innen * 0.58)} fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path className="haken-strich" d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} />
        </svg>
      </span>
      <style>{`
        .haken-kreis{animation:haken-ein .35s cubic-bezier(.2,.9,.3,1.3) both}
        .haken-strich{stroke-dasharray:1;stroke-dashoffset:1;animation:haken-zug .35s ease-out .2s forwards}
        @keyframes haken-ein{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
        @keyframes haken-zug{to{stroke-dashoffset:0}}
        @media (prefers-reduced-motion:reduce){.haken-kreis{animation:none}.haken-strich{animation:none;stroke-dashoffset:0}}
      `}</style>
    </span>
  );
}

/** Titel über der Karte, zentriert, ohne Farbfläche. `haken` (letzter Schritt): Erfolgs-Haken links neben dem linksbündigen
 *  Titel (Martin 09.11.: „der Haken muss links, das sieht gut aus“; die Form mittig über dem Titel fiel weg). Kostet keine Höhe. */
export function TitelPortal({ titel, unterzeile, haken }: { titel: string; unterzeile?: string; haken?: boolean }) {
  if (haken) {
    // Unter 390 px 18 px Schrift und kleinerer Hof: sonst bricht der Titel neben dem Haken dreizeilig um und der Knopf
    // rückt auf dem iPhone SE an den Rand (gemessen 09.11.: 541 von 553 px).
    return (
      <div className="flex items-center gap-3.5 px-1 pb-3 max-[389px]:gap-3">
        <span className="max-[389px]:hidden"><ErfolgsHaken groesse={46} /></span>
        <span className="hidden max-[389px]:block"><ErfolgsHaken groesse={40} /></span>
        <p className="text-left text-[19px] font-bold leading-[1.25] tracking-[-0.01em] [text-wrap:balance] max-[389px]:text-[18px]" style={{ color: PM.ink }}>{titel}</p>
      </div>
    );
  }
  return (
    <div className="px-2 pb-3 text-center">
      <p className="text-[19px] font-bold leading-[1.25] tracking-[-0.01em] [text-wrap:balance]" style={{ color: PM.ink }}>{titel}</p>
      {unterzeile && <p className="mt-1 text-[14px] leading-5 [text-wrap:balance]" style={{ color: PM.muted }}>{unterzeile}</p>}
    </div>
  );
}

/** Einleitung über der Karte (Martin 08.11.: „eine Einleitung braucht es mit Marta, unauffälliger, mit Info, was man machen
 *  muss, und dann Fokus auf Fragen“): Martas Foto mit Erreichbarkeits-Punkt, daneben klein Name und Rolle (MartaBox), der Titel
 *  und die Mini-Zeile. Ohne Kasten und Farbfläche. Regeln (Recherche 08.11.): Marta nie als Absenderin der Fragen (Pria-Regel,
 *  daher keine Ich-Sätze und kein Foto an der Frage), nie direkt neben Fotos von Pflegekräften („wirkt wie Pflegekraft“). */
export function EinleitungPortal({ titel, text }: { titel: string; text: string }) {
  const erreichbar = useErreichbar();
  return (
    // Foto als Rechteck über die Höhe des Textes, der Name auf dem Bild (Martin 08.11.: „das Bild von ihr rechteckig über die
    // Höhe des Textes … und dann den Namen auf das Bild drauf“; der Name unter einem runden Foto biss sich mit dem Text rechts).
    <div className="flex items-stretch gap-3 px-1 pb-3">
      {/* 72 px breit: bei 76 px brach der Titel auf dem iPhone SE um und der Name lief an den Rand (gemessen 08.11.). */}
      <div className="relative w-[72px] min-h-[72px] flex-none overflow-hidden rounded-[12px]" style={{ boxShadow: `0 0 0 1px ${PM.line}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {/* Ohne Namen und ohne dunklen Verlauf (Martin 08.11.: „ohne Namen machen, das mit dem Dunklen sieht … aus“). */}
        <img src="/images/marta-kapcio.jpg" alt="Marta Kapcio" className="absolute inset-0 h-full w-full object-cover object-[50%_15%]" />
        <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white" style={{ backgroundColor: erreichbar ? PM.green : PM.mute }} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1 self-center leading-[1.35]">
        <p className="text-[15px] font-semibold tracking-[-0.01em] max-[389px]:text-[14.5px]" style={{ color: PM.ink }}>{titel}</p>
        <p className="text-[13.5px]" style={{ color: PM.muted }}>{text}</p>
      </div>
    </div>
  );
}

/** Schmale Zeile oben in der Karte: „Frage X von 8“ (im letzten Schritt „Kontaktdaten“), daneben der dünne Balken, rechts
 *  „Zurück“ ab Frage 2. Danach nur noch die Frage. OpenAI-Prüfung 08.11.: „Schritt 1 von 9“ wirkt am Handy lang. */
export function FortschrittPortal({ schritt, gesamt, onZurueck }: { schritt: number; gesamt: number; onZurueck?: () => void }) {
  const zeile = schritt < gesamt ? `Frage ${schritt} von ${gesamt - 1}` : "Kontaktdaten";
  return (
    <div className="flex min-h-[44px] items-center gap-3 px-4 pt-2">
      <p className="flex-none text-[12.5px] font-medium" style={{ color: PM.muted }}>{zeile}</p>
      <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: PM.line }}>
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${(schritt / gesamt) * 100}%`, backgroundColor: PM.coral }} />
      </div>
      {onZurueck && <ZurueckKnopf onClick={onZurueck} />}
    </div>
  );
}

function ZurueckKnopf({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="-my-2 flex-none py-2 text-[13.5px] font-medium underline underline-offset-4"
      style={{ color: PM.muted, textDecorationColor: PM.line }}>
      Zurück
    </button>
  );
}

/** Kopfleiste über der Karte: Logo links, Schließen rechts (wie die Navigationsleiste im Portal). */
export function KopfleistePortal({ onSchliessen }: { onSchliessen?: () => void }) {
  return (
    // Schmal gehalten: im Kontakt-Schritt muss der Knopf auf dem iPhone SE (553 px) über der Falz bleiben.
    <div className="flex items-center justify-between px-1 pb-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/primundus-logo-transparent.png" alt="Primundus" className="h-[22px] w-auto" />
      {onSchliessen && (
        <button type="button" onClick={onSchliessen} aria-label="Schließen"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white"
          style={{ color: PM.muted, boxShadow: `0 0 0 1px ${PM.line}` }}>
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      )}
    </div>
  );
}

/** Antwortknopf wie die Zeilen im Portal. Auswahl in Taupe (Rechner-Regel 11.09.: Braun = Ihre Auswahl). */
export const antwortPortal = (gewaehlt: boolean) =>
  `group w-full relative rounded-[14px] px-4 py-3.5 border-[1.5px] transition-colors duration-200 text-left ${
    gewaehlt
      ? "ist-gewaehlt border-[#8B7355] bg-[#8B7355]/[0.06] ring-2 ring-[#8B7355]/20"
      : "border-[#DDD5C8] bg-white [@media(hover:hover)]:hover:border-[#A8977F]"
  }`;

/** Unten wie bei pflege-helfer24 nur Siegel und Sterne (Martin 08.11.: „Das ist wirklich clean. Und bei uns dann unten
 *  Siegel und Sterne“). Zwei getrennte Spalten mit Trennlinie, nie Sterne im Block des Testsiegers (Martin zu Fassung 20 und
 *  08.11.: „nicht die Sterne einfach bei den Testsieger reinpacken“). Ohne Bewertungsstand nur das Siegel. */
export function SiegelSternePortal({ bewertung }: { bewertung: SterneStand | null }) {
  return (
    <div className="mt-4 flex items-center justify-center gap-4 pb-2">
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/primundus_testsieger-2021.webp" alt="Testsieger DIE WELT" className="h-12 w-auto rounded-[4px] object-contain" />
        <p className="leading-[1.25]">
          <b className="block text-[14px]" style={{ color: PM.ink }}>6× Testsieger</b>
          <span className="text-[12.5px] font-bold" style={{ color: PM.taupe }}>DIE WELT</span>
        </p>
      </div>
      {bewertung && (
        <div className="border-l pl-4 leading-[1.25]" style={{ borderColor: PM.line }}>
          <p className="whitespace-nowrap text-[14px] font-bold" style={{ color: PM.ink }}>
            {bewertung.schnitt} <span className="text-[12px] tracking-[1px]" style={{ color: "#D4A843" }} aria-hidden="true">★★★★★</span>
          </p>
          <p className="text-[12.5px]" style={{ color: PM.muted }}>{bewertung.anzahl} Bewertungen</p>
        </div>
      )}
    </div>
  );
}

/** Unter dem Formular: Siegel und Sterne (Marta-Platz folgt aus der Recherche „Marta als zentrale Person“). */
export function UnterDemFormularPortal({ bewertung }: { bewertung: SterneStand | null }) {
  return <SiegelSternePortal bewertung={bewertung} />;
}

// ── Letzter Schritt: Vertrauen unter dem Knopf (Mockup 09.11.) ─────────────────────────────────────────────────────────────
// Martin 09.11. nach vier Fassungen: „das mit dem Stern, 20 Jahre Erfahrung, 6 Mal in Folge Testsieger, 100 % kostenfrei &
// unverbindlich … und dann darunter vielleicht einfach die Meinungen der Kunden. Und vielleicht darunter noch den Ablauf.“
// Danach: Siegel raus, unter der Karte „So geht es weiter“ mit Martins Inhalten, dann die Meinungen. Kennzahlen wie die
// Angebotskarte im Portal (src/components/portal/EinstiegMinimal.tsx, VERTRAUEN), Ablauf in der Form des Portals
// (AblaufMinimal), Meinungen wörtlich von primundus.de/erfahrungen; der Rechner kann nicht aus src/ importieren.

/** „100 % kostenfrei & unverbindlich“ direkt unter dem Knopf (Martin 09.11.), Wortlaut des Rechners (SCHRANKE.fussnote). */
export function KostenfreiZeile() {
  return (
    <p className="flex items-center justify-center gap-1.5 text-[14px] font-semibold" style={{ color: PM.greenDeep }}>
      <svg className="h-4 w-4 flex-none" viewBox="0 0 24 24" fill="none" stroke={PM.green} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      {SCHRANKE.fussnote}
    </p>
  );
}

const STERN = "M10 1.6l2.47 5.2 5.7.72-4.2 3.93 1.08 5.64L10 14.3l-5.05 2.79 1.08-5.64-4.2-3.93 5.7-.72z";
/** Fünf Sterne, anteilig gefüllt wie im Portal (FuenfSterne). */
function FuenfSterne({ wert, groesse = 12 }: { wert: number; groesse?: number }) {
  return (
    <span className="inline-flex gap-px" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => {
        const fuellung = sternFuellung(wert, i);
        return (
          <svg key={i} viewBox="0 0 20 20" width={groesse} height={groesse} className="flex-none">
            <path d={STERN} fill={PM.line} />
            {fuellung > 0 && <path d={STERN} fill="#D4A843" style={fuellung < 1 ? { clipPath: `inset(0 ${Math.round((1 - fuellung) * 100)}% 0 0)` } : undefined} />}
          </svg>
        );
      })}
    </span>
  );
}

/** Kennzahlen wie unten in der Angebotskarte des Portals: Sterne (ohne Stand fehlt die Spalte), 20 Jahre, 6× in Folge. */
function KennzahlenZeile({ bewertung }: { bewertung: SterneStand | null }) {
  return (
    <dl className="flex justify-between gap-3">
      {bewertung && (
        <div className="min-w-0">
          <dt className="sr-only">Bewertungen</dt>
          <dd className="flex items-center gap-1.5 text-[15px] font-bold leading-5" style={{ color: PM.ink }}>
            {bewertung.schnitt}
            <FuenfSterne wert={bewertung.wert} />
          </dd>
          <dd className="text-[12px] leading-4" style={{ color: PM.muted }}>{anzahlText(bewertung.anzahl)}</dd>
        </div>
      )}
      {([["20 Jahre", "Erfahrung"], ["6× in Folge", "Testsieger"]] as const).map(([wert, wort]) => (
        <div key={wert} className="min-w-0">
          <dt className="sr-only">{wort}</dt>
          <dd className="text-[15px] font-bold leading-5" style={{ color: PM.ink }}>{wert}</dd>
          <dd className="text-[12px] leading-4" style={{ color: PM.muted }}>{wort}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Drei Meinungen wörtlich von primundus.de/erfahrungen (Auswahl 09.11.2026: je eine Sorge kurz vor den Kontaktdaten,
 *  was passiert danach, wer kommt, mit wem entscheide ich; keine mit „Vermittlung“, Rückruf oder Problemen). Die Liste
 *  liegt seit Registry #153 mit den Stimmen der Startseite in lib/kundenstimmen.ts (eine Quelle für den Rechner). */
export const MEINUNGEN = STIMMEN_LETZTER_SCHRITT;

function Meinungen({ bewertung }: { bewertung: SterneStand | null }) {
  if (MEINUNGEN.length === 0) return null;
  return (
    <section className={`${KARTE} px-4 pt-3.5 pb-3`} aria-labelledby="meinungen-titel">
      {/* Überschrift wie das Bewertungsband auf primundus.de (BewertungsAuszug, live seit 17.09.), gleiche Form wie „So geht es
          weiter“ darunter. */}
      <h2 id="meinungen-titel" className="mb-2.5 text-[16px] font-semibold leading-6" style={{ color: PM.ink }}>Erfahrungen von Familien</h2>
      <ul className="divide-y" style={{ borderColor: PM.lineSoft }}>
        {MEINUNGEN.map((m) => (
          <li key={m.id} className="py-2.5 first:pt-0 last:pb-0" style={{ borderColor: PM.lineSoft }}>
            <FuenfSterne wert={m.sterne} />
            <p className="mt-1 text-[14.5px] leading-[1.45]" style={{ color: PM.body }}>„{m.text}“</p>
            <p className="mt-1 text-[12.5px]" style={{ color: PM.muted }}>{m.name}, {m.ort} · {m.datum}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t pt-2.5 text-[12.5px]" style={{ color: PM.muted, borderColor: PM.lineSoft }}>
        {bewertung && <>Auswahl aus {anzahlText(bewertung.anzahl)} auf primundus.de · </>}
        <a href={STIMMEN_PRUEF_LINK} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: PM.taupe }}>So prüfen wir Bewertungen</a>
      </p>
    </section>
  );
}

/** Ablauf nach dem Absenden (Martin 09.11.): Schritt 1 und 2 sagen alles in der Überschrift („passt doch in die Überschrift,
 *  da brauchst du nichts anderes“), Schritt 2 mit „auf Wunsch“ darunter. Die Zeilen unter 2 und 3 nach OpenAI 09.11.; Schritt 3
 *  statt „dann wird es verbindlich. Bis dahin bleibt alles unverbindlich“ („hört sich … an“) mit der freigegebenen Aussage
 *  „Vertrag erst nach Auswahl“ (Anzeigen 03.11.) und „Anreise schon ab 3 Tagen möglich“ wie im Portal. */
export const ABLAUF_NACH_ABSENDEN: readonly { titel: string; text?: string }[] = [
  { titel: "Angebot und passende Pflegekräfte sofort sehen, inklusive aller Zuschüsse" },
  { titel: "Bewerbungen innerhalb von 60\u00a0Minuten erhalten", text: "Auf Wunsch: Pflegesituation kurz beschreiben, dann bewerben sich passende Pflegekräfte bei Ihnen." },
  { titel: "Auswählen und starten", text: "Sie wählen in Ruhe aus, erst danach schließen Sie den Vertrag. Wir übernehmen den Rest, Anreise schon ab 3\u00a0Tagen möglich." },
];

/** „So geht es weiter“ wie im Portal (AblaufMinimal): weiße Karte, Punkte auf einer senkrechten Linie, der nächste Schritt
 *  in Koralle-hell. Nicht antippbar. */
function AblaufNachAbsenden() {
  return (
    <section className={`${KARTE} px-4 pt-3.5 pb-2`} aria-labelledby="ablauf-schluss-titel">
      <h2 id="ablauf-schluss-titel" className="text-[16px] font-semibold leading-6" style={{ color: PM.ink }}>So geht es weiter</h2>
      <ol className="mt-2">
        {ABLAUF_NACH_ABSENDEN.map((schritt, i) => {
          const naechster = i === 0;
          const letzter = i === ABLAUF_NACH_ABSENDEN.length - 1;
          return (
            <li key={schritt.titel} className="relative flex gap-3 pb-3">
              {!letzter && <span className="absolute left-[13px] top-8 bottom-0 w-px" style={{ backgroundColor: PM.line }} aria-hidden="true" />}
              <span className="relative z-[1] mt-1 flex h-[27px] w-[27px] flex-none items-center justify-center rounded-full text-[13px] font-bold"
                style={naechster ? { backgroundColor: PM.coral, color: "#fff" } : { border: `1px solid ${PM.line}`, backgroundColor: "#fff", color: PM.muted }}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 rounded-[12px] px-3 py-2" style={naechster ? { backgroundColor: PM.coralTint } : undefined}>
                <p className="text-[15px] font-semibold leading-5" style={{ color: PM.ink }}>{schritt.titel}</p>
                {schritt.text && <p className="mt-0.5 text-[13.5px] leading-[1.45]" style={{ color: PM.muted }}>{schritt.text}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** In der Karte direkt unter dem Knopf: „100 % kostenfrei & unverbindlich“ (Martin 09.11.), darunter die Kennzahlen des
 *  Portals (Sterne, 20 Jahre, 6× in Folge). So stehen die Sterne am Knopf (Registry #121: Knopf und Sterne als ein Paket). */
export function UnterDemKnopfPortal({ bewertung }: { bewertung: SterneStand | null }) {
  return (
    <>
      <KostenfreiZeile />
      <div className="my-1 w-full border-y py-2.5" style={{ borderColor: PM.lineSoft }}><KennzahlenZeile bewertung={bewertung} /></div>
    </>
  );
}

/** Unter der Karte im letzten Schritt (Martin 09.11.: „Dann kommt kein Siegel mehr, sondern so geht es weiter“): erst der
 *  Ablauf (was nach dem Absenden passiert, OpenAI 09.11.: näher am Formular wirksamer als die Meinungen), dann die Meinungen. */
export function UnterDemKontaktPortal({ bewertung }: { bewertung: SterneStand | null }) {
  return (
    <div className="mt-3 grid gap-3">
      <AblaufNachAbsenden />
      <Meinungen bewertung={bewertung} />
    </div>
  );
}
