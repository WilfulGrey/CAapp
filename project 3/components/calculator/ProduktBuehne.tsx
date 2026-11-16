// ENTWURF 16.11.2026 (Martin: „diesen Schlusspunkt … das aufwendige, schöne Teil, was wir haben mit diesem Handy da drin“):
// Produktbühne wörtlich von primundus.de (components/vertrauen/ProduktBuehne.tsx). Anpassungen für den Rechner: das
// WELT-Siegel öffnet die Original-Veröffentlichung (die Seite /testsieger-24-stunden-pflege gibt es hier nicht), das
// Garantie-Siegel ist nur Bild (das Pop-up hängt am „Mehr Infos“ in den Punkten daneben).
// Produktbild für den Aufruf am Seitenende (Vorschlag 4, 18.09.2026): statt eines Stockfotos zeigt die Bühne, was der
// Knopf verspricht — passende Pflegekräfte mit Foto, Deutschkenntnissen und Erfahrung, so wie das Kundenportal sie zeigt.
// Aufbau und Maße vom Gerät der Partnerseite (/pflegekraefte-fuer-vermittler, .dev--ios): dieselben Beispielprofile,
// dieselbe Karte. Kein Preis im Bild (Martin 14.09.: „beim CTA-Bereich keinen Preis nennen — zeigen wir doch gleich").
import Image from 'next/image'
import type { ReactNode } from 'react'

// Martin 24.09.: „Das Foto in dem kleinen Screenshot würde ich ändern — eine Frau, die professioneller aussieht."
// Die Namen sind Beispielnamen (in keinem System hinterlegt), die Fotos echte Betreuungskräfte; die erste Karte
// ist die einzige, die im kompakten Gerät ganz zu sehen ist — deshalb dort das Porträt pk-3 (getauscht mit pk-1).
export const PROFILE = [
  { foto: '/images/caregivers/pk-3.jpg', name: 'Krystyna N.', alter: 62, deutsch: 'Gut', stufe: 3, rang: 'Elite', fakten: '6 J. Erfahrung · 14 Einsätze', interesse: true },
  { foto: '/images/caregivers/pk-2.jpg', name: 'Ewa L.', alter: 65, deutsch: 'Gut', stufe: 3, rang: 'Elite', fakten: '12 J. Erfahrung · 35 Einsätze' },
  { foto: '/images/caregivers/pk-1.jpg', name: 'Helena W.', alter: 54, deutsch: 'Mittel', stufe: 2, rang: 'Stammkraft', fakten: '4 J. Erfahrung · 9 Einsätze' },
  { foto: '/images/caregivers/pk-4.jpg', name: 'Anna N.', alter: 58, deutsch: 'Gut', stufe: 3, rang: 'Elite', fakten: '8 J. Erfahrung · 22 Einsätze' },
] as const

function Stufe({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-[4px]">
      {[1, 2, 3].map((i) => (
        <i key={i} className={`block h-2 w-2 rounded-full ${i <= n ? 'bg-pm-taupe' : 'bg-pm-line'}`} />
      ))}
    </span>
  )
}

export function ProfilKarte({ p }: { p: (typeof PROFILE)[number] }) {
  const interesse = 'interesse' in p && p.interesse
  return (
    <div className={`overflow-hidden rounded-[16px] border bg-white ${interesse ? 'border-pm-coral' : 'border-[#D4D4D8]'}`}>
      {interesse && (
        <div className="flex items-center gap-2.5 px-[18px] pt-4">
          <i className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-pm-coral-tint text-[13px] not-italic text-pm-coral">♥</i>
          <p className="text-[15px] font-bold leading-[1.35] text-pm-coral">Hat Interesse an Ihrer Betreuung</p>
        </div>
      )}
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-center gap-3.5">
          <Image src={p.foto} alt="" width={64} height={64} className="h-16 w-16 flex-none rounded-[12px] object-cover object-top" />
          <div>
            <p className="text-[17px] font-semibold leading-[1.25] text-[#18181B]">
              {p.name}
              <span className="font-normal text-[#71717A]">, {p.alter}</span>
            </p>
            <p className="mt-1 flex items-center gap-[7px] text-[14px] text-[#71717A]">
              Deutsch <Stufe n={p.stufe} /> {p.deutsch}
            </p>
          </div>
        </div>
        <p className="mt-3 text-[16px] leading-[1.45] text-[#71717A]">
          <b className="font-semibold text-[#18181B]">{p.rang}:</b> {p.fakten}
        </p>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-pm-line-soft px-4 py-2.5">
        <span className="text-[12px] font-medium text-pm-mute">Ablehnen</span>
        <span className="rounded-full bg-pm-coral px-4 py-1.5 text-[12px] font-bold text-white">Einladen</span>
      </div>
    </div>
  )
}

/** iPhone-Rahmen der Partnerseite: Inhalt 393 px breit gesetzt und auf die Gerätebreite skaliert. Seit 24.09.
 * mit beliebigem Bildschirminhalt (children), damit die Ortsseiten je Ablauf-Schritt ein anderes Bild zeigen. */
export function Geraet({ children }: { children: ReactNode }) {
  return (
    <div className="relative w-[var(--geraet)] rounded-[calc(var(--geraet)*0.138)] bg-[#1B1917] p-[calc(var(--geraet)*0.0315)] shadow-[0_0_0_1px_rgba(0,0,0,.35),0_26px_54px_-22px_rgba(28,28,28,.5)]">
      <div className="relative h-[calc(var(--sicht)*2.168)] w-[var(--sicht)] overflow-hidden rounded-[calc(var(--geraet)*0.118)] bg-pm-paper">
        <div className="absolute left-0 top-0 flex h-[852px] w-[393px] origin-top-left flex-col gap-[11px] bg-pm-paper px-4 pb-10 pt-[18px] [transform:scale(var(--massstab))]">
          {/* Statusleiste */}
          <div className="relative flex flex-none items-center justify-between px-[14px] pb-0.5 text-[15px] font-semibold text-[#18181B] [font-variant-numeric:tabular-nums]">
            <span>9:41</span>
            <span className="absolute left-1/2 top-[-4px] h-[30px] w-[104px] -translate-x-1/2 rounded-full bg-[#0B0B0B]" />
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-end gap-[2px]">
                <i className="block h-[6px] w-1 rounded-[1px] bg-[#18181B]" />
                <i className="block h-[9px] w-1 rounded-[1px] bg-[#18181B]" />
                <i className="block h-3 w-1 rounded-[1px] bg-[#18181B]" />
              </span>
              <span className="relative block h-[13px] w-[26px] rounded-[4px] border-[1.5px] border-[#18181B] opacity-85 after:absolute after:inset-[2px] after:right-2 after:rounded-[1.5px] after:bg-[#18181B] after:content-['']" />
            </span>
          </div>
          {/* Kopf des Portals */}
          <div className="mt-3 flex flex-none items-center justify-between px-0.5">
            <Image src="/images/primundus_logo_header.webp" alt="" width={300} height={53} className="h-[26px] w-auto mix-blend-multiply" />
            <span className="rounded-full border border-pm-line px-[15px] py-1.5 text-[14px] font-semibold text-[#71717A]">Hilfe</span>
          </div>
          {children}
        </div>
        {/* weicher Auslauf unten, wie auf der Partnerseite */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[13%] bg-gradient-to-b from-pm-paper/0 to-pm-paper" />
      </div>
    </div>
  )
}


/** Die Bildschirme des Kundenportals, so wie die Bühne sie zeigt: „Ihr Preis ist berechnet" und die passenden Kräfte. */
function Handy({ kopfImGeraet }: { kopfImGeraet: string }) {
  return (
    <Geraet>
          {/* „Ihr Preis ist berechnet" — der grüne Kopf des Rechners */}
          <div className={`flex flex-none items-center gap-3 rounded-[16px] bg-pm-mint px-4 py-3.5 ${kopfImGeraet}`}>
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-pm-green text-white">
              <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.3l2.3 2.2 4.7-5" /></svg>
            </span>
            <div className="leading-[1.3]">
              <p className="text-[16px] font-bold text-pm-green-deep">Ihr Preis ist berechnet</p>
              <p className="text-[13.5px] text-pm-green-deep/80">Inkl. Steuern, Gebühren und Sozialabgaben</p>
            </div>
          </div>
          <p className="flex-none px-0.5 pt-1 text-[19px] font-bold tracking-[-0.02em] text-[#18181B]">Passende Pflegekräfte</p>
          {PROFILE.map((p) => (
            <div key={p.name} className="flex-none">
              <ProfilKarte p={p} />
            </div>
          ))}
    </Geraet>
  )
}

function Siegel({ gross }: { gross: boolean }) {
  return (
    <div className="flex items-end gap-3">
      <a href="/downloads/die-welt-service-champions-2021.pdf" target="_blank" rel="noopener" aria-label="6× Testsieger DIE WELT — Original-Veröffentlichung (PDF)">
        <Image src="/images/siegel-welt-2021-352.webp" alt="Siegel DIE WELT Service-Champions 2021" width={352} height={528} className={`h-[84px] w-auto rounded-[5px] shadow-[0_4px_14px_rgba(0,0,0,0.25)] ${gross ? 'lg:h-[112px]' : ''}`} />
      </a>
      <span className={`rounded-full bg-white px-2.5 py-1.5 shadow-[0_4px_14px_rgba(0,0,0,0.16)] ${gross ? 'lg:hidden' : ''}`}>
        <Image src="/images/bestpreisgarantie-siegel.webp" alt="Primundus Bestpreisgarantie – 6× Preis-Leistungssieger" width={900} height={256} className="h-[32px] w-auto" />
      </span>
    </div>
  )
}

/** Beige Bühne der Partnerseite: rechts das Gerät, links „Ihr Preis ist berechnet" und das WELT-Siegel.
 * Am Handy und in der Textspalte (kompakt) untereinander: Gerät mit weichem Auslauf, darunter beide Siegel. */
export function ProduktBuehne({ kompakt = false }: { kompakt?: boolean }) {
  const gross = !kompakt
  return (
    <div
      className={`relative overflow-hidden rounded-[24px] bg-[linear-gradient(165deg,#F1EAE0,#E9DFD2)] [--geraet:268px] [--massstab:0.6310] [--sicht:248px] md:rounded-[28px] ${
        gross ? 'sm:[--geraet:300px] sm:[--massstab:0.7125] sm:[--sicht:280px] md:[--geraet:268px] md:[--massstab:0.6310] md:[--sicht:248px] lg:h-[580px] lg:[--geraet:300px] lg:[--massstab:0.7125] lg:[--sicht:280px] xl:h-[600px] xl:[--geraet:318px] xl:[--massstab:0.7583] xl:[--sicht:298px]' : ''
      }`}
    >
      {/* Gerät: mittig mit weichem Auslauf; am Computer rechts, unten angeschnitten und vor der Preis-Karte */}
      <div
        role="img"
        aria-label="Beispiel aus dem Kundenportal: passende Pflegekräfte mit Foto, Deutschkenntnissen und Erfahrung"
        className={`flex h-[372px] justify-center overflow-hidden pt-9 [mask-image:linear-gradient(to_bottom,#000_82%,transparent_98%)] ${
          gross ? 'sm:h-[440px] sm:pt-11 md:h-[372px] md:pt-9 lg:absolute lg:right-8 lg:top-14 lg:z-[2] lg:block xl:right-10 lg:h-auto lg:overflow-visible lg:pt-0 lg:[mask-image:none]' : ''
        }`}
      >
        <div aria-hidden="true">
          <Handy kopfImGeraet={gross ? 'xl:hidden' : ''} />
        </div>
      </div>
      {/* Computer: „Ihr Preis ist berechnet" als eigene Karte, schiebt sich hinter das Gerät */}
      {gross && (
        <div aria-hidden="true" className="absolute left-7 top-[88px] hidden w-[232px] rounded-[18px] bg-white p-[18px] pr-[60px] shadow-[0_0_0_1px_rgba(28,28,28,.05),0_24px_48px_-22px_rgba(28,28,28,.45)] xl:block">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-pm-green text-white">
            <svg viewBox="0 0 12 12" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.3l2.3 2.2 4.7-5" /></svg>
          </span>
          <p className="mt-3 text-[17px] font-bold leading-[1.25] tracking-[-0.015em] text-pm-ink">Ihr Preis ist berechnet</p>
          {/* Satz der Preisseite (PREIS_SEITE.inklusive): der Preis ist der Bruttopreis, Zuschüsse werden nie eingerechnet (Martin 18.09.) */}
          <p className="mt-2 text-[14px] leading-[1.45] text-pm-mute">Inkl. Steuern, Gebühren und Sozialabgaben.</p>
          {/* wie auf der Preisseite des Rechners: das Garantie-Siegel unter dem Preis */}
          <div className="mt-4 border-t border-pm-line-soft pt-3.5">
            <Image src="/images/bestpreisgarantie-siegel.webp" alt="" width={900} height={256} className="h-[34px] w-auto" />
          </div>
        </div>
      )}
      {/* Siegel auf freier Fläche: unter dem Gerät, am Computer unten links */}
      <div className={`relative z-[3] px-4 pb-4 sm:px-5 sm:pb-5 ${gross ? 'lg:absolute lg:bottom-7 lg:left-7 lg:p-0' : ''}`}>
        <Siegel gross={gross} />
      </div>
    </div>
  )
}
