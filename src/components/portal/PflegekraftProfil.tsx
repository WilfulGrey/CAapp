import type { FC, KeyboardEvent, MouseEvent } from 'react';
import type { Nurse } from '../../types';
import { displayName, initials, nurseLevel } from './shared';

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
}> = ({ nurse, onProfil, onStufeClick }) => {
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

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onProfil(); }}
      onKeyDown={tastatur}
      aria-label={`Profil von ${name} ansehen`}
      className="rounded-[16px] bg-pm-profil cursor-pointer select-none active:brightness-[.98]"
      data-testid="pflegekraft-profil"
    >
      <div className="flex items-center gap-3.5 px-4 pt-4 pb-3.5">
        {nurse.image ? (
          <img src={nurse.image} alt={nurse.name} className="w-20 h-20 flex-none rounded-[14px] border-[3px] border-white object-cover" />
        ) : (
          <div className="w-20 h-20 flex-none rounded-[14px] border-[3px] border-white flex items-center justify-center text-2xl font-bold text-white"
            style={{ backgroundColor: nurse.color }}>
            {initials(nurse.name)}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[19px] font-extrabold leading-tight text-[#18181B]">
            {name}
            {nurse.age ? <span className="font-normal text-pm-mute">, {nurse.age}</span> : null}
          </p>
          {deutsch && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[15px] text-pm-muted">
              {punkte > 0 && <DeutschPunkte punkte={punkte} />}
              Deutsch {deutsch.toLowerCase()}
            </p>
          )}
        </div>
      </div>

      <div className={`grid ${felder.length > 1 ? 'grid-cols-2 divide-x divide-pm-profil-linie' : 'grid-cols-1'} border-t border-pm-profil-linie`}>
        {felder.map((f) => (
          <div key={f.label} className="px-1.5 py-3 text-center" onClick={f.stufe ? stufeTipp : undefined}>
            <p className="text-[15.5px] font-extrabold leading-snug text-pm-ink whitespace-nowrap">
              {f.stufe && stern && <span className="text-pm-stern" aria-hidden="true">★&nbsp;</span>}
              {f.wert}
            </p>
            <p className="text-[13px] leading-snug text-pm-muted whitespace-nowrap">{f.label}</p>
          </div>
        ))}
      </div>

      <p className="border-t border-pm-profil-linie py-2.5 text-center text-[14.5px] font-bold text-pm-taupe-ink">
        Profil ansehen&nbsp;›
      </p>
    </div>
  );
};
