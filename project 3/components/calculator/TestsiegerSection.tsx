export function TestsiegerSection() {
  return (
    <section className="py-14 md:py-16 lg:py-20 px-5 bg-[#F8F7F5]">
      <div className="max-w-[560px] md:max-w-[700px] lg:max-w-[1000px] mx-auto">
        <div className="bg-white border-2 border-[#D4A843] rounded-2xl p-7 md:p-9 lg:p-10 relative">
          <div className="absolute top-[-14px] left-1/2 -translate-x-1/2 bg-[#D4A843] text-white px-6 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide whitespace-nowrap shadow-md z-10">
            ★ Testsieger
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

            <div className="flex-1">
              <h3 className="text-[22px] font-bold text-[#3D3D3D] mb-2">
                Testsieger bei DIE WELT
              </h3>

              <p className="text-[14px] text-[#8A8279] mb-4">
                Deutschlands größter Vergleichstest für 24-Stunden-Pflege
              </p>

              <p className="text-[15px] italic text-[#5A5A5A] leading-relaxed lg:px-0 px-2">
                „Primundus überzeugte mit der besten Kombination aus Preis, Qualität und Kundenservice."
              </p>

              <a
                href="/downloads/die-welt-service-champions-2021.pdf"
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 mt-4 text-[14px] font-semibold text-[#8B7355] hover:text-[#6B5738] underline underline-offset-2 transition-colors"
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
