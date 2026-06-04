import { createClient } from '@supabase/supabase-js';

// auth.{persistSession,autoRefreshToken}=false is MANDATORY for every
// server-side Supabase client. With the defaults (autoRefreshToken=true),
// supabase-js v2 starts a 30s setInterval token-refresh ticker on Node.
// Route handlers that build a client per request leaked one ticker + the
// client it references on every call → ~50MB/day RSS creep → daily OOM on
// the 512Mi Render container (kostenrechner). Do NOT remove these options.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export interface FormularDaten {
  betreuung_fuer: string;
  pflegegrad: number;
  weitere_personen: string;
  mobilitaet: string;
  nachteinsaetze: string;
  deutschkenntnisse: string;
  erfahrung: string;
  fuehrerschein?: string;
  geschlecht?: string;
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

export interface Kalkulation {
  bruttopreis: number;
  zuschüsse: {
    items: Zuschuss[];
    gesamt: number;
  };
  eigenanteil: number;
  aufschluesselung: Array<{
    kategorie: string;
    antwort: string;
    label: string;
    aufschlag: number;
  }>;
  formularDaten?: FormularDaten;
  totalGross?: number;
  pflegegeld?: number;
  taxBenefit?: number;
  pflegegradUsed?: string;
}

export async function berechnePreis(formularDaten: FormularDaten): Promise<Kalkulation> {
  const { data: basisData } = await supabase
    .from('pricing_config')
    .select('aufschlag_euro')
    .eq('kategorie', 'basis')
    .eq('aktiv', true)
    .maybeSingle();

  let bruttopreis = basisData?.aufschlag_euro || 2800;

  const kategorien = [
    { kat: 'betreuung_fuer', antwort: formularDaten.betreuung_fuer },
    { kat: 'pflegegrad', antwort: formularDaten.pflegegrad.toString() },
    { kat: 'weitere_personen', antwort: formularDaten.weitere_personen },
    { kat: 'mobilitaet', antwort: formularDaten.mobilitaet },
    { kat: 'nachteinsaetze', antwort: formularDaten.nachteinsaetze },
    { kat: 'deutschkenntnisse', antwort: formularDaten.deutschkenntnisse },
    { kat: 'erfahrung', antwort: formularDaten.erfahrung },
    ...(formularDaten.fuehrerschein ? [{ kat: 'fuehrerschein', antwort: formularDaten.fuehrerschein }] : []),
    ...(formularDaten.geschlecht ? [{ kat: 'geschlecht', antwort: formularDaten.geschlecht }] : []),
  ];

  const aufschluesselung: Array<{
    kategorie: string;
    antwort: string;
    label: string;
    aufschlag: number;
  }> = [];

  for (const { kat, antwort } of kategorien) {
    const { data: config } = await supabase
      .from('pricing_config')
      .select('*')
      .eq('kategorie', kat)
      .eq('antwort_key', antwort)
      .eq('aktiv', true)
      .maybeSingle();

    if (config) {
      bruttopreis += config.aufschlag_euro;
      aufschluesselung.push({
        kategorie: kat,
        antwort: antwort,
        label: config.antwort_label,
        aufschlag: config.aufschlag_euro,
      });
    }
  }

  const zuschüsse = await berechneZuschüsse(formularDaten, bruttopreis);
  const eigenanteil = Math.max(0, bruttopreis - zuschüsse.gesamt);

  return {
    bruttopreis,
    zuschüsse,
    eigenanteil,
    aufschluesselung,
    formularDaten,
    pflegegradUsed: formularDaten.pflegegrad.toString(),
  };
}

async function berechneZuschüsse(
  formularDaten: FormularDaten,
  bruttopreis: number
): Promise<{ items: Zuschuss[]; gesamt: number }> {
  const zuschüsse: Zuschuss[] = [];

  const { data: alleSubsidies } = await supabase
    .from('subsidies_config')
    .select('*')
    .eq('aktiv', true)
    .order('sortierung');

  if (!alleSubsidies) return { items: [], gesamt: 0 };

  for (const subsidy of alleSubsidies) {
    if (subsidy.name === 'steuervorteil') {
      const { data: value } = await supabase
        .from('subsidies_values')
        .select('*')
        .eq('subsidy_id', subsidy.id)
        .eq('aktiv', true)
        .maybeSingle();

      if (value && value.betrag_typ === 'prozent_vom_brutto') {
        const jaehrlich = Math.min(bruttopreis * 12 * (value.betrag / 100), 4000);
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
    } else if (subsidy.name === 'pflegegeld') {
      const pflegegrad = formularDaten.pflegegrad;
      if (pflegegrad >= 2) {
        const { data: value } = await supabase
          .from('subsidies_values')
          .select('*')
          .eq('subsidy_id', subsidy.id)
          .eq('bedingung_key', 'pflegegrad')
          .eq('bedingung_value', pflegegrad.toString())
          .eq('aktiv', true)
          .maybeSingle();

        if (value && value.betrag > 0) {
          zuschüsse.push({
            name: subsidy.name,
            label: subsidy.label,
            beschreibung: subsidy.beschreibung || '',
            betrag_monatlich: value.betrag,
            betrag_jaehrlich: value.betrag * 12,
            typ: subsidy.typ,
            hinweis: value.hinweis,
            in_kalkulation: subsidy.in_kalkulation ?? false,
          });
        }
      }
    } else if (subsidy.name === 'entlastungsbudget_neu') {
      const pflegegrad = formularDaten.pflegegrad;
      if (pflegegrad >= 2) {
        const { data: value } = await supabase
          .from('subsidies_values')
          .select('*')
          .eq('subsidy_id', subsidy.id)
          .eq('bedingung_key', 'pflegegrad')
          .eq('bedingung_value', pflegegrad.toString())
          .eq('aktiv', true)
          .maybeSingle();

        if (value && value.betrag > 0) {
          const monatlich = Math.round((value.betrag / 12) * 100) / 100;
          zuschüsse.push({
            name: subsidy.name,
            label: subsidy.label,
            beschreibung: subsidy.beschreibung || '',
            betrag_monatlich: monatlich,
            betrag_jaehrlich: value.betrag,
            typ: subsidy.typ,
            hinweis: value.hinweis,
            in_kalkulation: subsidy.in_kalkulation ?? false,
          });
        }
      }
    }
  }

  const gesamt = zuschüsse
    .filter((z) => z.in_kalkulation)
    .reduce((sum, z) => sum + z.betrag_monatlich, 0);

  return { items: zuschüsse, gesamt };
}

export function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export function getTokenExpiry(): Date {
  return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
}

const FEMALE_NAMES = new Set([
  'aaliya','abby','ada','adela','adelheid','adeline','adriana','agata','agatha','agnes','aiko','aila','aileen','aimee','aisha','alana','alba','aleksandra','alexa','alexandra','alexia','alexis','alice','alicia','alina','alissa','aliyah','alke','allie','allison','alma','almut','alona','alva','alwine','amalia','amanda','amara','amaya','amelia','amelie','ami','amira','amy','ana','anastasia','andrea','andreja','angela','angelika','angelina','anita','anja','anna','annalena','anne','annegret','annelies','annelore','annette','anni','annika','antje','antonia','anuschka','aoife','arabell','ariadne','ariane','astrid','aurélie','aurora','ava','babette','barbara','beatrice','beatrix','belen','bella','bente','berit','bernadette','bettina','bianca','birgit','birgitt','birgitta','birgitte','borbala','brigitta','brigitte','britt','brittany','bruna','brunhilde','camila','camilla','cara','carina','carla','carlotta','caro','carola','carolina','caroline','catharina','catharine','catrina','cecile','cecilia','charlotte','chiara','chloe','christel','christiane','christina','christine','claudia','claudine','constanze','corinna','cornelia','dagmar','dana','daniela','daria','deborah','diana','dina','dominique','dorothea','edda','edith','elena','eleonora','eliane','elisa','Elisabeth','elizabeth','elke','ella','ellen','elsa','elsbeth','else','elvira','emilia','emma','erika','erna','ernestine','eva','eveline','evelyn','fatima','felicitas','filippa','fiona','franziska','frauke','frederike','frieda','gabriela','gabriele','gabi','gaby','gerda','gertrud','gisela','greta','gudrun','gülay','hanna','hannah','hannelore','heidemarie','heidi','heike','helene','helga','henriette','hildegard','hildegarde','hilke','hilde','ida','ilka','ilona','ilse','imke','ines','ingeborg','ingrid','irina','iris','irmgard','irmtraud','isabel','isabelle','isadora','jacqueline','jana','janet','janna','jasmin','jennifer','jessica','jette','johanna','jolanta','josefine','josephine','julia','juliane','justine','karin','karla','katharina','katharine','kathrin','katja','katrin','katrina','katrine','klara','klaudia','klarissa','kordula','kristin','kristina','lara','larissa','laura','lea','leah','lena','leonie','leonora','lieselotte','lilli','lillian','lilly','lina','linda','lisa','lisbeth','lore','lori','lotte','lotta','louisa','louise','lucia','luisa','luise','luzie','lydia','magdalena','maja','malin','mara','margarita','margareta','margarethe','margit','margot','marianna','marie','marielle','marina','marita','marlene','marta','martina','mary','mathilde','maud','melanie','melinda','melissa','merle','mia','michelle','mira','miriam','mirja','monika','nadine','natalia','natalie','nathalie','nele','nicola','nicole','nina','nora','natascha','odette','olivia','ottilie','patrizia','paula','pauline','petra','petra','pia','renate','ronja','rosa','rosalie','roswitha','ruth','sabrina','sandra','sara','sarah','silke','silvia','simona','simone','sina','sofia','sonja','sonja','sophie','stefanie','stella','stephanie','susanne','sybille','sylvia','tamara','tanja','tatjana','teresa','theresa','theres','tina','ulrike','ursula','uta','veronika','victoria','viola','virginia','walburga','waltraud','wanda','wiebke','wilhelmine','xenia','yvonne','zoe',
]);

const MALE_NAMES = new Set([
  'aaron','adam','alexander','alfred','alois','andre','andreas','axel','bastian','benedikt','benjamin','bernd','bo','burkhard','carsten','christian','christoph','claus','clemens','cornelius','damian','daniel','david','dieter','dietmar','dirk','dominik','edgar','elias','emilio','eric','erik','ernst','eugen','fabian','felix','finn','florian','frank','franz','frederik','gabriel','georg','gerhard','gottfried','guido','gunnar','günter','günther','hans','hansjörg','hanspeter','harry','hartmut','heinz','helge','helmut','henning','henrik','herbert','heiko','holger','horst','hubert','hugo','jakob','jan','jens','joachim','joe','joel','joerg','johannes','jonas','jonathan','jochen','jörg','joern','kai','karl','kilian','Klaus','kevin','konrad','kristian','lars','leo','leon','leopold','lorenz','lothar','lucas','lukas','manfred','marco','markus','martin','matthias','max','maximilian','michael','mike','moritz','nikolaj','nikolaus','nils','norbert','oliver','oscar','oskar','otto','patrice','patrick','paul','peter','philipp','ralf','reinhard','richard','robert','rolf','sebastian','simon','stefan','steffen','stephan','steven','sven','thomas','thorsten','tillman','tim','tobias','tom','torsten','ulrich','uwe','valentin','victor','volker','werner','willi','will','willhelm','wolf','wolfram','xaver',
]);

export function detectGenderFromName(vorname: string): 'Frau' | 'Herr' | 'Familie' | null {
  if (!vorname?.trim()) return null;

  const vornameClean = vorname.trim();

  const hasMultiplePeople =
    vornameClean.toLowerCase().includes(' und ') ||
    vornameClean.includes(' & ') ||
    vornameClean.includes('/');

  if (hasMultiplePeople) return 'Familie';

  const firstWord = vornameClean.split(' ')[0].toLowerCase();

  if (FEMALE_NAMES.has(firstWord)) return 'Frau';
  if (MALE_NAMES.has(firstWord)) return 'Herr';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const genderDetection = require('gender-detection');
  const result: string = genderDetection.detect(firstWord);

  if (result === 'female') return 'Frau';
  if (result === 'male') return 'Herr';
  return null;
}

/**
 * Generates intelligent salutation based on names.
 * Returns "Herr", "Frau", "Familie", or null if unknown.
 * Callers should use null to fall back to a neutral "Guten Tag" greeting.
 */
export function generateAnrede(vorname: string, nachname: string): string | null {
  return detectGenderFromName(vorname);
}

// Leading salutation/title tokens that map to an explicit Anrede.
const SALUTATION_TITLES: Record<string, 'Frau' | 'Herr' | 'Familie'> = {
  herr: 'Herr', herrn: 'Herr', hr: 'Herr',
  frau: 'Frau', fr: 'Frau',
  familie: 'Familie', fam: 'Familie',
};

// Academic / professional titles to strip from a name without affecting Anrede.
const ACADEMIC_TITLES = new Set([
  'dr', 'prof', 'dipl', 'mag', 'ing', 'med', 'phil', 'rer', 'nat', 'jur', 'habil',
]);

export interface ParsedName {
  vorname: string;
  nachname: string;
  anrede: 'Frau' | 'Herr' | 'Familie' | null;
}

/**
 * Returns a name part only if it actually looks like a usable name: at least
 * two letters, no leftover bracketed notes like "(Sohn)", not a bare initial
 * ("M" / "M."). Otherwise returns '' so callers fall back to a neutral
 * greeting instead of printing garbage ("Guten Tag (Sohn)," / "Guten Tag M,").
 */
export function usableNamePart(part?: string | null): string {
  if (!part) return '';
  const trimmed = part.trim();
  if (/[([{)\]}]/.test(trimmed)) return '';            // bracketed note, e.g. "(Sohn)"
  if (!/[A-Za-zÀ-ÿ]/.test(trimmed)) return '';          // no letters at all
  if (trimmed.replace(/\.$/, '').length < 2) return ''; // bare initial, e.g. "M" / "M."
  return trimmed;
}

/**
 * Parse a single free-text name field into vorname / nachname / anrede.
 *
 * Customers type all sorts of things into one field:
 *   "Herr Steffen Krumbholz (Sohn)"  → Herr · Steffen · Krumbholz
 *   "Frau Dr. Anna Müller"           → Frau · Anna · Müller
 *   "M Mazura"                       → null · M · Mazura  (greeting falls back to "Guten Tag,")
 *   "Familie Müller"                 → Familie · "" · Müller
 *
 * Steps: strip bracketed notes like "(Sohn)" → strip leading titles (and
 * capture the salutation) → split the rest into vorname (all but last token)
 * and nachname (last token) → detect gender from the first name if no explicit
 * title was given.
 */
export function parseCustomerName(raw: string | null | undefined): ParsedName {
  const empty: ParsedName = { vorname: '', nachname: '', anrede: null };
  if (!raw?.trim()) return empty;

  // 1. Remove bracketed relationship notes: (Sohn), [Tochter], {Ehemann} …
  const cleaned = raw.replace(/[([{][^)\]}]*[)\]}]/g, ' ');

  let tokens = cleaned.trim().split(/\s+/).filter(Boolean);

  // 2. Strip leading title tokens; first salutation title wins as Anrede.
  let anrede: 'Frau' | 'Herr' | 'Familie' | null = null;
  while (tokens.length > 0) {
    const key = tokens[0].toLowerCase().replace(/\.$/, '');
    if (key in SALUTATION_TITLES) {
      if (!anrede) anrede = SALUTATION_TITLES[key];
      tokens = tokens.slice(1);
    } else if (ACADEMIC_TITLES.has(key)) {
      tokens = tokens.slice(1);
    } else {
      break;
    }
  }

  // 3. Split remainder into vorname (all but last) + nachname (last).
  let vorname = '';
  let nachname = '';
  if (tokens.length === 1) {
    vorname = tokens[0];
  } else if (tokens.length > 1) {
    vorname = tokens.slice(0, -1).join(' ');
    nachname = tokens[tokens.length - 1];
  }

  // 4. If no explicit salutation, detect from the whole remaining name
  //    (so couples like "Anna und Peter Schmidt" are recognised as Familie).
  if (!anrede && tokens.length > 0) {
    anrede = detectGenderFromName(tokens.join(' '));
  }

  // 5. For a family salutation the (single) remaining name is the family
  //    name → keep it as nachname, not vorname ("Familie Müller").
  if (anrede === 'Familie' && !nachname && vorname) {
    nachname = vorname;
    vorname = '';
  }

  return { vorname, nachname, anrede };
}
