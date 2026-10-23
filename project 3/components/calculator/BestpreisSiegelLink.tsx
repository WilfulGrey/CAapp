"use client";

import { GARANTIE } from "@/lib/kraefte-vorschau";

/** Name des Fensterereignisses, mit dem Seitenteile außerhalb des Wizards das Garantie-Pop-up öffnen. */
export const GARANTIE_OEFFNEN_EVENT = "bestpreisgarantie:oeffnen";

/**
 * Das Siegel im Hero-Bild (Martin 12.09.: „ich will das auf der Website
 * sehen"). Ein Klick öffnet das kompakte Pop-up im Wizard (Martin: „das war
 * doch schon top") — nicht die Seite. Der href bleibt als Fallback ohne JS
 * und für Suchmaschinen.
 */
export function BestpreisSiegelLink({ className }: { className?: string }) {
  return (
    <a
      href="/bestpreisgarantie"
      className={className}
      aria-label="Primundus Bestpreisgarantie — mehr Infos"
      aria-haspopup="dialog"
      onClick={(e) => {
        e.preventDefault();
        window.dispatchEvent(new Event(GARANTIE_OEFFNEN_EVENT));
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={GARANTIE.siegelSrc}
        alt={GARANTIE.siegelAlt}
        width={900}
        height={256}
        className="block h-auto w-full drop-shadow-[0_2px_10px_rgba(0,0,0,0.25)]"
      />
    </a>
  );
}
