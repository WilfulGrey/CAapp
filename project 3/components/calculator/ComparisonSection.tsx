'use client';

export function ComparisonSection() {
  const scrollToCalculator = () => {
    const el = document.getElementById('calculator-form'); if (el) { window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 90, behavior: 'smooth' }); }
  };

  return (
    <section id="kostenvergleich" className="bg-white py-16 md:py-20 scroll-mt-20">
      <div className="w-full max-w-[520px] md:max-w-[720px] lg:max-w-[1080px] mx-auto px-5">
        <div className="text-center mb-12">
          <p className="text-xs md:text-sm font-bold uppercase tracking-wider text-[#A89279] mb-2">
            Kostenvergleich
          </p>
          <h2 className="text-[26px] md:text-[32px] lg:text-[36px] leading-[1.25] font-bold text-[#3D3D3D] mb-4">
            24h-Pflege vs. Pflegeheim
          </h2>
          <p className="text-[15px] md:text-[17px] text-[#5A5A5A] max-w-2xl mx-auto">
            Die 24-Stunden-Betreuung zu Hause ist nicht nur persönlicher, sondern auch deutlich günstiger als ein Pflegeheimplatz.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Pflegeheim */}
          <div className="bg-[#F8F7F5] rounded-2xl p-8 border-2 border-[#E5E3DF]">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-[#E5E3DF] rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-[#5A5A5A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-[#3D3D3D] mb-2">Pflegeheim</h3>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-[#C85A54] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-[15px] text-[#5A5A5A]">Fremde Umgebung</span>
              </div>
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-[#C85A54] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-[15px] text-[#5A5A5A]">Geteiltes Zimmer möglich</span>
              </div>
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-[#C85A54] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-[15px] text-[#5A5A5A]">Feste Besuchszeiten</span>
              </div>
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-[#C85A54] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-[15px] text-[#5A5A5A]">Standardisierte Abläufe</span>
              </div>
            </div>

            <div className="border-t-2 border-[#E5E3DF] pt-6">
              <div className="text-center">
                <p className="text-sm text-[#5A5A5A] mb-2">Durchschnittlicher Eigenanteil pro Monat:</p>
                <p className="text-4xl font-bold text-[#C85A54]">3.245 €</p>
              </div>
            </div>
          </div>

          {/* 24h-Pflege */}
          <div className="bg-[#E8EEF1] rounded-2xl p-8 border-2 border-[#708A95] relative">
            <div className="absolute -top-3 right-6 bg-[#708A95] text-white text-xs font-bold px-4 py-1 rounded-full">
              EMPFOHLEN
            </div>

            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-[#708A95] rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-[#708A95] mb-2">24h-Pflege zu Hause</h3>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-[#708A95] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-[15px] text-[#3D3D3D]">Im gewohnten Zuhause bleiben</span>
              </div>
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-[#708A95] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-[15px] text-[#3D3D3D]">1:1 Betreuung rund um die Uhr</span>
              </div>
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-[#708A95] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-[15px] text-[#3D3D3D]">Familie bleibt in der Nähe</span>
              </div>
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-[#708A95] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-[15px] text-[#3D3D3D]">Individuelle Tagesgestaltung</span>
              </div>
            </div>

            <div className="border-t-2 border-[#708A95] pt-6">
              <div className="text-center">
                <p className="text-sm text-[#3D3D3D] mb-2">Durchschnittlicher Eigenanteil pro Monat:</p>
                <p className="text-4xl font-bold text-[#708A95]">1.500 €</p>
                <p className="text-sm font-semibold text-[#708A95] mt-2">
                  Bis zu 2.000 € günstiger!
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-[#5A5A5A] max-w-2xl mx-auto mb-6">
            <strong className="font-semibold text-[#3D3D3D]">Hinweis:</strong> Die Kosten können je nach Pflegegrad und Region variieren.
            Mit unserem Kostenrechner erhalten Sie eine individuelle Berechnung für Ihre Situation.
          </p>

          <button
            onClick={scrollToCalculator}
            className="inline-flex items-center gap-2 px-8 py-4 bg-[#E76F63] hover:bg-[#D65E52] text-white font-bold text-base md:text-lg rounded-full transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            Kosten & Pflegekräfte ansehen
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
