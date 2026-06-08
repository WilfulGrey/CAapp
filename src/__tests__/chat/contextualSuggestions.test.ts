// Tests für die Chat-Vorschlags-Logik. Jeder Trigger einmal, plus
// Sortierung + Fallbacks für fehlende Daten. Inhalt der Frage-Texte
// stützt sich auf Userfeedback 2026-06-08 ("kein Matching, nur Patienten-
// Infos in neutraler Sie-Form").

import { describe, it, expect } from 'vitest';
import { buildChatSuggestions } from '../../lib/chat/contextualSuggestions';
import type { FormularDaten } from '../../../supabase/functions/onboard-to-mamamia/types';

function fd(overrides: Partial<FormularDaten> = {}): FormularDaten {
  return { ...overrides };
}

describe('buildChatSuggestions — Anreise (nur bei Abweichung)', () => {
  it('Kunde will früher → "können Sie früher anreisen" Chip', () => {
    const s = buildChatSuggestions({
      applicationArrivalAt: '2026-07-22',
      customerArrivalAt: '2026-07-15',
    });
    expect(s.find(x => x.id === 'arrival-earlier')?.text)
      .toMatch(/schon ab dem 15\.07.*früher.*statt am 22\.07/);
  });

  it('Kunde will später → "können Sie später anreisen" Chip', () => {
    const s = buildChatSuggestions({
      applicationArrivalAt: '2026-07-22',
      customerArrivalAt: '2026-08-01',
    });
    expect(s.find(x => x.id === 'arrival-later')?.text)
      .toMatch(/erst ab dem 01\.08.*später.*statt am 22\.07/);
  });

  it('Daten identisch → KEIN Anreise-Chip', () => {
    const s = buildChatSuggestions({
      applicationArrivalAt: '2026-07-22',
      customerArrivalAt: '2026-07-22',
    });
    expect(s.find(x => x.id?.startsWith('arrival-'))).toBeUndefined();
  });

  it('Kundenwunsch fehlt → KEIN Anreise-Chip (keine Vermutung)', () => {
    const s = buildChatSuggestions({ applicationArrivalAt: '2026-07-22' });
    expect(s.find(x => x.id?.startsWith('arrival-'))).toBeUndefined();
  });
});

describe('buildChatSuggestions — Abreise (immer länger fragen)', () => {
  it('Bewerbung hat Abreise → "wären Sie offen für länger" Chip', () => {
    const s = buildChatSuggestions({ applicationDepartureAt: '2026-09-17' });
    expect(s.find(x => x.id === 'departure-longer')?.text)
      .toMatch(/Abreise am 17\.09.*offen für länger/);
  });

  it('Keine Bewerbungs-Abreise → kein Chip', () => {
    const s = buildChatSuggestions({});
    expect(s.find(x => x.id === 'departure-longer')).toBeUndefined();
  });
});

describe('buildChatSuggestions — Pflegegrad', () => {
  it('PG 4 → KEIN Pflegegrad-Chip (bewusst entfernt 2026-06-08)', () => {
    const s = buildChatSuggestions({ formularDaten: fd({ pflegegrad: 4 }) });
    expect(s.find(x => x.id === 'pflegegrad-hoch')).toBeUndefined();
  });

  it('PG 5 → KEIN Pflegegrad-Chip', () => {
    const s = buildChatSuggestions({ formularDaten: fd({ pflegegrad: 5 }) });
    expect(s.find(x => x.id === 'pflegegrad-hoch')).toBeUndefined();
  });
});

describe('buildChatSuggestions — Couple-Care', () => {
  it('feuert bei betreuung_fuer=ehepaar mit "passt das für Sie"', () => {
    const s = buildChatSuggestions({ formularDaten: fd({ betreuung_fuer: 'ehepaar' }) });
    expect(s.find(x => x.id === 'couple-care')?.text)
      .toMatch(/Ehepaar.*2 Personen.*passt das für Sie/);
  });

  it('feuert NICHT bei 1-person', () => {
    const s = buildChatSuggestions({ formularDaten: fd({ betreuung_fuer: '1-person' }) });
    expect(s.find(x => x.id === 'couple-care')).toBeUndefined();
  });
});

describe('buildChatSuggestions — Mobilität', () => {
  it('Rollstuhl löst rollstuhl-Chip aus', () => {
    const s = buildChatSuggestions({ formularDaten: fd({ mobilitaet: 'rollstuhl' }) });
    expect(s.find(x => x.id === 'mobility-rollstuhl')?.text).toMatch(/rollstuhlpflichtig/);
  });

  it('Bettlägerig löst eigenen Chip aus', () => {
    const s = buildChatSuggestions({ formularDaten: fd({ mobilitaet: 'bettlaegerig' }) });
    expect(s.find(x => x.id === 'mobility-bettlaegerig')?.text).toMatch(/bettlägerig/);
  });

  it('Mobil/Rollator löst keinen Chip aus', () => {
    ['mobil', 'rollator'].forEach(m => {
      const s = buildChatSuggestions({ formularDaten: fd({ mobilitaet: m }) });
      expect(s.find(x => x.id?.startsWith('mobility-'))).toBeUndefined();
    });
  });
});

describe('buildChatSuggestions — Demenz', () => {
  it('feuert wenn patientHasDementia=true', () => {
    const s = buildChatSuggestions({ patientHasDementia: true });
    expect(s.find(x => x.id === 'demenz')).toBeDefined();
  });

  it('feuert NICHT wenn patientHasDementia=false oder fehlt', () => {
    expect(buildChatSuggestions({ patientHasDementia: false }).find(x => x.id === 'demenz')).toBeUndefined();
    expect(buildChatSuggestions({}).find(x => x.id === 'demenz')).toBeUndefined();
  });
});

describe('buildChatSuggestions — Inkontinenz', () => {
  it('feuert beim Sammel-Flag', () => {
    const s = buildChatSuggestions({ patientHasIncontinence: true });
    expect(s.find(x => x.id === 'inkontinenz')).toBeDefined();
  });

  it('feuert NICHT wenn false', () => {
    const s = buildChatSuggestions({ patientHasIncontinence: false });
    expect(s.find(x => x.id === 'inkontinenz')).toBeUndefined();
  });
});

describe('buildChatSuggestions — Nachteinsätze', () => {
  it('mehrmals → eigener Chip mit "mehrmals"', () => {
    const s = buildChatSuggestions({ formularDaten: fd({ nachteinsaetze: 'mehrmals' }) });
    expect(s.find(x => x.id === 'nacht-mehrmals')?.text).toMatch(/mehrmals/);
  });

  it('taeglich/gelegentlich → 1-2x Chip', () => {
    ['taeglich', 'gelegentlich'].forEach(n => {
      const s = buildChatSuggestions({ formularDaten: fd({ nachteinsaetze: n }) });
      expect(s.find(x => x.id === 'nacht-regelmaessig')?.text).toMatch(/1.{0,2}2x/);
    });
  });

  it('nein → kein Chip', () => {
    const s = buildChatSuggestions({ formularDaten: fd({ nachteinsaetze: 'nein' }) });
    expect(s.find(x => x.id?.startsWith('nacht-'))).toBeUndefined();
  });
});

describe('buildChatSuggestions — Deutschkenntnisse (level-spezifisch)', () => {
  it('grundlegend → "grundlegend verständigen"', () => {
    const s = buildChatSuggestions({ formularDaten: fd({ deutschkenntnisse: 'grundlegend' }) });
    expect(s.find(x => x.id === 'deutschkenntnisse')?.text)
      .toMatch(/grundlegend verständigen/);
  });

  it('kommunikativ → "gut auf Deutsch verständigen"', () => {
    const s = buildChatSuggestions({ formularDaten: fd({ deutschkenntnisse: 'kommunikativ' }) });
    expect(s.find(x => x.id === 'deutschkenntnisse')?.text)
      .toMatch(/gut auf Deutsch.*verständigen/);
  });

  it('sehr-gut → "sehr gut Deutsch.*Niveau einschätzen"', () => {
    const s = buildChatSuggestions({ formularDaten: fd({ deutschkenntnisse: 'sehr-gut' }) });
    expect(s.find(x => x.id === 'deutschkenntnisse')?.text)
      .toMatch(/sehr gut Deutsch.*Niveau einschätzen/);
  });

  it('unbekannt / leer → kein Chip', () => {
    expect(buildChatSuggestions({ formularDaten: fd({ deutschkenntnisse: '' }) })
      .find(x => x.id === 'deutschkenntnisse')).toBeUndefined();
    expect(buildChatSuggestions({}).find(x => x.id === 'deutschkenntnisse')).toBeUndefined();
  });
});

describe('buildChatSuggestions — Raucher', () => {
  it('feuert wenn PK raucht UND Haushalt Nichtraucher', () => {
    const s = buildChatSuggestions({ householdSmoking: 'no', nurseSmoking: 'yes' });
    expect(s.find(x => x.id === 'rauchen')?.text).toMatch(/Nichtraucher-Haushalt.*draußen.*Zigaretten pro Tag/);
  });

  it('feuert auch bei yes_outside (raucht ja, aber außen)', () => {
    const s = buildChatSuggestions({ householdSmoking: 'no', nurseSmoking: 'yes_outside' });
    expect(s.find(x => x.id === 'rauchen')).toBeDefined();
  });

  it('feuert NICHT wenn PK nicht raucht', () => {
    const s = buildChatSuggestions({ householdSmoking: 'no', nurseSmoking: 'no' });
    expect(s.find(x => x.id === 'rauchen')).toBeUndefined();
  });

  it('feuert NICHT wenn Haushalt selbst raucht', () => {
    const s = buildChatSuggestions({ householdSmoking: 'yes', nurseSmoking: 'yes' });
    expect(s.find(x => x.id === 'rauchen')).toBeUndefined();
  });
});

describe('buildChatSuggestions — Sortierung & Stabilität', () => {
  it('priority absteigend, Anreise-Mismatch oben, dann Abreise, dann Rest', () => {
    const s = buildChatSuggestions({
      formularDaten: fd({
        betreuung_fuer: 'ehepaar',
        mobilitaet: 'rollstuhl',
        nachteinsaetze: 'mehrmals',
        deutschkenntnisse: 'sehr-gut',
      }),
      applicationArrivalAt: '2026-07-22',
      applicationDepartureAt: '2026-09-17',
      customerArrivalAt: '2026-07-15', // Abweichung → früher-Chip
      patientHasDementia: true,
      patientHasIncontinence: true,
      householdSmoking: 'no',
      nurseSmoking: 'yes_outside',
    });
    expect(s.map(x => x.id)).toEqual([
      'arrival-earlier',       // 100
      'departure-longer',      //  95
      'couple-care',           //  90
      'mobility-rollstuhl',    //  70
      'demenz',                //  60
      'inkontinenz',           //  50
      'nacht-mehrmals',        //  40
      'deutschkenntnisse',     //  30
      'rauchen',               //  20
    ]);
  });

  it('liefert leere Liste bei leerem Kontext', () => {
    expect(buildChatSuggestions({})).toEqual([]);
  });

  it('verwendet "Der Patient" als Default-Label', () => {
    const s = buildChatSuggestions({ formularDaten: fd({ mobilitaet: 'rollstuhl' }) });
    expect(s[0].text).toMatch(/^Der Patient/);
  });
});
