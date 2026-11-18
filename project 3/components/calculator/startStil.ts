// Klassen der Startseiten-Abschnitte unter dem Kopf, gleiche Werte wie primundus.de (components/start/stil.ts dort):
// Martin 16.11.2026: „Ich finde auf primundus.de sieht alles schöner aus als auf dem kostenrechner … Wir wollen eine richtig
// schöne, cleane und professionelle Darstellung.“ Bis dahin: H2 fett 700 in Grau #3D3D3D mit normaler Laufweite, Einleitung
// 16 px #5A5A5A; primundus.de: extrafett 800, #1C1C1C, enge Laufweite, Einleitung 18 px #2E2E2E.

/** Die Zeile über der H2 */
export const AUGENBRAUE = 'text-[13px] md:text-[14px] font-bold uppercase tracking-[0.14em] text-[#8B7355]';
/** Die H2 */
export const H2 = 'mt-3 text-[30px] md:text-[40px] font-extrabold leading-[1.1] tracking-[-0.03em] text-[#1C1C1C] [text-wrap:balance]';
/** Der Satz unter der H2: links, schmaler als die Spalte */
export const EINLEITUNG = 'mt-5 max-w-[44rem] text-[17px] md:text-[18px] leading-[1.65] text-[#2E2E2E]';
/** Ein Abschnitt: Abstände wie primundus.de */
export const ABSCHNITT = 'px-5 py-12 lg:py-16';
/** Die Spalte: Breite und linke Kante wie Kopf und Hero */
export const SPALTE = 'mx-auto max-w-[560px] lg:max-w-[1216px]';
/** Der Abschnittsknopf (Form wie der Hero-Knopf) */
export const KNOPF =
  'inline-flex w-full max-w-md items-center justify-center rounded-xl bg-[#E76F63] px-4 py-[18px] text-[16px] min-[375px]:text-[17px] font-bold text-white shadow-[0_4px_14px_rgba(231,111,99,0.32)] transition-all duration-200 hover:bg-[#D65E52]';
