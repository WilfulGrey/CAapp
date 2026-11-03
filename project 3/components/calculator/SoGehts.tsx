import { SO_GEHTS } from "@/lib/rechner-kopf";

// „So geht's“ unter den Antworten von Frage 1 (Martin 03.11.2026, Registry #146):
// Frage 1 ist kurz, darunter der Ablauf in vier Schritten. Ruhig gehalten — kein
// Knopf-Look, keine Karte, nur eine Trennlinie —, damit der Blick auf den beiden
// Antworten bleibt. Er steht UNTER den Antworten und schiebt sie nicht nach unten.
// Abstand nach oben kommt vom `space-y-3` der Antworten-Spalte.
// Farben aus dem Fragebogen: Ziffernkreis mit dem Rand der Antwort-Knöpfe,
// Koralle bleibt den Knöpfen vorbehalten (Farbregel Martin 11.09.).
// Ziffern in #5A5A5A wie der Schritt-Text: 6,9:1 auf Weiß (das Braun #8B7355
// hatte nur 4,49:1, unter WCAG AA 4,5:1). `role="list"`, weil Safari/VoiceOver
// eine Liste ohne Aufzählungszeichen (Tailwind-Preflight) sonst nicht als Liste ansagt.
export function SoGehts() {
  return (
    <div data-so-gehts className="border-t border-[#E5E3DF] pt-4">
      <p className="mb-2.5 text-[14px] font-bold text-[#3D3D3D]">{SO_GEHTS.titel}</p>
      <ol role="list" className="space-y-2">
        {SO_GEHTS.schritte.map((schritt, i) => (
          <li key={schritt} className="flex items-start gap-2.5">
            <span
              className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#CFC6B8] bg-white text-[12px] font-bold text-[#5A5A5A]"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span className="pt-[1.5px] text-[14px] leading-snug text-[#5A5A5A]">{schritt}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
