/**
 * Erzeugt templates.gen.ts aus den Vorschau-Mails in mail-templates/.
 *
 *   cd "project 3/supabase/functions/send-partner-akquise"
 *   deno run --allow-read --allow-write gen-templates.ts
 *
 * Die Vorschau-Dateien zeigen Beispieldaten („Herr Becker“, relative Bilder,
 * interne Notizen als HTML-Kommentar). Hier werden daraus versandfertige
 * Vorlagen: Kommentare raus, Bilder absolut auf kostenrechner.primundus.de,
 * Anrede/Preheader/Abmeldelink als Platzhalter. Nach jeder Änderung an
 * mail-templates/19, 21, 22, 23 neu erzeugen und mit committen.
 */

const QUELLE = new URL("../../../../mail-templates/", import.meta.url);
const BILDER = "https://kostenrechner.primundus.de/images/partner-mail/";
const FRAGEBOGEN_POSTFACH = "partner@primundus.de";

const DATEIEN = {
  haupt: "19-partner-akquise",
  nf1: "21-partner-nachfass-1",
  nf2: "22-partner-nachfass-2",
  nf3: "23-partner-nachfass-3",
} as const;

function genau(s: string, suche: string | RegExp, ersatz: string, name: string, anzahl = 1): string {
  const treffer = typeof suche === "string" ? s.split(suche).length - 1 : (s.match(new RegExp(suche, "g")) ?? []).length;
  if (treffer !== anzahl) throw new Error(`${name}: ${String(suche)} ${treffer}× gefunden, erwartet ${anzahl}×`);
  return typeof suche === "string" ? s.replaceAll(suche, ersatz) : s.replace(new RegExp(suche, "g"), ersatz);
}

function html(key: string, s: string): string {
  s = s.replace(/<!--(?!\[if)[\s\S]*?-->\n?/g, "");
  s = s.replaceAll('src="img/partner/', `src="${BILDER}`);
  s = genau(s, "Guten Tag Herr Becker,", "{{ANREDE_ZEILE}}", key);
  s = genau(s, /(<div style="display:none;[^"]*">)[^<&]+(&nbsp;&#847;)/, "$1{{PREHEADER}}$2", key);
  s = s.replaceAll("{{KONTAKT_EMAIL}}", FRAGEBOGEN_POSTFACH);
  if (key === "haupt") {
    s = genau(s, /utm_campaign=partner-akquise(?!&amp;utm_content)/, "utm_campaign=partner-akquise&amp;utm_content={{UTM_CONTENT}}", key, 2);
  }
  for (const verboten of ["Herr Becker", 'src="img/', "<!--"]) {
    if (s.includes(verboten)) throw new Error(`${key}: „${verboten}“ ist noch drin`);
  }
  if (!s.includes("{{ABMELDE_LINK}}")) throw new Error(`${key}: Abmeldelink fehlt`);
  return s;
}

function text(key: string, s: string): string {
  const zeilen = s.replace(/\r\n/g, "\n").split("\n");
  const trenner = zeilen.findIndex((z) => /^-{10,}$/.test(z.trim()));
  if (trenner < 0) throw new Error(`${key}.txt: Trennlinie nach dem Kopf fehlt`);
  s = zeilen.slice(trenner + 1).join("\n").replace(/^\n+/, "");
  s = genau(s, "Guten Tag Herr Becker,", "{{ANREDE_ZEILE}}", key + ".txt");
  s = s.replaceAll("{{KONTAKT_EMAIL}}", FRAGEBOGEN_POSTFACH);
  if (key === "haupt") {
    s = genau(s, /utm_campaign=partner-akquise(?!&utm_content)/, "utm_campaign=partner-akquise&utm_content={{UTM_CONTENT}}", key + ".txt", 2);
  }
  if (!s.includes("{{ABMELDE_LINK}}")) throw new Error(`${key}.txt: Abmeldelink fehlt`);
  return s;
}

const out: Record<string, { html: string; text: string }> = {};
for (const [key, datei] of Object.entries(DATEIEN)) {
  out[key] = {
    html: html(key, await Deno.readTextFile(new URL(`${datei}.html`, QUELLE))),
    text: text(key, await Deno.readTextFile(new URL(`${datei}.txt`, QUELLE))),
  };
}

const kopf = "// ERZEUGT von gen-templates.ts aus mail-templates/ — nicht von Hand ändern.\n";
await Deno.writeTextFile(
  new URL("./templates.gen.ts", import.meta.url),
  `${kopf}export const TEMPLATES: Record<"haupt" | "nf1" | "nf2" | "nf3", { html: string; text: string }> = ${JSON.stringify(out, null, 2)};\n`,
);
console.log("templates.gen.ts geschrieben:", Object.keys(out).join(", "));
