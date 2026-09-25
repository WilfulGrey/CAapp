// Die beiden Pop-ups der Angebotsseite (Portal-Redesign Teil 3, Martin 24.09.2026).
//   BestpreisSheet: eigenes Pop-up statt Link auf kostenrechner.primundus.de/bestpreisgarantie,
//                   Wortlaut aus src/lib/garantie.ts (freigegeben 12.09.).
//   WarumSheet:     „Warum erst die Pflegesituation?" — hinter „Warum? Mehr" und hinter dem
//                   Einladen-Knopf mit Schloss, solange die Pflegesituation fehlt.
import { useState } from 'react';
import { Check, ChevronDown, Phone, ShieldCheck } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { GARANTIE_PORTAL } from '../../lib/garantie';
import { BERATERIN, TELEFON_HREF, WHATSAPP_HREF } from '../../lib/kontakt';
import { WhatsAppIcon } from './WhatsAppIcon';

function Punkt({ children }: { children: string }) {
  return (
    <li className="flex gap-2.5 py-1.5 text-[15px] leading-[1.45]">
      <Check className="w-4 h-4 mt-[3px] flex-none text-pm-green" strokeWidth={3} aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

export function BestpreisSheet({ offen, onClose }: { offen: boolean; onClose: () => void }) {
  const [vergleichbar, setVergleichbar] = useState(false);
  return (
    <Sheet
      offen={offen}
      titel={GARANTIE_PORTAL.titel}
      onClose={onClose}
      icon={(
        <span className="w-11 h-11 rounded-full bg-pm-green text-white flex items-center justify-center flex-none" aria-hidden="true">
          <ShieldCheck className="w-6 h-6" />
        </span>
      )}
      fuss={(
        <>
          <p className="mb-2.5 text-[14px] text-pm-muted">Angebot vorlegen bei {BERATERIN}:</p>
          <div className="grid grid-cols-2 gap-2.5">
            <Button href={TELEFON_HREF} variante="sekundaer" groesse="sm" className="text-pm-ink">
              <Phone className="w-4 h-4" aria-hidden="true" />Anrufen
            </Button>
            <Button
              href={WHATSAPP_HREF}
              target="_blank"
              rel="noreferrer"
              variante="whatsapp"
              groesse="sm"
            >
              <WhatsAppIcon className="w-4 h-4" />WhatsApp
            </Button>
          </div>
          <Button variante="link" breit onClick={onClose} className="mt-2">Schließen</Button>
        </>
      )}
    >
      <p className="text-[16px] font-bold leading-[1.45] text-pm-ink">{GARANTIE_PORTAL.zusage}</p>
      <p className="mt-2">{GARANTIE_PORTAL.ablauf}</p>
      <p className="mt-2 text-[14.5px] text-pm-muted">{GARANTIE_PORTAL.warum}</p>
      <div className="mt-4 border-y border-pm-line-soft">
        <button
          type="button"
          onClick={() => setVergleichbar(v => !v)}
          aria-expanded={vergleichbar}
          className="w-full min-h-[48px] flex items-center justify-between gap-3 text-left text-[15px] font-bold text-pm-ink"
        >
          {GARANTIE_PORTAL.aufklappen}
          <ChevronDown className={`w-5 h-5 flex-none text-pm-taupe transition-transform ${vergleichbar ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {vergleichbar && (
          <ul className="pb-3">
            {GARANTIE_PORTAL.bedingungen.map(b => <Punkt key={b}>{b}</Punkt>)}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

export function WarumSheet({ offen, onClose, onVervollstaendigen }: {
  offen: boolean;
  onClose: () => void;
  onVervollstaendigen: () => void;
}) {
  return (
    <Sheet
      offen={offen}
      titel="Warum erst die Pflegesituation?"
      onClose={onClose}
      fuss={(
        <>
          <Button breit onClick={() => { onClose(); onVervollstaendigen(); }} className="px-2 whitespace-nowrap">
            Bewerbungen anfragen
          </Button>
          <Button variante="link" breit onClick={onClose} className="mt-2">Schließen</Button>
        </>
      )}
    >
      <p>Die Pflegekräfte entscheiden anhand Ihrer Angaben, ob sie zu Ihnen passen und wann sie anreisen können. Zum Beispiel:</p>
      <ul className="mt-1">
        <Punkt>Pflegegrad, Mobilität und Demenz</Punkt>
        <Punkt>Einsätze in der Nacht</Punkt>
        <Punkt>Wohnort, Unterbringung und Startdatum</Punkt>
      </ul>
      <p className="mt-2">Ohne diese Angaben kann sich niemand bewerben. Das Ausfüllen dauert etwa 2 Minuten.</p>
    </Sheet>
  );
}
