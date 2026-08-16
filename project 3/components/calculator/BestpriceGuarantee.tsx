export function BestpriceGuarantee() {
  return (
    <section className="py-14 px-5 bg-white">
      <div className="max-w-[560px] md:max-w-[700px] lg:max-w-[1000px] mx-auto">
        <div className="bg-gradient-to-br from-[#FAF8F5] to-[#F2EDE6] border-2 border-[#E5DFD6] rounded-2xl p-8 relative">
          <div className="absolute top-[-14px] left-1/2 -translate-x-1/2 bg-[#5C9F6E] text-white px-6 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide whitespace-nowrap shadow-md z-10">
            ★ 100% Sorgenfrei
          </div>

          <div className="relative flex flex-col lg:flex-row lg:items-start lg:gap-6 mt-4">
            <div className="w-14 h-14 bg-[#708A95] rounded-2xl flex items-center justify-center mb-4 lg:mb-0 flex-shrink-0">
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>

            <div className="flex-1">
              <h3 className="text-[22px] font-bold text-[#3D3D3D] mb-3">
                100 % sorgenfrei
              </h3>
              <p className="text-[16px] leading-relaxed text-[#5A5A5A]">
                Überlassen Sie die Betreuung nicht dem Zufall. Vertrauen Sie auf über 20 Jahre Erfahrung aus mehr als 60.000 Betreuungen – mit einem 100 % sorgenfreien Modell: Bestpreis-Garantie, täglich kündbar, taggenaue Abrechnung und Kosten erst, wenn die Betreuungskraft tatsächlich bei Ihnen ankommt.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
