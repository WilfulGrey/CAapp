// Marta-Kasten am Ende der Angebotsseite (Portal-Redesign Teil 3), wie auf primundus.de und in
// den Mails: Foto, Name, Zeiten, runde Knöpfe für Anrufen und WhatsApp, daneben das
// Testsieger-Siegel (Martin 17.09.: „das Siegel immer bei ihr wie in den Mails") und die
// Sterne-Zeile aus primundus.de/api/bewertungen-stand. Ohne Stand keine Sterne-Zeile.
// Die Presselogo-Zeile „Bekannt aus" entfällt (Entwurf v4).
//
// Prototyp 14.10.2026 (Gebucht-Kontakt): Personenzeile und Knopfklassen als eigene Bausteine
// exportiert, damit der Kontaktbereich oben im Gebucht-Bildschirm DIESELBEN Knöpfe nutzt
// (Martin 19.09.: „Fang doch nicht an, irgendwelche Dinge zu entwickeln"). Ausgabe von MartaBox
// unverändert.
import type { ReactNode } from 'react';
import { Phone } from 'lucide-react';
import { BERATERIN, ERREICHBAR, TELEFON, TELEFON_HREF, WHATSAPP_HREF } from '../../lib/kontakt';
import { anzahlText, ERFAHRUNGEN_URL, sternFuellung, type SterneStand } from '../../lib/sterne';
import { WhatsAppIcon } from './WhatsAppIcon';

/** Runder Anruf-Knopf (48 px), wie im Marta-Kasten. */
export const KNOPF_ANRUFEN =
  'w-12 h-12 rounded-full border border-pm-line bg-white text-pm-ink flex items-center justify-center flex-none hover:border-pm-taupe';
/** Runder WhatsApp-Knopf (48 px), wie im Marta-Kasten. */
export const KNOPF_WHATSAPP =
  'w-12 h-12 rounded-full bg-pm-whatsapp text-white flex items-center justify-center flex-none hover:bg-[#1FBA59]';

function Sterne({ wert }: { wert: number }) {
  return (
    <span className="inline-flex gap-px" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => {
        const anteil = Math.round(sternFuellung(wert, i) * 100);
        return (
          <span
            key={i}
            className="text-[15px] leading-none"
            style={{ background: `linear-gradient(90deg,#D4A843 ${anteil}%,#E5E3DF ${anteil}%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
          >★</span>
        );
      })}
    </span>
  );
}

/**
 * Foto, Name, eine Unterzeile und die runden Knöpfe Anrufen/WhatsApp — eine Zeile des Marta-Kastens.
 * `eng` (Kontaktbereich oben, Prototyp 14.10.): unter 375 px Foto 48 statt 52 px, 8 statt 12 px zwischen den Knöpfen und
 * 10 statt 12 px neben dem Text.
 * Gemessen bei 360 px: sonst bleiben dem Namen 94 px, „Marta Kapcio" braucht 108 px und bricht um. Knöpfe bleiben 48 px.
 */
export function MartaZeile({ unterzeile, className = '', eng = false, ohneAnrufen = false }: {
  unterzeile: ReactNode; className?: string; eng?: boolean;
  /** Außerhalb der Erreichbarkeit Anrufen ausgegraut und nicht antippbar (Minimal-Einstieg, Registry #147; Martin 08.11.: „nicht
   *  den Button wegnehmen … sondern einfach nur rausgrauen“). */
  ohneAnrufen?: boolean;
}) {
  const knoepfe = (<>
      {ohneAnrufen ? (
      <span aria-disabled="true" aria-label={`${BERATERIN} anrufen: außerhalb der Geschäftszeiten`} className={`${KNOPF_ANRUFEN} cursor-not-allowed text-pm-line hover:border-pm-line`} data-anrufen-aus>
        <Phone className="w-5 h-5" aria-hidden="true" />
      </span>
      ) : (
      <a
        href={TELEFON_HREF}
        aria-label={`${BERATERIN} anrufen: ${TELEFON}`}
        className={KNOPF_ANRUFEN}
      >
        <Phone className="w-5 h-5" aria-hidden="true" />
      </a>
      )}
      <a
        href={WHATSAPP_HREF}
        target="_blank"
        rel="noreferrer"
        aria-label={`${BERATERIN} per WhatsApp schreiben`}
        className={KNOPF_WHATSAPP}
      >
        <WhatsAppIcon className="w-[22px] h-[22px]" />
      </a>
  </>);
  return (
    <div className={`${className} flex items-center gap-3${eng ? ' max-[374px]:gap-2.5' : ''}`.trim()}>
      <img src="/marta-kapcio.jpg" alt={BERATERIN} className={`w-[52px] h-[52px] rounded-full object-cover object-top flex-none${eng ? ' max-[374px]:w-12 max-[374px]:h-12' : ''}`} />
      <div className="flex-1 min-w-0 leading-[1.35]">
        <p className="text-[16.5px] font-bold text-pm-ink">{BERATERIN}</p>
        <p className="text-[13.5px] text-pm-muted">{unterzeile}</p>
      </div>
      {eng ? <div className="flex flex-none items-center gap-3 max-[374px]:gap-2">{knoepfe}</div> : knoepfe}
    </div>
  );
}

/** `ohneVertrauen` (Look „angebot", Runde 27): ohne Siegel und Sterne — die stehen dort oben, getrennt (Martin zu Fassung 20:
 *  „die Sterne passen da nicht dazu … als würde das zusammengehören").
 *  `nurVertrauen` (Prototyp Gebucht-Kontakt 14.10.): nur Siegel und Sterne, ohne „Noch Fragen?" und Personenzeile — für den Fall,
 *  dass Marta mit denselben Knöpfen schon oben auf der Seite steht (Entscheidung 5 offen).
 *  `erreichbar` (Minimal-Einstieg, Registry #147): `false` = außerhalb von 8–20 Uhr, dann Anrufen ausgegraut und darunter
 *  `hinweisAusserhalb`. Ohne Angabe wie bisher. */
export function MartaBox({ sterne, ohneVertrauen = false, nurVertrauen = false, erreichbar, hinweisAusserhalb, titel = 'Noch Fragen?' }: { sterne: SterneStand | null; ohneVertrauen?: boolean; nurVertrauen?: boolean; erreichbar?: boolean; hinweisAusserhalb?: string; /** Überschrift (Standard „Noch Fragen?“). */ titel?: string }) {
  return (
    <div className="rounded-card bg-white border border-[#EFEBE4] p-[18px]">
      {!nurVertrauen && (<>
      <p className="text-[15px] font-bold text-pm-ink">{titel}</p>
      <MartaZeile className="mt-3" unterzeile={<>Ihre Beraterin · {ERREICHBAR}</>} ohneAnrufen={erreichbar === false} />
      {erreichbar === false && hinweisAusserhalb && <p className="mt-2.5 text-[13.5px] leading-snug text-pm-muted">{hinweisAusserhalb}</p>}
      </>)}
      {!ohneVertrauen && (<>
      <div className={`${nurVertrauen ? '' : 'mt-4 pt-3.5 border-t border-pm-line-soft '}flex items-center gap-3`}>
        <img src="/badge-testsieger.webp" alt="Testsieger DIE WELT" className="h-12 w-auto flex-none object-contain" />
        <p className="leading-[1.3]">
          <b className="text-[15px] text-pm-ink">6× Testsieger</b><br />
          <span className="text-[13px] font-bold text-pm-taupe">DIE WELT</span>
          <span className="text-[13px] text-pm-muted"> · Preis &amp; Qualität</span>
        </p>
      </div>
      {sterne && (
        <a
          href={ERFAHRUNGEN_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 text-[14px] text-pm-muted"
        >
          <Sterne wert={sterne.wert} />
          <b className="text-pm-ink">{sterne.schnitt}</b> · <span className="underline underline-offset-2">{anzahlText(sterne.anzahl)}</span>
        </a>
      )}
      </>)}
    </div>
  );
}
