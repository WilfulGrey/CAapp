/** Testsieger-Karte (Registry #155: steht mit der Bestpreisgarantie im Abschnitt #testsieger, BestpriceGuarantee.tsx).
 *  Die content-checkliste verlangt zur Auszeichnung einen Beleg-Link; das Original-PDF hängt in der Karte.
 *  ENTWURF 16.11.2026: Kopfzeile wie primundus.de (VertrauensKarten): Siegel links, Titel und Zeile daneben, darunter der
 *  Text. Vorher stand das Siegel allein in einem 160 px hohen Feld über dem Titel, die Karte wirkte am Computer leer.
 *  Wortlaut unverändert. */
export function TestsiegerKarte() {
  return (
    <div className="relative rounded-[20px] bg-white p-7 md:p-9">
      <div className="absolute top-[-14px] left-7 z-10 whitespace-nowrap rounded-full bg-[#D4A843] px-4 py-1.5 text-sm font-bold uppercase tracking-wide text-white shadow-md min-[360px]:px-6 md:left-9">
        ★ Testsieger · 6× in Folge
      </div>

      <div className="mt-3 flex items-start gap-5">
        <a
          href="/downloads/die-welt-service-champions-2021.pdf"
          target="_blank"
          rel="noopener"
          className="flex-none"
          aria-label="Original-Veröffentlichung Service-Champions als PDF öffnen"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/primundus_testsieger-2021.webp" alt="Testsieger DIE WELT" className="h-[104px] w-auto rounded-[4px] shadow-[0_2px_10px_rgba(0,0,0,0.18)]" />
        </a>
        <div className="min-w-0">
          <h3 className="text-[21px] font-bold leading-snug text-[#1C1C1C]">6× Testsieger</h3>
          <p className="mt-1.5 text-[15px] leading-[1.5] text-[#6B6B6B]">
            Nr. 1 der Pflegekräfte-Vermittler – ausgezeichnet in Deutschlands großer Service-Studie von DIE WELT und ServiceValue
          </p>
        </div>
      </div>

      <p className="mt-5 text-[16px] leading-[1.6] text-[#2E2E2E]">
        DIE WELT hat Primundus sechsmal in Folge ausgezeichnet: Primundus steht für die beste Kombination aus Preis, Qualität und Kundenservice.
      </p>
      <a
        href="/downloads/die-welt-service-champions-2021.pdf"
        target="_blank"
        rel="noopener"
        className="mt-4 inline-flex items-center gap-1.5 text-[16px] font-semibold text-[#8B7355] underline underline-offset-2 transition-colors hover:text-[#6B5738]"
      >
        Original-Veröffentlichung ansehen (PDF)
      </a>
    </div>
  );
}
