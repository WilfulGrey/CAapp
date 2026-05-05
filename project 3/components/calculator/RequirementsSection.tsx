'use client';

export function RequirementsSection() {
  const requirements = [
    {
      title: 'Eigenes Zimmer',
      description: 'Die Betreuungskraft benötigt ein eigenes, abschließbares Zimmer mit Bett.',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      )
    },
    {
      title: 'Grundausstattung',
      description: 'Küche, Bad/WC und Internetanschluss sollten vorhanden sein.',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      )
    },
    {
      title: 'Mobilität',
      description: 'Ihr Angehöriger sollte noch eine gewisse Grundmobilität haben (z.B. mit Unterstützung gehen können).',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      )
    },
    {
      title: 'Keine Intensivpflege',
      description: 'Medizinische Behandlungspflege muss durch ambulante Pflegedienste erfolgen.',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    }
  ];

  const scrollToCalculator = () => {
    const el = document.getElementById('calculator-form'); if (el) { window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 90, behavior: 'smooth' }); }
  };

  return (
    <section className="bg-white py-12 md:py-16 lg:py-20">
      <div className="container mx-auto px-6 max-w-5xl">
        <div className="text-center mb-10 md:mb-14">
          <p className="text-xs md:text-sm font-bold uppercase tracking-wider text-[#A89279] mb-2">
            Voraussetzungen
          </p>
          <h2 className="text-[28px] md:text-[36px] lg:text-[42px] leading-[1.2] font-bold text-[#3D3D3D] mb-6">
            Ist 24-Stunden-Pflege für Sie geeignet?
          </h2>
          <p className="text-base md:text-lg text-[#5A5A5A] leading-relaxed max-w-3xl mx-auto">
            Die meisten Familien erfüllen die Voraussetzungen problemlos. Prüfen Sie selbst, ob die 24-Stunden-Betreuung für Ihre Situation passt:
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-10">
          {requirements.map((requirement, index) => (
            <div
              key={index}
              className="bg-gradient-to-br from-[#F8F7F5] to-white rounded-xl p-6 border border-[#E5E3DF] hover:shadow-md transition-shadow duration-200"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[#708A95] flex items-center justify-center">
                  <div className="text-white">
                    {requirement.icon}
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-[#3D3D3D] mb-2">
                    {requirement.title}
                  </h3>
                  <p className="text-[15px] text-[#5A5A5A] leading-relaxed">
                    {requirement.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-[#E8F5E3] rounded-2xl p-8 text-center">
          <div className="max-w-2xl mx-auto">
            <div className="w-16 h-16 bg-[#708A95] rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl md:text-2xl font-bold text-[#3D3D3D] mb-4">
              Sie sind unsicher?
            </h3>
            <p className="text-base text-[#5A5A5A] leading-relaxed mb-6">
              Kein Problem! Wir beraten Sie gerne kostenlos und unverbindlich, ob die 24-Stunden-Betreuung für Ihre individuelle Situation die richtige Lösung ist.
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
      </div>
    </section>
  );
}
