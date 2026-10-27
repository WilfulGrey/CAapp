/**
 * Gebucht-Seite für echte Kunden (Registry #139): `gebuchtDatenAusPortal` baut die Daten der Seite aus dem Zustand des
 * Portals. Geprüft werden die Regeln aus der Spezifikation (Abschnitte 5.1, 5.2, 7): Vertragsstand je Pflegekraft,
 * Tagessatz nur mit belegter Quelle, Einsatz aus lead_jobs bzw. dem Job, Anreise nur aus der Brücke, Folgeeinsatz,
 * Vermittler ohne Mail-Satz. Am Ende läuft das Ergebnis durch `gebuchtStand`, damit die Zustände der Vorschau (AD, VO, VV,
 * AF, L, B) auch aus echten Daten entstehen.
 */
import { describe, expect, it } from 'vitest';
import type { Application } from '../components/portal/shared';
import type { Nurse } from '../types';
import type { LeadJobRow, MamamiaAcceptedApplicationRow } from '../lib/mamamia/types';
import { gebuchtDatenAusPortal, tagessatzAusVertrag, type GebuchtPortalEingabe } from '../lib/gebuchtDaten';
import { findeFolgeeinsatz, gebuchtStand, type AnreiseEreignis } from '../lib/gebuchtStand';

const HEUTE = '2026-10-25';
const NURSE = { caregiverId: 15184, name: 'Maria Kowalski' } as unknown as Nurse;

function app(over: Partial<Application> = {}): Application {
  return {
    id: '14746',
    nurse: NURSE,
    agencyName: 'Primundus',
    appliedAt: '',
    status: 'accepted',
    message: '',
    offer: {
      monatlicheKosten: 2850, anreisedatum: '', abreisedatum: '', anreisekosten: 125, abreisekosten: 125,
      reisetage: '', feiertagszuschlag: 95, kuendigungsfrist: '', submittedAt: '',
    },
    ...over,
  };
}

function annahme(over: Partial<MamamiaAcceptedApplicationRow> = {}): MamamiaAcceptedApplicationRow {
  return {
    application_id: 14746,
    caregiver_id: 15184,
    accepted_at: '2026-10-15T09:20:00Z',
    contract_snapshot: {
      datum: '15.10.2026', vertragsbeginn: '01.11.2026', voraussAbreise: '20.12.2026', tagessatz: 'EUR 95,00',
      ag: { name: 'Anna Müller' }, le: null, dl: { name: 'Primundus' },
    },
    ...over,
  };
}

function job(over: Partial<LeadJobRow> = {}): LeadJobRow {
  return {
    id: 'job-aktuell', mamamia_job_offer_id: 38118, status: 'gebucht', anreise: '2026-11-01', abreise: '2026-12-20',
    position: 1, pflegekraft: 'Maria Kowalski', bewerbungen: 3, ...over,
  };
}

const ANREISE: AnreiseEreignis = {
  event_type: 'caregiver_arrival_scheduled',
  created_at: '2026-10-20T08:00:00Z',
  metadata: {
    mamamia_job_offer_id: 38118, anreise_datum: '2026-11-01', anreise_von: '14:00', anreise_bis: '16:00',
    verkehrsmittel: 'Minibus', einsatzort_strasse: 'Musterstraße 1', einsatzort_plz_ort: '12345 Musterstadt',
  },
};

function eingabe(over: Partial<GebuchtPortalEingabe> = {}): GebuchtPortalEingabe {
  return {
    heute: HEUTE,
    kopf: { name: 'Frau Müller', kuerzel: 'AM' },
    lead: { id: 'lead-1', token: 'tok-1', email: 'kunde@example.test', vermittler: null },
    app: app(),
    signiertInDieserSitzung: false,
    annahmen: [annahme()],
    kannVertragNachholen: false,
    jobs: [job()],
    jobOfferId: 38118,
    jobOffer: { arrival_at: '2026-11-01 00:00:00', departure_at: '2026-12-20 00:00:00' },
    ereignisse: [ANREISE],
    notfallTelefon: null,
    kostenrechnerUrl: 'https://kostenrechner.test/',
    ...over,
  };
}

const zustand = (e: GebuchtPortalEingabe) => {
  const d = gebuchtDatenAusPortal(e);
  return gebuchtStand({ heute: d.heute, einsatz: d.einsatz, anreise: d.anreise, vertrag: d.vertrag.stand }).zustand;
};

describe('tagessatzAusVertrag', () => {
  it('liest den Wortlaut des Vertrags-Snapshots', () => {
    expect(tagessatzAusVertrag('EUR 95,00')).toBe(95);
    expect(tagessatzAusVertrag('EUR 83,50')).toBe(83.5);
    expect(tagessatzAusVertrag('95 €')).toBe(95);
    expect(tagessatzAusVertrag(' 100 ')).toBe(100);
  });
  it('alles Unlesbare ⇒ null, kein Ersatzwert', () => {
    for (const w of [null, undefined, '', 'EUR', 'ca. 95', '95,00 € / Tag', '0', 'EUR 1.234,00', 'abc']) {
      expect(tagessatzAusVertrag(w), String(w)).toBeNull();
    }
  });
});

describe('Vertragsstand (Spez. 5.2: je Pflegekraft, nicht je Lead)', () => {
  it('Annahme-Zeile mit Vertrag dieser Pflegekraft ⇒ unterschrieben, Datum aus dem Snapshot, PDF genau dieser Bewerbung', () => {
    const d = gebuchtDatenAusPortal(eingabe());
    expect(d.vertrag.stand).toBe('unterschrieben');
    expect(d.vertrag.datum).toBe('15.10.2026');
    const url = new URL(d.vertrag.pdfHref!);
    expect(url.origin + url.pathname).toBe('https://kostenrechner.test/api/contract-pdf/lead-1');
    expect(url.searchParams.get('token')).toBe('tok-1');
    expect(url.searchParams.get('application_id')).toBe('14746');
  });
  it('Snapshot ohne Datum ⇒ Datum der Annahme', () => {
    const z = annahme();
    const d = gebuchtDatenAusPortal(eingabe({ annahmen: [{ ...z, contract_snapshot: { ...z.contract_snapshot!, datum: '' } }] }));
    expect(d.vertrag.datum).toBe('2026-10-15T09:20:00Z');
  });
  it('in dieser Sitzung unterschrieben (Zeile noch nicht geladen) ⇒ unterschrieben, PDF über die eigene Bewerbung', () => {
    const d = gebuchtDatenAusPortal(eingabe({ annahmen: [], signiertInDieserSitzung: true }));
    expect(d.vertrag.stand).toBe('unterschrieben');
    expect(d.vertrag.datum).toBeNull();
    expect(new URL(d.vertrag.pdfHref!).searchParams.get('application_id')).toBe('14746');
  });
  it('Agentur-Buchung „fc-…" in dieser Sitzung nachgeholt ⇒ PDF mit der Zahl hinter fc-', () => {
    const d = gebuchtDatenAusPortal(eingabe({ app: app({ id: 'fc-4715', synthetic: true }), annahmen: [], signiertInDieserSitzung: true }));
    expect(new URL(d.vertrag.pdfHref!).searchParams.get('application_id')).toBe('4715');
  });
  it('kein Vertrag am Lead, Nachholen möglich ⇒ offen, ohne PDF und ohne Tagessatz (Zustand VO)', () => {
    const e = eingabe({ annahmen: [], kannVertragNachholen: true });
    const d = gebuchtDatenAusPortal(e);
    expect(d.vertrag).toEqual({ stand: 'offen', datum: null, pdfHref: null });
    expect(d.tagessatz).toBeNull();
    expect(zustand(e)).toBe('VO');
  });
  it('Vertrag am Lead gehört zu einer ANDEREN Pflegekraft ⇒ anderer (Entscheidung 5 B), Datum und PDF jenes Vertrags, keine Kosten', () => {
    const e = eingabe({ annahmen: [annahme({ caregiver_id: 99999, application_id: 14000 })] });
    const d = gebuchtDatenAusPortal(e);
    expect(d.vertrag.stand).toBe('anderer');
    expect(d.vertrag.datum).toBe('15.10.2026');
    expect(new URL(d.vertrag.pdfHref!).searchParams.get('application_id')).toBe('14000');
    expect(d.tagessatz).toBeNull();
  });
  it('weder Vertrag noch Nachholen ⇒ vorbereitung (vor der Anreise ohne Anreise-Eintrag: VV)', () => {
    const e = eingabe({ annahmen: [], ereignisse: [] });
    expect(gebuchtDatenAusPortal(e).vertrag).toEqual({ stand: 'vorbereitung', datum: null, pdfHref: null });
    expect(zustand(e)).toBe('VV');
  });
  it('neuester Vertrag dieser Pflegekraft gewinnt (gleiche Kraft, zweiter Turnus)', () => {
    const alt = annahme({ application_id: 11198, accepted_at: '2026-08-05T10:00:00Z',
      contract_snapshot: { ...annahme().contract_snapshot!, datum: '05.08.2026', tagessatz: 'EUR 90,00' } });
    const d = gebuchtDatenAusPortal(eingabe({ annahmen: [alt, annahme()] }));
    expect(d.vertrag.datum).toBe('15.10.2026');
    expect(new URL(d.vertrag.pdfHref!).searchParams.get('application_id')).toBe('14746');
    expect(d.tagessatz).toBe(95);
  });
  it('ohne Lead-Token kein PDF-Link (kein toter Link)', () => {
    const d = gebuchtDatenAusPortal(eingabe({ lead: { id: 'lead-1', token: null, email: 'kunde@example.test' } }));
    expect(d.vertrag.stand).toBe('unterschrieben');
    expect(d.vertrag.pdfHref).toBeNull();
  });
});

describe('Tagessatz (Spez. 7 Regel 6): nur aus dem Vertrag oder der gelisteten Bewerbung', () => {
  it('aus dem Vertrag', () => {
    expect(gebuchtDatenAusPortal(eingabe()).tagessatz).toBe(95);
  });
  it('Vertrag unlesbar ⇒ gelistete Bewerbung Monat/30', () => {
    const z = annahme();
    const d = gebuchtDatenAusPortal(eingabe({ annahmen: [{ ...z, contract_snapshot: { ...z.contract_snapshot!, tagessatz: 'x' } }] }));
    expect(d.tagessatz).toBe(95); // 2850 / 30
  });
  it('synthetische bzw. Agentur-Bewerbung ohne lesbaren Vertrag ⇒ kein Tagessatz', () => {
    const z = annahme();
    const ohne = { ...z, contract_snapshot: { ...z.contract_snapshot!, tagessatz: '' } };
    expect(gebuchtDatenAusPortal(eingabe({ app: app({ synthetic: true }), annahmen: [ohne] })).tagessatz).toBeNull();
    expect(gebuchtDatenAusPortal(eingabe({ app: app({ id: 'fc-4715' }), annahmen: [{ ...ohne, application_id: 4715 }] })).tagessatz).toBeNull();
  });
});

describe('Einsatz und Anreise', () => {
  it('Zeile aus lead_jobs zum Job der Sitzung; Anreise aus der Brücke ⇒ AD', () => {
    const e = eingabe();
    const d = gebuchtDatenAusPortal(e);
    expect(d.einsatz).toEqual({ id: 'job-aktuell', status: 'gebucht', anreise: '2026-11-01', abreise: '2026-12-20' });
    expect(d.anreise).toEqual({ datum: '2026-11-01', von: '14:00', bis: '16:00', verkehrsmittel: 'Minibus', strasse: 'Musterstraße 1', plzOrt: '12345 Musterstadt' });
    expect(d.brueckeOk).toBe(true);
    expect(zustand(e)).toBe('AD');
  });
  it('Brücke hat geantwortet, aber kein Eintrag ⇒ ohne Anreise, brueckeOk (AF)', () => {
    const e = eingabe({ ereignisse: [] });
    const d = gebuchtDatenAusPortal(e);
    expect(d.anreise).toBeNull();
    expect(d.brueckeOk).toBe(true);
    expect(zustand(e)).toBe('AF');
  });
  it('ohne Brücke (keine Antwort) ⇒ anreise null, brueckeOk false', () => {
    const d = gebuchtDatenAusPortal(eingabe({ ereignisse: null }));
    expect(d.anreise).toBeNull();
    expect(d.brueckeOk).toBe(false);
  });
  it('Anreise-Eintrag eines anderen Jobs oder Test-Eintrag zählt nicht', () => {
    const fremd = { ...ANREISE, metadata: { ...ANREISE.metadata!, mamamia_job_offer_id: 1 } };
    const test = { ...ANREISE, metadata: { ...ANREISE.metadata!, test: true } };
    expect(gebuchtDatenAusPortal(eingabe({ ereignisse: [fremd, test] })).anreise).toBeNull();
  });
  it('Spiegel lead_jobs fehlt ⇒ Daten aus dem Job, Status unbekannt, Anreise-Eintrag nicht verwendet', () => {
    const d = gebuchtDatenAusPortal(eingabe({ jobs: null }));
    expect(d.einsatz).toEqual({ id: null, status: null, anreise: '2026-11-01', abreise: '2026-12-20' });
    expect(d.anreise).toBeNull();
    expect(d.jobs).toEqual([]);
  });
  it('läuft gerade ⇒ L; Abreise vorbei ⇒ B', () => {
    expect(zustand(eingabe({ jobs: [job({ anreise: '2026-10-01', abreise: '2026-12-20' })], ereignisse: [] }))).toBe('L');
    expect(zustand(eingabe({ jobs: [job({ anreise: '2026-08-01', abreise: '2026-10-20' })], ereignisse: [] }))).toBe('B');
  });
});

describe('Folgeeinsatz', () => {
  it('angelegt ⇒ in jobs und von findeFolgeeinsatz gefunden', () => {
    const folge = job({ id: 'job-folge', mamamia_job_offer_id: 39000, status: 'geplant', anreise: '2026-12-20', abreise: null, pflegekraft: null, bewerbungen: 2 });
    const d = gebuchtDatenAusPortal(eingabe({ jobs: [job(), folge] }));
    expect(d.jobs.map((j) => j.id)).toEqual(['job-aktuell', 'job-folge']);
    expect(findeFolgeeinsatz(d.jobs, d.einsatz.id, d.einsatz.abreise)?.id).toBe('job-folge');
  });
  it('noch nicht angelegt ⇒ kein Folgeeinsatz', () => {
    const d = gebuchtDatenAusPortal(eingabe());
    expect(findeFolgeeinsatz(d.jobs, d.einsatz.id, d.einsatz.abreise)).toBeNull();
  });
});

describe('Mail-Satz, Kopf, Pflegekraft, Notfallnummer', () => {
  it('mit Adresse ⇒ bekommtMail; Vermittler oder ohne Adresse ⇒ nicht', () => {
    expect(gebuchtDatenAusPortal(eingabe()).bekommtMail).toBe(true);
    expect(gebuchtDatenAusPortal(eingabe({ lead: { id: 'l', token: 't', email: 'pflegena@example.test', vermittler: 'pflegena' } })).bekommtMail).toBe(false);
    expect(gebuchtDatenAusPortal(eingabe({ lead: { id: 'l', token: 't', email: '  ' } })).bekommtMail).toBe(false);
  });
  it('Kopf und Pflegekraft unverändert durchgereicht, Notfallnummer nur wie übergeben', () => {
    const d = gebuchtDatenAusPortal(eingabe({ notfallTelefon: '+49 000 0000000' }));
    expect(d.kopf).toEqual({ name: 'Frau Müller', kuerzel: 'AM' });
    expect(d.pflegekraft).toBe(NURSE);
    expect(d.notfallTelefon).toBe('+49 000 0000000');
    expect(gebuchtDatenAusPortal(eingabe()).notfallTelefon).toBeNull();
  });
});
