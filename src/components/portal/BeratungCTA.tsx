import type { FC } from 'react';

const PHONE_HREF = 'tel:+4989200000830';
const WHATSAPP_HREF = 'https://wa.me/4989200000830';

export const BeratungCTA: FC<{
  /** Kontextueller Untertitel — z.B. "Unsicher bei der Auswahl?" über der
   *  Matching-Liste, oder "Fragen zur Bewerbung?" unter der AppCard. */
  headline: string;
  /** Optionaler Body-Text. Default: allgemeiner Hilfssatz. */
  body?: string;
}> = ({ headline, body = 'Ich helfe Ihnen gerne weiter — schnell und unverbindlich.' }) => {
  return (
    <div className="rounded-2xl border border-[#D4D4D8] bg-white p-4 shadow-sm">
      {/* Aufbau (Martin, 13.08.): Überschrift über die volle Breite, darunter
          Foto mit Name/Rolle rechts daneben, dann der Text wieder volle
          Breite, und die beiden Wege NEBENEINANDER — wie in der Kontaktbox
          unten („Anrufen · WhatsApp"). Vorher hing alles rechts neben dem
          Foto in einer schmalen Spalte und die Buttons stapelten sich. */}
      <p className="text-[17px] font-bold text-[#3D2B1F] leading-tight mb-3">{headline}</p>
      <div className="flex items-center gap-3 mb-3">
        <img
          src="/marta-kapcio.jpg"
          alt="Marta Kapcio"
          className="w-14 h-14 rounded-full object-cover object-top flex-shrink-0 border border-[#E9E9EB]"
        />
        <p className="text-[15px] text-[#8B7355] font-medium leading-snug">Marta Kapcio<br/>Ihre Beraterin</p>
      </div>
      <p className="text-[16px] text-[#52525B] leading-relaxed mb-3.5">{body}</p>
      <div className="flex gap-2">
        {/* Reihenfolge wie unten auf der Seite: Anrufen, dann WhatsApp. Die
            Nummer selbst steht in der Kontaktbox — hier zählt der kurze Weg. */}
        <a
          href={PHONE_HREF}
          className="flex-1 inline-flex items-center justify-center gap-2 text-[15px] font-semibold bg-white text-[#3D2B1F] border border-[#E9E9EB] px-4 py-2.5 rounded-full hover:bg-gray-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.21l-2.26 1.13a11.04 11.04 0 005.52 5.52l1.13-2.26a1 1 0 011.21-.5l4.5 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.72 21 3 14.28 3 6V5z" />
          </svg>
          Anrufen
        </a>
        <a
          href={WHATSAPP_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-2 text-[15px] font-semibold bg-[#25D366] text-white px-4 py-2.5 rounded-full hover:bg-[#1FB854] transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.464 3.488"/>
          </svg>
          WhatsApp
        </a>
      </div>
    </div>
  );
};
