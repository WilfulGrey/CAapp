"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { nachEigenanteilRegel } from './eigenanteil';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type CareStartTiming = 'sofort' | '2-4-wochen' | '1-2-monate' | 'unklar';
export type PatientCount = '1-person' | 'ehepaar';
export type HouseholdOthers = 'nein' | 'ja';
export type Pflegegrad = '0' | '1' | '2' | '3' | '4' | '5';
export type Mobility = 'mobil' | 'rollator' | 'rollstuhl' | 'bettlaegerig';
export type Lifting = 'nein' | 'ja';
export type NightCare = 'nein' | 'gelegentlich' | 'taeglich' | 'mehrmals';
export type GermanLevel = 'grundlegend' | 'kommunikativ' | 'sehr-gut';
export type Experience = 'einsteiger' | 'erfahren' | 'sehr-erfahren';
export type Driving = 'egal' | 'ja' | 'nein';
export type Gender = 'egal' | 'weiblich' | 'maennlich';

interface PricingConfig {
  kategorie: string;
  antwort_key: string;
  aufschlag_euro: number;
}

interface SubsidyValue {
  subsidy_id: string;
  bedingung_key: string | null;
  bedingung_value: string | null;
  betrag: number;
  betrag_typ: string;
  hinweis: string | null;
}

interface SubsidyConfig {
  id: string;
  name: string;
  typ: string;
  label: string;
  beschreibung: string | null;
  in_kalkulation: boolean;
}

interface PricingData {
  basispreis: number;
  configs: PricingConfig[];
  subsidies: SubsidyConfig[];
  subsidyValues: SubsidyValue[];
}

export interface CalculatorState {
  careStartTiming: CareStartTiming | null;
  patientCount: PatientCount | null;
  householdOthers: HouseholdOthers | null;
  pflegegrad: Pflegegrad | null;
  mobility: Mobility | null;
  lifting: Lifting | null;
  nightCare: NightCare | null;
  germanLevel: GermanLevel | null;
  experience: Experience | null;
  driving: Driving | null;
  gender: Gender | null;
}

export interface Zuschuss {
  name: string;
  label: string;
  beschreibung: string;
  betrag_monatlich: number;
  betrag_jaehrlich: number;
  typ: string;
  hinweis: string | null;
  in_kalkulation: boolean;
}

export interface CalculationResult {
  totalGross: number;
  pflegegeld: number;
  taxBenefit: number;
  eigenanteil: number;
  pflegegradUsed: string;
  zuschüsse?: {
    items: Zuschuss[];
    gesamt: number;
  };
}

interface CalculatorContextType {
  state: CalculatorState;
  updateState: (updates: Partial<CalculatorState>) => void;
  calculate: () => CalculationResult;
  resetState: () => void;
  isLoadingPricing: boolean;
}

const initialState: CalculatorState = {
  careStartTiming: null,
  patientCount: null,
  householdOthers: null,
  pflegegrad: null,
  mobility: null,
  lifting: null,
  nightCare: null,
  germanLevel: null,
  experience: null,
  driving: null,
  gender: null,
};

const CalculatorContext = createContext<CalculatorContextType | undefined>(undefined);

export function CalculatorProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CalculatorState>(initialState);
  const [isLoaded, setIsLoaded] = useState(false);
  const [pricingData, setPricingData] = useState<PricingData | null>(null);
  const [isLoadingPricing, setIsLoadingPricing] = useState(true);

  useEffect(() => {
    const loadPricingData = async () => {
      try {
        const timestamp = Date.now();
        const [basisResult, configsResult, subsidiesResult, subsidyValuesResult] = await Promise.all([
          supabase.from('pricing_config').select('aufschlag_euro').eq('kategorie', 'basis').eq('aktiv', true).maybeSingle(),
          supabase.from('pricing_config').select('kategorie, antwort_key, aufschlag_euro').eq('aktiv', true).neq('kategorie', 'basis'),
          supabase.from('subsidies_config').select('id, name, typ, label, beschreibung, in_kalkulation').eq('aktiv', true).order('sortierung'),
          supabase.from('subsidies_values').select('*').eq('aktiv', true)
        ]);

        setPricingData({
          basispreis: basisResult.data?.aufschlag_euro || 2800,
          configs: configsResult.data || [],
          subsidies: subsidiesResult.data || [],
          subsidyValues: subsidyValuesResult.data || []
        });

        sessionStorage.setItem('pricing-timestamp', timestamp.toString());
      } catch (error) {
        console.error('Fehler beim Laden der Pricing-Daten:', error);
      } finally {
        setIsLoadingPricing(false);
      }
    };

    loadPricingData();
  }, []);

  useEffect(() => {
    setIsLoaded(true);
  }, []);


  const updateState = (updates: Partial<CalculatorState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  const getPricingValue = (kategorie: string, antwortKey: string): number => {
    if (!pricingData) return 0;
    const config = pricingData.configs.find(
      c => c.kategorie === kategorie && c.antwort_key === antwortKey
    );
    return config?.aufschlag_euro || 0;
  };

  const getSubsidyValue = (subsidyName: string, pflegegrad: string): number => {
    if (!pricingData) return 0;

    const subsidy = pricingData.subsidies.find(s => s.name === subsidyName);
    if (!subsidy) return 0;

    const value = pricingData.subsidyValues.find(v =>
      v.subsidy_id === subsidy.id &&
      (!v.bedingung_key ||
       (v.bedingung_key === 'pflegegrad' && v.bedingung_value === pflegegrad))
    );

    if (!value) return 0;

    if (subsidyName === 'steuervorteil') {
      return 0;
    }

    return subsidy.typ === 'jaehrlich'
      ? Math.round((value.betrag / 12) * 100) / 100
      : value.betrag;
  };

  const calculateSubsidies = (pflegegrad: string, totalGross: number): { items: Zuschuss[]; gesamt: number } => {
    if (!pricingData) return { items: [], gesamt: 0 };

    const zuschüsse: Zuschuss[] = [];

    for (const subsidy of pricingData.subsidies) {
      if (subsidy.name === 'steuervorteil') {
        const value = pricingData.subsidyValues.find(v => v.subsidy_id === subsidy.id);

        if (value && value.betrag_typ === 'prozent_vom_brutto') {
          const jaehrlich = Math.min(totalGross * 12 * (value.betrag / 100), 4000);
          const monatlich = Math.round((jaehrlich / 12) * 100) / 100;

          zuschüsse.push({
            name: subsidy.name,
            label: subsidy.label,
            beschreibung: subsidy.beschreibung || '',
            betrag_monatlich: monatlich,
            betrag_jaehrlich: jaehrlich,
            typ: subsidy.typ,
            hinweis: value.hinweis,
            in_kalkulation: subsidy.in_kalkulation ?? false,
          });
        }
      } else {
        const value = pricingData.subsidyValues.find(v =>
          v.subsidy_id === subsidy.id &&
          (!v.bedingung_key ||
           (v.bedingung_key === 'pflegegrad' && v.bedingung_value === pflegegrad))
        );

        if (value && value.betrag > 0) {
          const monatlich =
            subsidy.typ === 'jaehrlich'
              ? Math.round((value.betrag / 12) * 100) / 100
              : value.betrag;

          zuschüsse.push({
            name: subsidy.name,
            label: subsidy.label,
            beschreibung: subsidy.beschreibung || '',
            betrag_monatlich: monatlich,
            betrag_jaehrlich:
              subsidy.typ === 'jaehrlich' ? value.betrag : monatlich * 12,
            typ: subsidy.typ,
            hinweis: value.hinweis,
            in_kalkulation: subsidy.in_kalkulation ?? false,
          });
        }
      }
    }

    // Entscheidung 3 (Martin, 15.10.2026): Das Entlastungsbudget (`entlastungsbudget_neu`) geht nie in den
    // Eigenanteil ein, egal was `subsidies_config.in_kalkulation` sagt — gleiche Regel wie lib/calculation.ts,
    // Begründung in lib/eigenanteil.ts.
    const items = zuschüsse.map(nachEigenanteilRegel);
    const gesamt = items
      .filter((z) => z.in_kalkulation)
      .reduce((sum, z) => sum + z.betrag_monatlich, 0);

    return { items, gesamt };
  };

  const calculate = (): CalculationResult => {
    if (!pricingData) {
      return {
        totalGross: 0,
        pflegegeld: 0,
        taxBenefit: 0,
        eigenanteil: 0,
        pflegegradUsed: state.pflegegrad || '0',
      };
    }

    let baseCost = pricingData.basispreis;

    if (state.patientCount) {
      baseCost += getPricingValue('betreuung_fuer', state.patientCount);
    }

    if (state.householdOthers) {
      baseCost += getPricingValue('weitere_personen', state.householdOthers);
    }

    if (state.pflegegrad) {
      baseCost += getPricingValue('pflegegrad', state.pflegegrad);
    }

    if (state.mobility) {
      baseCost += getPricingValue('mobilitaet', state.mobility);
    }

    if (state.nightCare) {
      baseCost += getPricingValue('nachteinsaetze', state.nightCare);
    }

    if (state.germanLevel) {
      baseCost += getPricingValue('deutschkenntnisse', state.germanLevel);
    }

    if (state.experience) {
      baseCost += getPricingValue('erfahrung', state.experience);
    }

    const totalGross = baseCost;

    const pflegegradStr = state.pflegegrad || '0';
    const zuschüsse = calculateSubsidies(pflegegradStr, totalGross);

    const pflegegeldItem = zuschüsse.items.find(z => z.name === 'pflegegeld');
    const pflegegeld = pflegegeldItem ? pflegegeldItem.betrag_monatlich : 0;

    const steuerItem = zuschüsse.items.find(z => z.name === 'steuervorteil');
    const taxBenefit = steuerItem ? steuerItem.betrag_monatlich : 0;

    const eigenanteil = Math.max(0, totalGross - zuschüsse.gesamt);

    return {
      totalGross,
      pflegegeld,
      taxBenefit,
      eigenanteil,
      pflegegradUsed: pflegegradStr,
      zuschüsse,
    };
  };

  const resetState = () => {
    setState(initialState);
  };

  return (
    <CalculatorContext.Provider value={{ state, updateState, calculate, resetState, isLoadingPricing }}>
      {children}
    </CalculatorContext.Provider>
  );
}

export function useCalculator() {
  const context = useContext(CalculatorContext);
  if (context === undefined) {
    throw new Error('useCalculator must be used within a CalculatorProvider');
  }
  return context;
}

export function formatEuro(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
