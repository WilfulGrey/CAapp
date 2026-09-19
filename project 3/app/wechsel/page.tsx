import type { Metadata } from 'next';
import Image from 'next/image';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Header } from '@/components/calculator/Header';
import { MultiStepForm } from '@/components/calculator/MultiStepForm';
import { BewertungsZeile } from '@/components/calculator/BewertungsZeile';
import { BestpreisSiegelLink } from '@/components/calculator/BestpreisSiegelLink';
import { BestpreisKarte, BestpriceGuarantee } from '@/components/calculator/BestpriceGuarantee';
import { TestsiegerSection } from '@/components/calculator/TestsiegerSection';
import { PersonalContact } from '@/components/calculator/PersonalContact';
import { FinalCTA } from '@/components/calculator/FinalCTA';
import { Footer } from '@/components/calculator/Footer';
import { ladeSterneStand } from '@/lib/sterne-zeile-laden';
import { WECHSEL } from '@/lib/wechsel';

/*
 * /wechsel — Landingpage für Anzeigen an Familien, die SCHON eine
 * 24-Stunden-Kraft über einen anderen Anbieter haben (Registry #81, Martin
 * 18.09.2026: „unzufrieden mit ihrer Pflegekraft oder Agentur oder ist das
 * zu teuer … eigene Landingpage").
 *
 * Eigene Route wie /kosten-berechnen: `analytics_sessions.landing_page`
 * trennt den Traffic von selbst. Der Rechner läuft hier IMMER als „Preis
 * zuerst" (der Vergleich ist das Versprechen) und zählt unter der eigenen
 * Variante `wechsel`, damit der Ablauf-Test (Registry #80) sauber bleibt.
 * Texte: `lib/wechsel.ts`. `noindex` und unverlinkt — Besucher kommen nur
 * über die Anzeigen.
 */

const ERLAUBTE_HOSTS = new Set(['kostenrechner.primundus.de', 'kostenrechner-staging.onrender.com', 'localhost', '127.0.0.1']);

export const metadata: Metadata = {
  title: WECHSEL.meta.title,
  description: WECHSEL.meta.description,
  robots: { index: false, follow: false },
  alternates: { canonical: '/wechsel' },
};

export const dynamic = 'force-dynamic';

export default async function WechselSeite() {
  const host = (headers().get('host') || '').split(':')[0].toLowerCase();
  if (!ERLAUBTE_HOSTS.has(host)) notFound();
  const bewertung = await ladeSterneStand();
  const u = WECHSEL.unterzeile;

  return (
    <div className="min-h-screen bg-[#F8F7F5]">
      <Header />

      {/* Hero: dasselbe Raster wie die Startseite (Foto mit beiden Siegeln, Text, Knopf), andere Botschaft. */}
      <div className="w-full lg:bg-gradient-to-b lg:from-[#F8F7F5] lg:via-white lg:to-white lg:pb-4 lg:pt-12">
        <div className="mx-auto grid w-full max-w-[1280px] items-center lg:grid-cols-[46fr_54fr] lg:gap-12 lg:px-8 xl:gap-16">
          <div className="relative aspect-[1100/941] w-full overflow-hidden bg-[#F8F7F5] lg:order-2 lg:rounded-2xl">
            <Image
              src="/images/PM-Header-Shooting_hero-v3.webp"
              alt="Betreuungskraft und Seniorin zu Hause im Wohnzimmer"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 54vw"
              className="object-cover"
            />
            <a
              href="#testsieger"
              className="absolute bottom-[4%] left-[4%] z-10 block w-[18%] min-w-[62px] max-w-[150px]"
              aria-label="Testsieger DIE WELT, 6× in Folge — zur Original-Veröffentlichung"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/primundus_testsieger-2021.webp" alt="Testsieger DIE WELT Service-Champions" className="block h-auto w-full drop-shadow-[0_2px_10px_rgba(0,0,0,0.25)]" />
            </a>
            <BestpreisSiegelLink className="absolute bottom-[4%] left-[25%] z-10 block w-[34%] min-w-[130px] max-w-[240px]" />
          </div>

          <div className="bg-white px-5 pb-2 pt-6 text-left lg:order-1 lg:bg-transparent lg:px-0 lg:py-0">
            <div className="mx-auto max-w-[560px] lg:mx-0 lg:max-w-none">
              <h1 className="mb-3.5 tracking-tight text-[#3D3D3D]">
                <span className="mb-2.5 block text-[14px] font-semibold uppercase tracking-[0.07em] text-[#E76F63] lg:mb-3 lg:text-[18px] lg:tracking-[0.06em]">
                  {WECHSEL.kicker}
                </span>
                {/* Eine Stufe kleiner als auf der Startseite: zwei Fragen plus Aufforderung brauchen drei Zeilen, nicht vier. */}
                <span className="block text-[33px] font-bold leading-[1.1] sm:text-[40px] lg:text-[40px] xl:text-[44px]">
                  {WECHSEL.h1}
                </span>
              </h1>
              <p className="mb-6 max-w-[520px] text-[16px] leading-relaxed text-[#5B5B5B] lg:text-[18px]">
                {u.vor}
                <span className="font-semibold text-[#3D3D3D]">{u.anker1}</span>
                {u.mitte}
                <span className="font-semibold text-[#3D3D3D]">{u.anker2}</span>
                {u.nach}
                <span className="whitespace-nowrap">{u.ende}</span>
              </p>
              <div className="mb-7 max-w-md">
                <MultiStepForm mode="cta" bewertung={bewertung} knopf={WECHSEL.knopf} ablaufFest="preis" zaehlerVariante="wechsel" />
                <BewertungsZeile stand={bewertung} />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white lg:bg-transparent">
          <div className="mx-auto w-full max-w-[1280px] px-5 pb-2 lg:px-8 lg:pb-0 lg:pt-10">
            <div className="mx-auto max-w-[560px] border-t border-[#E5E3DF] py-6 lg:mx-0 lg:max-w-none lg:border-b">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8B8B8B]">Bekannt aus</p>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 sm:gap-x-5 lg:gap-x-8">
                {/* eslint-disable @next/next/no-img-element */}
                <img src="/images/media/ard.webp" alt="ARD" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-80 sm:h-[24px] lg:h-[32px]" />
                <img src="/images/media/ndr.webp" alt="NDR" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-80 sm:h-[24px] lg:h-[32px]" />
                <img src="/images/media/sat1.webp" alt="SAT.1" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-80 sm:h-[24px] lg:h-[32px]" />
                <img src="/images/media/die-welt.webp" alt="Die Welt" loading="lazy" decoding="async" className="h-[20px] object-contain opacity-80 sm:h-[24px] lg:h-[32px]" />
                <img src="/images/media/bild-der-frau.webp" alt="Bild der Frau" loading="lazy" decoding="async" className="hidden h-[20px] object-contain opacity-80 sm:block sm:h-[24px] lg:h-[32px]" />
                <img src="/images/media/frankfurter-allgemeine.webp" alt="Frankfurter Allgemeine" loading="lazy" decoding="async" className="hidden h-[20px] object-contain opacity-80 sm:block sm:h-[24px] lg:h-[32px]" />
                {/* eslint-enable @next/next/no-img-element */}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Was sich ändert: vier Punkte, jeder mit einem belegten Satz. */}
      <section className="bg-[#F8F7F5] px-5 py-12 lg:py-16">
        <div className="mx-auto max-w-[560px] lg:max-w-[1000px]">
          <h2 className="mb-6 text-[26px] font-bold leading-[1.2] text-[#3D3D3D] lg:mb-8 lg:text-[34px]">{WECHSEL.aenderung.titel}</h2>
          <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
            {WECHSEL.aenderung.punkte.map((p) => (
              <div key={p.titel} className="rounded-2xl border border-[#E5E3DF] bg-white p-5 lg:p-6">
                <div className="mb-2 flex items-center gap-2.5">
                  <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E76F63]/12 text-[#E76F63]">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  </span>
                  <h3 className="text-[18px] font-bold text-[#3D3D3D]">{p.titel}</h3>
                </div>
                <p className="text-[15px] leading-relaxed text-[#5B5B5B] lg:text-[16px]">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* So läuft der Wechsel: vier Schritte in ihrer Reihenfolge. */}
      <section className="bg-white px-5 py-12 lg:py-16">
        <div className="mx-auto max-w-[560px] lg:max-w-[1000px]">
          <h2 className="mb-6 text-[26px] font-bold leading-[1.2] text-[#3D3D3D] lg:mb-8 lg:text-[34px]">{WECHSEL.ablauf.titel}</h2>
          <ol className="grid gap-5 lg:grid-cols-4 lg:gap-6">
            {WECHSEL.ablauf.schritte.map((s, i) => (
              <li key={s.titel} className="flex gap-4 lg:block">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#3D3D3D] text-[15px] font-bold text-white lg:mb-3">{i + 1}</span>
                <div>
                  <h3 className="mb-1 text-[17px] font-bold text-[#3D3D3D]">{s.titel}</h3>
                  <p className="text-[15px] leading-relaxed text-[#5B5B5B]">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Marta und die Garantie: auf dem Handy die Bausteine der Startseite untereinander,
          am Desktop die kompakte Karte neben Marta. */}
      <div className="lg:hidden">
        <section className="bg-[#F8F7F5] px-5 pb-2 pt-12">
          <div className="mx-auto max-w-[520px]"><PersonalContact /></div>
        </section>
        <BestpriceGuarantee />
      </div>
      <section className="hidden bg-[#F8F7F5] px-5 py-14 lg:block">
        <div className="mx-auto grid max-w-[1000px] grid-cols-2 gap-8">
          <BestpreisKarte kompakt />
          <PersonalContact />
        </div>
      </section>

      {/* Fragen vor dem Wechsel. */}
      <section className="bg-white px-5 py-12 lg:py-16">
        <div className="mx-auto max-w-[560px] lg:max-w-[760px]">
          <h2 className="mb-6 text-[26px] font-bold leading-[1.2] text-[#3D3D3D] lg:text-[34px]">{WECHSEL.fragen.titel}</h2>
          <div className="divide-y divide-[#E5E3DF] border-y border-[#E5E3DF]">
            {WECHSEL.fragen.liste.map((f) => (
              <details key={f.frage} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold text-[#3D3D3D] [&::-webkit-details-marker]:hidden">
                  {f.frage}
                  <span aria-hidden="true" className="shrink-0 text-[#8B8B8B] transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="pt-3 text-[15px] leading-relaxed text-[#5B5B5B] lg:text-[16px]">{f.antwort}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <TestsiegerSection />
      <FinalCTA />
      <Footer />
    </div>
  );
}
