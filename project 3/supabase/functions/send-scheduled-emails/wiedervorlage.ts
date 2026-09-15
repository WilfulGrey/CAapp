// Persönliche Nachfrage zum Wunschtermin (Registry #72): Der Kunde hat in der
// Abschiedsmail „Aktuell nicht" geklickt und auf /rueckmeldung „in 2 Wochen /
// 1 Monat / 3 Monaten" gewählt (oder bei „Familie" / „Pflegeheim" 3 Monate).
// Pure Texte, separat wegen Testbarkeit; Rahmen, Knopf und Signatur baut index.ts.
// Wortlaut nur mit Martins ausdrücklicher Freigabe ändern (Kundenmail-Grundsätze).

export const WIEDERVORLAGE_BETREFF = "Wie gewünscht: Wir melden uns wieder";

/** „Vor einem Monat haben Sie uns gebeten …" — seit kommt aus der Einplanung (metadata.seit). */
export function wiedervorlageEinstieg(seit: string | null | undefined): string {
  const s = (seit ?? "").trim() || "vor einiger Zeit";
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} haben Sie uns gebeten, uns heute wieder zu melden. Ist die Betreuung zu Hause jetzt ein Thema?`;
}

export const WIEDERVORLAGE_KERN =
  "Ihr Angebot ist gespeichert. Welche Pflegekräfte frei sind, ändert sich laufend. Im Kundenportal sehen Sie, wer jetzt zu Ihnen passt. Ein Vertrag entsteht erst, wenn Sie wirklich jemanden gefunden haben.";

export const WIEDERVORLAGE_KNOPF = "Pflegekräfte ansehen";

export const WIEDERVORLAGE_SPAETER = "Passt es noch nicht? Dann sagen Sie uns, wann wir uns wieder melden sollen:";
export const WIEDERVORLAGE_SPAETER_LINK = "Neuen Termin wählen";
