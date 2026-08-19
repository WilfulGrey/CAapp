// Deutsch-Stufe aus der Warteschlange auf die 3 Kundenwoerter heben.
//
// WARUM beim RENDERN und nicht nur beim Erzeuger: `scheduled_emails.metadata`
// ist ein SCHNAPPSCHUSS vom Einreihen — dieselbe Klasse wie Registry-Bug #34
// (recipient_email). Der Detektor schrieb bis #470 CEFR-Kuerzel ("A2-B1"),
// und #470 lag tagelang un-deployt, weil ein Merge Edge Functions NICHT auf
// Prod bringt. Folge: am 19.08. gingen Nachfassmails mit "Deutsch A2-B1"
// raus, obwohl der Code laengst "Mittel" sagte (Meldung Martin mit Screenshot).
//
// Der Erzeuger ist inzwischen deployt, aber wartende Zeilen tragen ihren
// alten Wert bis zum Versand mit sich. Regel wie bei #34: der Schnappschuss
// ist Bequemlichkeit und Rueckfall, nie die Wahrheit.
//
// Unbekannter Wert => null, die Zeile entfaellt. Bewusst NICHT roh ausgeben:
// lieber keine Angabe als eine, die der Kunde nicht einordnen kann.
const CEFR_ZU_STUFE: Record<string, string> = {
  "A1": "Grund",
  "A1-A2": "Grund",
  "A2-B1": "Mittel",
  "B1-B2": "Gut",
  "B2-C1": "Gut",
};

export function deutschStufe(wert: string | null | undefined): string | null {
  if (!wert) return null;
  const t = wert.trim();
  if (t === "Grund" || t === "Mittel" || t === "Gut") return t;
  return CEFR_ZU_STUFE[t] ?? null;
}

