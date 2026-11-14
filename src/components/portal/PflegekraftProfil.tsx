import type { FC, KeyboardEvent, MouseEvent } from 'react';
import type { Nurse } from '../../types';
import { displayName, initials, nurseLevel } from './shared';
import { useEinsatzStand } from '../../lib/mamamia/hooks';

/**
 * Das Profil einer Pflegekraft als geschlossene Einheit — überall gleich: Bewerbung,
 * „interessiert sich", passende Pflegekräfte, Gebucht. Und identisch in den Mails
 * (project 3/lib/mail-bausteine.ts `mProfil`).
 *
 * Martin 27.09.2026 nach mehreren Runden („V ist super"):
 *  - Foto links, Name + Alter, Deutsch mit Punkten (Niveau sofort erkennbar).
 *  - Stufe gehört zu den Einsätzen bei uns: „★ Elite / 13 Einsätze bei uns" als ein Feld,
 *    daneben „9 Jahre / Berufserfahrung". Keine Pille, die nichts öffnet.
 *  - „Das Profil an sich muss abgeschlossen sein in sich": beige Fläche, unten „Profil
 *    ansehen ›". Überschrift („Neue Bewerbung") und Angebot stehen AUSSERHALB, in der Karte
 *    drumherum.
 * Die ganze Fläche öffnet das Profil (Clarity 07.09.: tote Klicks auf Name und Stufe).
 */
/** Deutsch als drei Punkte (Profil „V"); auch in den Zeilen des Kompakt-Einstiegs. */
export const DeutschPunkte: FC<{ punkte: number }> = ({ punkte }) => (
  <span className="inline-flex gap-[3px]" aria-hidden="true">
    {[1, 2, 3].map((i) => (
      <span key={i} className={`w-[9px] h-[9px] rounded-full ${i <= punkte ? 'bg-pm-taupe' : 'bg-pm-profil-linie'}`} />
    ))}
  </span>
);

export const PflegekraftProfil: FC<{
  nurse: Nurse;
  onProfil: () => void;
  /** Tipp auf die Stufe: Profil mit geöffneter Erklärung (sonst normales Profil). */
  onStufeClick?: () => void;
}> = ({ nurse: ausListe, onProfil, onStufeClick }) => {
  const nurse = useEinsatzStand(ausListe);
  const name = displayName(nurse.name);
  const einsaetze = nurse.history?.assignments ?? 0;
  const jahre = nurse.experienceYears ?? 0;
  const stufe = nurseLevel(jahre, einsaetze).label;
  const stern = stufe === 'Elite' || stufe === 'Stammkraft';
  const deutsch = nurse.language?.level;
  const punkte = nurse.language?.bars ?? 0;

  const felder: { wert: string; label: string; stufe?: boolean }[] = [
    einsaetze > 0
      ? { wert: stufe, label: `${einsaetze} ${einsaetze === 1 ? 'Einsatz' : 'Einsätze'} bei uns`, stufe: true }
      // Gerade woanders im Einsatz (Registry #127): nicht „Neu bei uns" behaupten.
      : nurse.onOtherJob
        ? { wert: 'Im Einsatz', label: 'bei einem anderen Kunden' }
        : { wert: 'Neu bei uns', label: 'erster Einsatz bei uns' },
  ];
  if (jahre > 0) felder.push({ wert: `${jahre} ${jahre === 1 ? 'Jahr' : 'Jahre'}`, label: 'Berufserfahrung' });

  const tastatur = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onProfil(); }
  };
  const stufeTipp = (e: MouseEvent) => {
    if (!onStufeClick) return;
    e.stopPropagation();
    onStufeClick();
  };

  // ENTWURF 14.11.2026 (Martin: „überall angleichen … immer die, die wir jetzt haben, mit dem Foto, mit den 3 Infos“): derselbe
  // Kopf wie die Zeile der Liste (PflegekraftZeile in EinstiegMinimal.tsx): rundes Foto 72 px, „Vorname, Alter“, Erfahrung,
  // Deutsch, Pfeil. Ohne Stufe („Elite“), ohne „Einsätze bei uns“ und ohne „Profil ansehen“ (Martin: „das versteht kein Mensch“).
  void stufeTipp; void felder; void stern;
  const vorname = nurse.name.split(' ')[0] || nurse.name;
  const fakten = [jahre > 0 ? (jahre === 1 ? '1 Jahr Erfahrung' : `${jahre} Jahre Erfahrung`) : null, deutsch && deutsch !== '—' ? `Deutsch ${deutsch}` : null].filter(Boolean) as string[];
  const foto = 'h-[72px] w-[72px] flex-none rounded-full ring-1 ring-pm-line';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onProfil(); }}
      onKeyDown={tastatur}
      aria-label={`Profil von ${name} ansehen`}
      className="flex cursor-pointer select-none items-center gap-4 py-1 active:brightness-[.98]"
      data-testid="pflegekraft-profil"
    >
      {nurse.image ? (
        <img src={nurse.image} alt="" className={`${foto} bg-pm-grund object-cover`} />
      ) : (
        <span aria-hidden="true" className={`${foto} flex items-center justify-center text-[18px] font-bold text-white`} style={{ backgroundColor: nurse.color }}>
          {initials(nurse.name).slice(0, 2)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[18px] font-semibold leading-6 text-pm-ink">
          {vorname}
          {nurse.age ? <span className="font-normal text-pm-muted">, {nurse.age}</span> : null}
        </span>
        {fakten.map((teil) => (
          <span key={teil} className="mt-0.5 block text-[16px] leading-[22px] text-pm-ink">{teil}</span>
        ))}
      </span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 flex-none text-pm-muted" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
    </div>
  );
};
