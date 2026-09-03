// Kopie von project 3/lib/empfaenger.ts — Edge Functions können nicht aus
// lib/ importieren (CI-Deploy kopiert nur den functions-Ordner). Logik
// synchron halten; Deno-Test in _tests/empfaenger.test.ts.

export interface EmpfaengerQuelle {
  email?: string | null;
  email_cc?: string | null;
}

export interface Empfaenger {
  to: string;
  cc?: string;
}

const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function kopieAdresse(emailCc: string | null | undefined, to: string): string | null {
  const cc = (emailCc ?? "").trim();
  if (!cc || !ADRESSE.test(cc)) return null;
  if (cc.toLowerCase() === (to ?? "").trim().toLowerCase()) return null;
  return cc;
}

export function kundenEmpfaenger(lead: EmpfaengerQuelle, toOverride?: string | null): Empfaenger {
  const to = (toOverride ?? lead.email ?? "").trim();
  const cc = kopieAdresse(lead.email_cc, to);
  return cc ? { to, cc } : { to };
}

/** Mehrere CC-Adressen zu einer nodemailer-Liste — leere fallen weg, keine Dubletten. */
export function ccListe(...teile: (string | null | undefined)[]): string | undefined {
  const gesehen = new Set<string>();
  const out: string[] = [];
  for (const t of teile) {
    const a = (t ?? "").trim();
    if (!a) continue;
    const k = a.toLowerCase();
    if (gesehen.has(k)) continue;
    gesehen.add(k); out.push(a);
  }
  return out.length ? out.join(", ") : undefined;
}
