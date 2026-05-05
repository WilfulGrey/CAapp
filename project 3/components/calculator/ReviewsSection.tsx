export function ReviewsSection() {
  const reviews = [
    {
      name: "Helga M.",
      location: "Berlin",
      initials: "HM",
      stars: 5,
      text: "Dank der schnellen Online-Anfrage hatten wir endlich eine klare Übersicht über die Kosten meiner Mutter. Die Betreuerin ist seit 8 Monaten bei uns – wir sind sehr zufrieden."
    },
    {
      name: "Stefan K.",
      location: "München",
      initials: "SK",
      stars: 5,
      text: "Sehr professionelle Vermittlung. Innerhalb von 5 Tagen hatten wir eine liebevolle Betreuungskraft für meinen Vater. Der Preis war tatsächlich der günstigste."
    },
    {
      name: "Anna B.",
      location: "Hamburg",
      initials: "AB",
      stars: 5,
      text: "Was mich überzeugt hat: Kein Druck, kein Verkaufsgespräch. Erst der Preis, dann entscheiden. Genau so sollte es laufen. Wir haben uns nach 2 Wochen entschieden."
    },
    {
      name: "Peter W.",
      location: "Köln",
      initials: "PW",
      stars: 4,
      text: "Die Kostenübersicht per Mail war super – konnte ich direkt mit meinen Geschwistern teilen. Der Wechsel der Betreuungskraft ging auch unkompliziert."
    }
  ];

  return (
    <section className="py-14 bg-white">
      <div className="max-w-[560px] mx-auto px-5">
        <p className="text-xs font-bold uppercase tracking-wider text-[#A89279] mb-2">
          Kundenstimmen
        </p>
        <h2 className="text-[26px] leading-[1.25] font-bold text-[#3D3D3D] mb-8">
          Das sagen unsere Familien
        </h2>
      </div>

      <div className="overflow-x-auto pb-2 hide-scrollbar" style={{ paddingLeft: 'max(20px, calc((100vw - 560px)/2))' }}>
        <div className="flex gap-3.5">
          {reviews.map((review, i) => (
            <div key={i} className="flex-shrink-0 w-[300px] bg-[#FAF8F5] border border-[#E5DFD6] rounded-2xl p-5.5">
              <div className="flex items-center gap-3 mb-3.5">
                <div className="w-10 h-10 rounded-full bg-[#8B7355] text-white flex items-center justify-center font-bold text-sm">
                  {review.initials}
                </div>
                <div>
                  <div className="font-semibold text-[14px] text-[#3D3D3D]">
                    {review.name}
                  </div>
                  <div className="text-xs text-[#8A8279]">
                    {review.location}
                  </div>
                </div>
              </div>
              <div className="text-[#D4A843] text-sm mb-2.5">
                {"★".repeat(review.stars)}{"☆".repeat(5 - review.stars)}
              </div>
              <p className="text-[14px] leading-relaxed text-[#5A5A5A]">
                {review.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </section>
  );
}
