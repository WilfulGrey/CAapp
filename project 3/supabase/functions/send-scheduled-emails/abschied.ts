// Abschied für laufende Kunden nachholen (Registry #168). Aus index.ts herausgelöst, weil index.ts beim Import einen
// Server startet: hier ist die Datenbank-Seite testbar (_tests/abschied.test.ts mit nachgebautem Supabase-Client).
// Die Regel selbst steht in kette.ts (abschiedNachholen), der Aufruf im Gestrichen-Zweig von index.ts.
import { abschiedNachholen, type AbschiedZeile } from "./kette.ts";
import { sendezeitIso } from "./quietHours.ts";

/** So viel von der verfallenden scheduled_emails-Zeile, wie der Nachholer braucht. */
export type VerfallendeZeile = { email_type: string; created_at?: string | null };
/** So viel vom Lead. */
export type AbschiedLead = { id: string; email?: string | null };

/** Nur für eine verfallende nachfass_2-Zeile und nur, wenn der Lead für diese Runde noch keine nachfass_3-Zeile hat.
 *  Anders als scheduleFollowUp (index.ts) bricht er nichts ab, er legt höchstens EINE neue Zeile an (sofort fällig,
 *  Nachtruhe über sendezeitIso). Anker der Runde = created_at der verfallenden Zeile.
 *  Liefert die Sendezeit der neuen Zeile, aber NUR, wenn das Anlegen geklappt hat; sonst null (Prüfung 15.11.: vorher
 *  stand `abschied_eingeplant` im Ereignis, auch wenn der Insert scheiterte). Ohne Adresse am Lead legt er nichts an
 *  (recipient_email ist NOT NULL). Lesefehler: lieber kein Abschied als ein doppelter. */
export async function abschiedNachholenFuer(
  // deno-lint-ignore no-explicit-any
  supabase: any, row: VerfallendeZeile, lead: AbschiedLead, jetzt: Date = new Date(),
): Promise<string | null> {
  if (row.email_type !== "nachfass_2") return null;
  const email = (lead.email ?? "").trim();
  if (!email) {
    console.warn(`[abschied] Lead ${lead.id} ohne E-Mail-Adresse, kein Abschied nachgeholt`);
    return null;
  }
  const { data, error } = await supabase
    .from("scheduled_emails")
    .select("status, created_at, sent_at")
    .eq("lead_id", lead.id)
    .eq("email_type", "nachfass_3");
  if (error) {
    console.warn(`[abschied] nachfass_3 nicht lesbar (lead ${lead.id}): ${error.message ?? error}`);
    return null;
  }
  if (!abschiedNachholen(row.email_type, row.created_at ?? null, (data ?? []) as AbschiedZeile[])) return null;
  const scheduledFor = sendezeitIso(jetzt);
  const { error: insertFehler } = await supabase.from("scheduled_emails").insert({
    lead_id: lead.id,
    email_type: "nachfass_3",
    recipient_email: email,
    scheduled_for: scheduledFor,
    status: "pending",
  });
  if (insertFehler) {
    console.warn(`[abschied] nachfass_3 nicht angelegt (lead ${lead.id}): ${insertFehler.message ?? insertFehler}`);
    return null;
  }
  return scheduledFor;
}
