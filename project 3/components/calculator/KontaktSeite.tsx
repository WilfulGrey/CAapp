'use client';

import { KONTAKT_SEITE, MARTA_KARTE } from '@/lib/preis-zuerst';
import { PersonalContact } from '@/components/calculator/PersonalContact';
import { SterneText } from '@/components/calculator/BewertungsZeile';
import type { SterneStand } from '@/lib/sterne-zeile';

/**
 * Kontaktseite HINTER dem Preis (Registry #77, Martin 17.09.2026: „Diese Seite
 * müssen wir schön machen, damit das auch gut konvertiert"). Ruhig wie die
 * Preisseite: eine Frage, eine Zeile Lohn, drei Felder mit sichtbaren
 * Beschriftungen, ein Knopf — der nie grau ist: geprüft wird beim Klick, die
 * Fehler stehen am Feld, das erste fehlerhafte Feld bekommt den Fokus.
 */
export type KontaktFeld = 'name' | 'email' | 'phone';
export type KontaktWerte = Record<KontaktFeld, string>;

const FOTOS = ['pk-1', 'pk-2', 'pk-3', 'pk-4', 'pk-5'].map((n) => `/images/caregivers/${n}.jpg`);
export const KONTAKT_FELD_ID: Record<KontaktFeld, string> = { name: 'kontakt-name', email: 'kontakt-email', phone: 'kontakt-telefon' };

export function KontaktSeite({ werte, fehler, serverFehler, sendet, bewertung = null, onAendern, onAbsenden, onFokus, onBlur }: {
  /** Bewertungsstand der Startseite — dieselbe Sterne-Zeile unter dem Datenschutz-Satz (Martin 17.09.). Ohne Stand keine Zeile. */
  bewertung?: SterneStand | null;
  werte: KontaktWerte;
  fehler: KontaktWerte;
  serverFehler: string;
  sendet: boolean;
  onAendern: (feld: KontaktFeld, wert: string) => void;
  onAbsenden: () => void;
  onFokus: (feld: KontaktFeld) => void;
  onBlur: (feld: KontaktFeld) => void;
}) {
  const feldCls = (f: KontaktFeld) =>
    `w-full px-4 py-3 text-base border-[1.5px] rounded-xl bg-white focus:outline-none focus:ring-1 ${fehler[f] ? 'border-red-500 focus:border-red-500 focus:ring-red-300/60' : 'border-[#CFC6B8] focus:border-[#8B7355] focus:ring-[#8B7355]/40'}`;
  const labelCls = 'block text-[14px] font-semibold text-[#3D3D3D] mb-1.5';
  const fehlerZeile = (f: KontaktFeld) =>
    fehler[f] ? <p id={`${KONTAKT_FELD_ID[f]}-fehler`} role="alert" className="mt-1.5 text-[13px] text-red-600">{fehler[f]}</p> : null;
  return (
    <div>
    <form id="kontakt-seite" noValidate onSubmit={(e) => { e.preventDefault(); onAbsenden(); }} className="pt-2">
      <p className="text-[21px] leading-tight font-bold text-[#1a1a1a] [text-wrap:balance]">{KONTAKT_SEITE.frage}</p>
      <div className="mt-3 flex items-center gap-3">
        <div className="flex flex-shrink-0">
          {FOTOS.map((src, i) => (
            <span key={src} className={`relative w-7 h-7 rounded-full overflow-hidden border-2 border-white flex-shrink-0 ${i > 0 ? '-ml-2' : ''}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
            </span>
          ))}
        </div>
        <p className="text-[14px] leading-snug text-[#6B6B6B] [text-wrap:balance]">{KONTAKT_SEITE.lohn}</p>
      </div>

      <div className="mt-5 space-y-3.5">
        <div>
          <label htmlFor={KONTAKT_FELD_ID.name} className={labelCls}>{KONTAKT_SEITE.label.name}</label>
          <input
            id={KONTAKT_FELD_ID.name}
            type="text"
            autoComplete="name"
            value={werte.name}
            onChange={(e) => onAendern('name', e.target.value)}
            onFocus={() => onFokus('name')}
            onBlur={() => onBlur('name')}
            aria-invalid={fehler.name ? true : undefined}
            aria-describedby={fehler.name ? `${KONTAKT_FELD_ID.name}-fehler` : undefined}
            className={feldCls('name')}
          />
          {fehlerZeile('name')}
        </div>
        <div>
          <label htmlFor={KONTAKT_FELD_ID.email} className={labelCls}>{KONTAKT_SEITE.label.email}</label>
          <input
            id={KONTAKT_FELD_ID.email}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={werte.email}
            onChange={(e) => onAendern('email', e.target.value)}
            onFocus={() => onFokus('email')}
            onBlur={() => onBlur('email')}
            aria-invalid={fehler.email ? true : undefined}
            aria-describedby={fehler.email ? `${KONTAKT_FELD_ID.email}-fehler` : undefined}
            className={feldCls('email')}
          />
          {fehlerZeile('email')}
        </div>
        <div>
          <label htmlFor={KONTAKT_FELD_ID.phone} className={labelCls}>{KONTAKT_SEITE.label.phone}</label>
          <input
            id={KONTAKT_FELD_ID.phone}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={KONTAKT_SEITE.platzhalterTelefon}
            value={werte.phone}
            onChange={(e) => onAendern('phone', e.target.value)}
            onFocus={() => onFokus('phone')}
            onBlur={() => onBlur('phone')}
            aria-invalid={fehler.phone ? true : undefined}
            aria-describedby={fehler.phone ? `${KONTAKT_FELD_ID.phone}-fehler` : `${KONTAKT_FELD_ID.phone}-hinweis`}
            className={feldCls('phone')}
          />
          {fehler.phone
            ? fehlerZeile('phone')
            : <p id={`${KONTAKT_FELD_ID.phone}-hinweis`} className="mt-1.5 text-[13px] leading-snug text-[#6B6B6B]">{KONTAKT_SEITE.telefonHinweis}</p>}
        </div>
      </div>

      {serverFehler && <p role="alert" className="mt-4 text-[14px] text-red-600">{serverFehler}</p>}
      <button
        type="submit"
        disabled={sendet}
        className={`mt-5 w-full py-4 px-2 font-bold text-[15px] min-[400px]:text-base whitespace-nowrap rounded-xl text-white shadow-lg transition-all duration-200 ${sendet ? 'bg-[#F2B5AE] cursor-wait' : 'bg-[#E76F63] hover:bg-[#D65E52] hover:shadow-xl cursor-pointer'}`}
      >
        {sendet ? (
          <span className="flex items-center justify-center gap-2">
            {KONTAKT_SEITE.sendet}
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          </span>
        ) : KONTAKT_SEITE.knopf}
      </button>
      <p className="mt-3 text-center text-[12px] leading-snug text-[#8B8B8B]">
        {KONTAKT_SEITE.datenschutzVor}{' '}
        <a href="/datenschutz" target="_blank" className="text-[#8B7355] underline hover:text-[#A68968]">{KONTAKT_SEITE.datenschutzLink}</a>{' '}
        {KONTAKT_SEITE.datenschutzNach}
      </p>
      {/* Sterne wie auf Startseite und Preisseite, hier ohne Sprungziel — niemand soll das Formular verlassen. */}
      {bewertung && (
        <div className="mt-4 flex justify-center">
          <span aria-label={`${bewertung.schnitt} von 5 Sternen`}><SterneText stand={bewertung} /></span>
        </div>
      )}
    </form>
    {/* Ganz unten, außerhalb des Formulars: Marta wie auf der Preisseite (Martin 17.09.). */}
    <div className="mt-7 border-t border-[#EEE9E0] pt-5">
      <PersonalContact headline={MARTA_KARTE.frage} body={MARTA_KARTE.text} />
    </div>
    </div>
  );
}
