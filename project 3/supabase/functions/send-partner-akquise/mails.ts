/**
 * Betreff, Vorschautext und Personalisierung der Partner-Akquise-Mails.
 * Die HTML-/Text-Vorlagen kommen aus templates.gen.ts (erzeugt aus
 * mail-templates/19, 21, 22, 23 per gen-templates.ts).
 */
import type { MailKey } from "./plan.ts";
import { TEMPLATES } from "./templates.gen.ts";

export type Variante = "A" | "B";

/** A/B nur bei der Hauptmail (A = Kunden, B = Anfragen). Nachfassmails gleich. */
const KOPF: Record<MailKey, Record<Variante, { betreff: string; preheader: string }>> = {
  haupt: {
    A: {
      betreff: "Pflegekräfte für Ihre offenen Kunden",
      preheader: "Bewerbungen direkt in Ihrem Partnerbereich. Täglich kündbar, taggenau abgerechnet.",
    },
    B: {
      betreff: "Ihr Interessent sieht sofort passende Pflegekräfte",
      preheader: "Neue Anfragen laufen direkt in Ihr Kundenportal, mit Ihrem Logo.",
    },
  },
  nf1: gleich("Passende Pflegekräfte für Ihren nächsten Kunden",
    "Kunde per Text oder PDF anlegen, den Rest übernimmt Primundus."),
  nf2: gleich("Bevor Ihr Interessent beim nächsten Vermittler anfragt",
    "Zeigen Sie Kosten und passende Pflegekräfte, während das Interesse noch da ist."),
  nf3: gleich("Probieren Sie Primundus mit einem Kunden aus",
    "Täglich kündbar, taggenau abgerechnet. Für Ihren ersten Kunden machen wir Ihnen Vorschläge, auch ohne Anmeldung."),
};

function gleich(betreff: string, preheader: string) {
  return { A: { betreff, preheader }, B: { betreff, preheader } };
}

/** Anrede nach Hausregel: Herr/Frau + Nachname, sonst „Guten Tag,“. Nie aus dem Vornamen raten. */
export function anredeZeile(anrede?: string | null, nachname?: string | null): string {
  const a = (anrede ?? "").trim();
  const n = (nachname ?? "").trim().replace(/\s+/g, " ");
  if ((a === "Herr" || a === "Frau") && n) return `Guten Tag ${a} ${n},`;
  return "Guten Tag,";
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export interface Empfaenger {
  anrede?: string | null;
  nachname?: string | null;
  variante: Variante;
}

export interface FertigeMail {
  betreff: string;
  html: string;
  text: string;
}

export function renderMail(mail: MailKey, e: Empfaenger, abmeldeLink: string): FertigeMail {
  const kopf = KOPF[mail][e.variante];
  const anrede = anredeZeile(e.anrede, e.nachname);
  const utm = mail === "haupt" ? `haupt-${e.variante.toLowerCase()}` : mail;
  const tpl = TEMPLATES[mail];
  const html = tpl.html
    .replaceAll("{{ANREDE_ZEILE}}", escapeHtml(anrede))
    .replaceAll("{{PREHEADER}}", escapeHtml(kopf.preheader))
    .replaceAll("{{UTM_CONTENT}}", utm)
    .replaceAll("{{ABMELDE_LINK}}", escapeHtml(abmeldeLink));
  const text = tpl.text
    .replaceAll("{{ANREDE_ZEILE}}", anrede)
    .replaceAll("{{UTM_CONTENT}}", utm)
    .replaceAll("{{ABMELDE_LINK}}", abmeldeLink);
  // Sicherheitsnetz: eine Mail mit offenem Platzhalter geht nie raus.
  for (const [teil, s] of [["html", html], ["text", text]] as const) {
    const rest = s.match(/\{\{[A-Z_]+\}\}/);
    if (rest) throw new Error(`Platzhalter ${rest[0]} im ${teil} von ${mail} nicht ersetzt`);
  }
  return { betreff: kopf.betreff, html, text };
}
