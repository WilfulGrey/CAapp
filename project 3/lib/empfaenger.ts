// Empfänger einer Kundenmail: Hauptadresse + optionale Kopie.
//
// leads.email ist die Identität des Leads und der eine Pflicht-Empfänger.
// leads.email_cc ist eine ZWEITE Adresse, an die jede Kundenmail als CC
// geht (Martin, 03.09.2026: "die dürfen sich sehen"). Sie wird im SA-Portal
// und im CAapp-Admin gepflegt und darf nie in leads.email hineinwandern —
// ein Komma dort bräche Dedupe, Validierung und Tippfehler-Wächter.
//
// Pures Modul ohne Next-Imports, damit es aus Routen UND aus dem Root-vitest
// importierbar ist. 1:1-Duplikat lebt in
// `project 3/supabase/functions/send-scheduled-emails/empfaenger.ts`
// (Edge Fn kann nicht aus lib/ importieren — gleiche Lage wie portal-url.ts
// und names.ts). Änderungen hier ⇒ dort nachziehen.

export interface EmpfaengerQuelle {
  email?: string | null;
  email_cc?: string | null;
}

export interface Empfaenger {
  to: string;
  /** undefined, wenn keine brauchbare Kopie-Adresse vorliegt. */
  cc?: string;
}

const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Kopie-Adresse bereinigt — oder null, wenn leer, ungültig oder identisch mit `to`. */
export function kopieAdresse(emailCc: string | null | undefined, to: string): string | null {
  const cc = (emailCc ?? '').trim();
  if (!cc || !ADRESSE.test(cc)) return null;
  if (cc.toLowerCase() === (to ?? '').trim().toLowerCase()) return null;
  return cc;
}

export function kundenEmpfaenger(lead: EmpfaengerQuelle, toOverride?: string | null): Empfaenger {
  const to = (toOverride ?? lead.email ?? '').trim();
  const cc = kopieAdresse(lead.email_cc, to);
  return cc ? { to, cc } : { to };
}
