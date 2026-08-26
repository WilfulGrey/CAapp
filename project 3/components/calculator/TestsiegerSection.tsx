export function TestsiegerSection() {
  return (
    // id = Sprungziel des Siegels im mobilen Hero (app/page.tsx). Die
    // content-checkliste verlangt zur Auszeichnung einen Beleg-Link; das
    // Original-PDF haengt in dieser Sektion.
    <section id="testsieger" className="scroll-mt-24 py-14 md:py-16 lg:py-20 px-5 bg-[#F8F7F5]">
      <div className="max-w-[560px] md:max-w-[700px] lg:max-w-[1000px] mx-auto">
        <div className="bg-white border-2 border-[#D4A843] rounded-2xl p-7 md:p-9 lg:p-10 relative">
          <div className="absolute top-[-14px] left-1/2 -translate-x-1/2 bg-[#D4A843] text-white px-6 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide whitespace-nowrap shadow-md z-10">
            ★ 6× Testsieger
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center lg:gap-8 text-center lg:text-left mt-4">
            {/* Badge + Beleg-Link zeigen auf die Original-Veröffentlichung
                (DIE WELT / ServiceValue 10/2021, primundus.de Nr. 1 im
                Ranking Pflegekräfte-Vermittler) — PDF liegt lokal unter
                /downloads, kein externer Host. */}
            <a
              href="/downloads/die-welt-service-champions-2021.pdf"
              target="_blank"
              rel="noopener"
              className="w-40 h-40 mx-auto lg:mx-0 mb-5 lg:mb-0 flex items-center justify-center flex-shrink-0"
              aria-label="Original-Veröffentlichung Service-Champions 2021 als PDF öffnen"
            >
              <img
                src="/images/primundus_testsieger-2021.webp"
                alt="Testsieger 2021"
                className="w-40 h-40 object-contain"
              />
            </a>

            {/* Texte 2026-08-14 mit Martin abgestimmt: keine Prozentzahl;
                "Nr. 1 der Pflegekräfte-Vermittler" ist der wörtliche
                Siegel-Claim; das Preis/Qualität-Statement ist bewusst KEIN
                Zitat (steht so nicht in der Veröffentlichung), sondern
                eigene Aussage — deshalb ohne Anführungszeichen/Kursiv. */}
            <div className="flex-1">
              <h3 className="text-[22px] font-bold text-[#3D3D3D] mb-2">
                6× Testsieger bei DIE WELT
              </h3>

              <p className="text-[16px] text-[#8A8279] mb-4">
                Nr. 1 der Pflegekräfte-Vermittler – ausgezeichnet in Deutschlands großer Service-Studie von DIE WELT und ServiceValue
              </p>

              <p className="text-[16px] text-[#5A5A5A] leading-relaxed lg:px-0 px-2">
                Als bester Vermittler von 24-Stunden-Pflegekräften ausgezeichnet: Primundus steht für die beste Kombination aus Preis, Qualität und Kundenservice.
              </p>

              <a
                href="/downloads/die-welt-service-champions-2021.pdf"
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 mt-4 text-[16px] font-semibold text-[#8B7355] hover:text-[#6B5738] underline underline-offset-2 transition-colors"
              >
                Original-Veröffentlichung ansehen (PDF)
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
