'use client';

export function FinalCTA() {
  const scrollToCalculator = () => {
    const el = document.getElementById('calculator-form'); if (el) { window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 90, behavior: 'smooth' }); }
  };

  return (
    <section className="py-16 px-5 bg-[#8B7355]">
      <div className="max-w-[640px] mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-[26px] leading-[1.25] font-bold text-white mb-2">
            Jetzt Kosten & Pflegekräfte ansehen
          </h2>
          <p className="text-base text-white/90 leading-relaxed mb-7">
            In 2 Minuten sehen Sie Ihr Angebot & passende Pflegekräfte – inkl. Finanzierungsmöglichkeiten.
          </p>
        </div>

        <div className="flex flex-col items-center gap-6">
          <button
            onClick={scrollToCalculator}
            className="inline-flex items-center gap-2 px-8 py-4 bg-[#E76F63] hover:bg-[#D65E52] text-white rounded-full text-base md:text-lg font-bold shadow-lg hover:shadow-xl transition-all duration-200"
          >
            Kosten & Pflegekräfte ansehen
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <div className="flex items-center gap-2 text-white/90">
            <svg
              className="w-5 h-5 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 12l2 2 4-4" />
              <circle cx="12" cy="12" r="10" />
            </svg>
            <span className="text-[15px] font-medium">100% kostenfrei & unverbindlich</span>
          </div>

          <div className="w-full max-w-[480px] border-t border-white/20 my-2"></div>

          <div className="flex flex-col items-center gap-3 w-full max-w-[340px]">
            <p className="text-white/70 text-[13px]">Lieber direkt Kontakt aufnehmen?</p>
            <a
              href="tel:+4989200000830"
              className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors border border-white/20"
            >
              <svg className="w-4 h-4 text-white flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
              <span className="text-white font-semibold text-[15px]">089 200 000 830</span>
            </a>
            <a
              href={`https://wa.me/4989200000830?text=${encodeURIComponent("Hallo Frau Wysocki, ich habe eine Rückfrage:")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-full bg-[#25D366] hover:bg-[#20C05A] transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0 text-white" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              <span className="text-white font-semibold text-[15px]">WhatsApp schreiben</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
