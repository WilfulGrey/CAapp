/* Registry #170 — geschlossener Lead speichert seinen Patientenbogen selbst ⇒ wieder offen.

   Martin 23.11.2026: „Wenn ich einen Lead im Kostenrechner oder SA-Portal
   schließe, weil er sich zum Beispiel nicht meldet, er dann aber das
   Patientenprofil selbst ausfüllt, ist er nicht mehr unter den offenen Kunden …
   und wir finden den nicht. Durch Zufall nur, wenn wir die E-Mail sehen."

   Geschlossen heißt im Kostenrechner `nicht_interessiert` (Admin „Nachfassmails
   stoppen", Rückmeldeseite, ab mamamia-sadash#98 auch das SA-Portal). Das
   Speichern des Bogens (`patient_data_saved`) ließ den Status stehen. Ab jetzt
   setzt die Bridge den Lead zurück; welchen Status er bekommt, steht hier.

   Rückkehr-Status: Hat das SA-Portal geschlossen (Ereignis `sa_kunde_geschlossen`
   mit `status_vorher`, mamamia-sadash LeadClosureSync) und ist das das letzte
   Abschluss-Ereignis, kommt der Status von davor zurück — dieselbe Regel wie
   beim Öffnen im SA-Portal (CustomerOfferBridge::reopenLeadForCustomer). Sonst
   `angebot_requested`, wie der Admin-Knopf „Lead reaktivieren". */

/** Ereignisse, die über den Abschluss-Zustand eines Leads entscheiden; das
 *  jüngste zählt. Spiegel von CustomerOfferBridge::ABSCHLUSS_EREIGNISSE plus
 *  das eigene Wieder-offen-Ereignis. */
export const ABSCHLUSS_EREIGNISSE = [
  'sa_kunde_geschlossen',
  'sa_kunde_geoeffnet',
  'kunde_kein_interesse',
  'email_unsubscribed',
  'kunde_wieder_aktiv',
] as const;

export const STATUS_WIEDER_OFFEN = 'angebot_requested';

const RUECKKEHR = new Set([
  'info_requested',
  'angebot_requested',
  'folge_einsatz',
  'vertrag_abgeschlossen',
  'betreuung_beauftragt',
  'manuell_pruefen',
]);

export function statusNachWiederOeffnen(
  letztes: { event_type: string; metadata?: Record<string, unknown> | null } | null,
): string {
  if (letztes?.event_type !== 'sa_kunde_geschlossen') return STATUS_WIEDER_OFFEN;
  const m = letztes.metadata ?? {};
  const gesetzt = m.status_gesetzt === true || m.status_gesetzt === 'true';
  const vorher = typeof m.status_vorher === 'string' ? m.status_vorher : '';
  return gesetzt && RUECKKEHR.has(vorher) ? vorher : STATUS_WIEDER_OFFEN;
}
