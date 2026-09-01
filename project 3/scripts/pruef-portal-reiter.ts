/* Prueft die Reiter-Logik der Admin-Lead-Liste (app/admin/leads/page.tsx).
 *
 * Der Kern: jedes Portal hat seinen Reiter, AUCH ohne Leads. Ein leerer
 * Reiter mit "0" beantwortet "kommt da eigentlich was an?" — ein
 * fehlender Reiter laesst offen, ob nichts ankam oder der Abholer steht.
 *
 * Dieses Projekt hat keinen Testrunner; das Skript laeuft eigenstaendig:
 *
 *   deno run --allow-read --no-check scripts/pruef-portal-reiter.ts
 */
import { PORTAL_QUELLEN, istEingekauft, quellenName } from "../lib/portal-lead.ts";

/* Dieselbe Ableitung wie in der Seite. Aendert sie sich dort, muss sie
 * hier mitgehen — sonst prueft dieses Skript etwas anderes als das, was
 * im Admin laeuft. */
function reiterFuer(leads: Array<{ source?: string | null }>) {
  const quellen = Array.from(
    new Set([
      ...PORTAL_QUELLEN,
      ...leads.map((l) => l.source).filter((s) => istEingekauft(s)),
    ]),
  ).sort();
  const zaehle = (p: (l: { source?: string | null }) => boolean) => leads.filter(p).length;
  return [
    { key: "all", label: "Alle", anzahl: leads.length },
    { key: "eigene", label: "Eigene Anfragen", anzahl: zaehle((l) => !istEingekauft(l.source)) },
    ...quellen.map((q) => ({ key: q, label: quellenName(q), anzahl: zaehle((l) => l.source === q) })),
  ];
}

let fehler = 0;
const pruefe = (was: string, ist: unknown, soll: unknown) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`${ok ? "ok  " : "FEHL"} ${was}${ok ? "" : `\n     ist ${JSON.stringify(ist)}\n     soll ${JSON.stringify(soll)}`}`);
};

// 1) Leere Datenbank: die Portal-Reiter stehen trotzdem da.
const leer = reiterFuer([]);
pruefe("leere DB: alle Reiter sichtbar", leer.map((r) => r.label),
  ["Alle", "Eigene Anfragen", "Pflegebund.eu", "Pflegehilfe.org"]);
pruefe("leere DB: alle Zaehler 0", leer.map((r) => r.anzahl), [0, 0, 0, 0]);

// 2) Nur eigene Leads: Portal-Reiter bleiben sichtbar, aber leer.
const eigene = reiterFuer([{ source: "rechner" }, { source: "pria-chat" }]);
pruefe("eigene Leads zaehlen unter 'Eigene Anfragen'",
  eigene.find((r) => r.key === "eigene")?.anzahl, 2);
pruefe("Portal-Reiter trotzdem da, mit 0",
  eigene.filter((r) => r.key.startsWith("portal:")).map((r) => r.anzahl), [0, 0]);

// 3) Gemischt: jeder Lead zaehlt genau einmal.
const gemischt = reiterFuer([
  { source: "rechner" },
  { source: "portal:pflegehilfe.org" },
  { source: "portal:pflegehilfe.org" },
]);
pruefe("gemischt: Pflegehilfe 2", gemischt.find((r) => r.key === "portal:pflegehilfe.org")?.anzahl, 2);
pruefe("gemischt: eigene 1", gemischt.find((r) => r.key === "eigene")?.anzahl, 1);
pruefe("gemischt: Summe = Alle",
  gemischt.filter((r) => r.key !== "all").reduce((s, r) => s + r.anzahl, 0),
  gemischt.find((r) => r.key === "all")?.anzahl);

// 4) Ein Lead aus einem Portal, das nicht mehr in der Liste steht, darf
//    nicht unsichtbar unter "Alle" verschwinden.
const altes = reiterFuer([{ source: "portal:altes-portal.de" }]);
pruefe("entferntes Portal bekommt seinen Reiter",
  altes.some((r) => r.key === "portal:altes-portal.de" && r.anzahl === 1), true);

// 5) Leads ohne source gelten als eigene (Altbestand vor der Quellenspalte).
const ohne = reiterFuer([{ source: null }, {}]);
pruefe("ohne source = eigene Anfrage", ohne.find((r) => r.key === "eigene")?.anzahl, 2);

console.log(fehler === 0 ? "\nALLES GRUEN" : `\n${fehler} FEHLER`);
if (fehler) Deno.exit(1);
