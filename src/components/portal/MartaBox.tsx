// Marta-Kasten am Ende der Angebotsseite (Portal-Redesign Teil 3), wie auf primundus.de und in
// den Mails: Foto, Name, Zeiten, runde Knöpfe für Anrufen und WhatsApp, daneben das
// Testsieger-Siegel (Martin 17.09.: „das Siegel immer bei ihr wie in den Mails") und die
// Sterne-Zeile aus primundus.de/api/bewertungen-stand. Ohne Stand keine Sterne-Zeile.
// Die Presselogo-Zeile „Bekannt aus" entfällt (Entwurf v4).
import { Phone } from 'lucide-react';
import { BERATERIN, ERREICHBAR, TELEFON, TELEFON_HREF, WHATSAPP_HREF } from '../../lib/kontakt';
import { anzahlText, ERFAHRUNGEN_URL, sternFuellung, type SterneStand } from '../../lib/sterne';
import { WhatsAppIcon } from './WhatsAppIcon';

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

export function MartaBox({ sterne }: { sterne: SterneStand | null }) {
  return (
    <div className="rounded-card bg-white border border-[#EFEBE4] p-[18px]">
      <p className="text-[15px] font-bold text-pm-ink">Noch Fragen?</p>
      <div className="mt-3 flex items-center gap-3">
        <img src="/marta-kapcio.jpg" alt={BERATERIN} className="w-[52px] h-[52px] rounded-full object-cover object-top flex-none" />
        <div className="flex-1 min-w-0 leading-[1.35]">
          <p className="text-[16.5px] font-bold text-pm-ink">{BERATERIN}</p>
          <p className="text-[13.5px] text-pm-muted">Ihre Beraterin · {ERREICHBAR}</p>
        </div>
        <a
          href={TELEFON_HREF}
          aria-label={`${BERATERIN} anrufen: ${TELEFON}`}
          className="w-12 h-12 rounded-full border border-pm-line bg-white text-pm-ink flex items-center justify-center flex-none hover:border-pm-taupe"
        >
          <Phone className="w-5 h-5" aria-hidden="true" />
        </a>
        <a
          href={WHATSAPP_HREF}
          target="_blank"
          rel="noreferrer"
          aria-label={`${BERATERIN} per WhatsApp schreiben`}
          className="w-12 h-12 rounded-full bg-pm-whatsapp text-white flex items-center justify-center flex-none hover:bg-[#1FBA59]"
        >
          <WhatsAppIcon className="w-[22px] h-[22px]" />
        </a>
      </div>
      <div className="mt-4 pt-3.5 border-t border-pm-line-soft flex items-center gap-3">
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
    </div>
  );
}
