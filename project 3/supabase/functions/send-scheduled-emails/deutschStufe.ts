// Deutsch-Stufe für die Pflegekraft-Kachel in den Nachfassmails.
//
// QUELLE DER WAHRHEIT ist `germany_skill` (level_0…level_4) aus mamamia —
// NICHT ein bereits abgeleiteter Anzeigetext. Das Kundenportal macht es
// genauso: `mapCaregiverToNurse` legt aus germany_skill BEIDES ab, den
// Rohwert (`language.bucket`) und das Wort (`language.level`), siehe
// src/lib/mamamia/mappers.ts (GERMANY_SKILL_LEVELS / germanySkillBucket).
// Das SA-Portal leitet ebenfalls aus germany_skill ab (NurseRow.vue), zeigt
// intern aber CEFR — dort sitzt die Agentur, hier der Kunde.
//
// Warum diese Kopie existiert: Edge Functions können nicht aus `lib/` oder
// `src/` importieren (CI kopiert nur den functions-Ordner). Gleiche Lage wie
// `names.ts` und `appendJobParam` — Änderungen an der Skala müssen mit
// src/lib/mamamia/mappers.ts und detect-caregiver-events synchron gehalten
// werden.
//
// ANLASS (Martin, 19.08.2026): In einer Nachfassmail stand „Deutsch A2-B1"
// statt „Deutsch Mittel". Erste Korrektur war falsch gedacht — sie bildete
// den CEFR-TEXT rückwärts auf das Wort ab und erfand damit eine vierte
// Definition derselben Skala. Richtig ist, den Rohwert mitzuführen.
const STUFE_AUS_GERMANY_SKILL: Record<string, string> = {
  level_0: "Grund",
  level_1: "Grund",
  level_2: "Mittel",
  level_3: "Gut",
  level_4: "Gut",
};

// Das Portal liefert nicht den mamamia-Rohwert, sondern seinen eigenen
// 3-Stufen-Bucket (`language.bucket` — "Single Source of Truth für Filter und
// Aufpreis-Berechnung", src/types.ts). Beides sind Systemwerte mit fester
// Bedeutung, deshalb versteht der Helfer beide Formen.
const STUFE_AUS_BUCKET: Record<string, string> = {
  grund: "Grund",
  mittel: "Mittel",
  gut: "Gut",
};

const GUELTIGE_WOERTER = new Set(["Grund", "Mittel", "Gut"]);

/**
 * Beschriftung aus Rohwert + mitgeliefertem Wort.
 *
 * @param germanySkill Rohwert — `level_0`…`level_4` (mamamia, via Detektor)
 *                     oder `grund`/`mittel`/`gut` (Portal-Bucket). Hat Vorrang.
 * @param wort         Vom Erzeuger mitgeschicktes Wort — Rückfall, wenn kein
 *                     Rohwert da ist (Altbestand in der Warteschlange).
 *
 * Ist beides unbrauchbar, kommt `null` zurück und die Zeile entfällt. Ein
 * unbekannter Wert wird NIE roh ausgegeben (Święta zasada 1) und NIE geraten.
 */
export function deutschStufe(
  germanySkill: string | null | undefined,
  wort?: string | null,
): string | null {
  const roh = (germanySkill ?? "").trim();
  if (STUFE_AUS_GERMANY_SKILL[roh]) return STUFE_AUS_GERMANY_SKILL[roh];
  if (STUFE_AUS_BUCKET[roh.toLowerCase()]) return STUFE_AUS_BUCKET[roh.toLowerCase()];
  const w = (wort ?? "").trim();
  return GUELTIGE_WOERTER.has(w) ? w : null;
}
