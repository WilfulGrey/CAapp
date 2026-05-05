import Link from 'next/link';
import { ArrowLeft, Phone, Mail } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Impressum | PRIMUNDUS',
  description: 'Impressum und Kontaktdaten der PRIMUNDUS - 24-Stunden-Pflege und Betreuung.',
};

export default function ImpressumPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-5 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Zurück zur Startseite
        </Link>

        <h1 className="text-4xl font-bold mb-8 text-gray-900">Impressum</h1>

        <div className="space-y-8">
          <section className="bg-gray-50 p-8 rounded-lg">
            <h2 className="text-2xl font-bold mb-6 text-gray-900">Angaben gemäß § 5 TMG</h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-3 text-gray-900">Anschrift Deutschland</h3>
                <p className="text-gray-700">Primundus Deutschland</p>
                <p className="text-gray-700">Landsberger Str. 155</p>
                <p className="text-gray-700">80687 München</p>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-3 text-gray-900">Rechtlicher Sitz</h3>
                <p className="text-gray-700 font-semibold mb-2">Primundus ist eine Marke von:</p>
                <p className="text-gray-700">Vitanas Group spolka zoo</p>
                <p className="text-gray-700">Poznanska 21/48</p>
                <p className="text-gray-700">00-685 Warszawa</p>
                <p className="text-gray-700">Polen</p>
                <div className="mt-4 space-y-1">
                  <p className="text-gray-700">NIP (Steuer-ID): 7011172300</p>
                  <p className="text-gray-700">REGON: 526823071</p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Kontakt</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-gray-600 flex-shrink-0" />
                <div>
                  <p className="text-gray-700">Telefon:</p>
                  <a href="tel:+4989200000830" className="text-blue-600 hover:underline font-medium text-lg">
                    +49 89 200 000 830
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-gray-600 flex-shrink-0" />
                <div>
                  <p className="text-gray-700">E-Mail:</p>
                  <a href="mailto:info@primundus.de" className="text-blue-600 hover:underline font-medium">
                    info@primundus.de
                  </a>
                </div>
              </div>
              <p className="text-gray-600 mt-4">
                Erreichbarkeit: Montag bis Sonntag, 8:00 - 20:00 Uhr
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Vertretungsberechtigte Geschäftsführung</h2>
            <p className="text-gray-700 font-semibold">Kamila Bilska</p>
            <p className="text-gray-700 mt-2">
              Die Geschäftsführung wird über die oben genannten Kontaktdaten erreicht.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Registereintrag</h2>
            <div className="space-y-2 text-gray-700">
              <p>Registergericht: Warszawa</p>
              <p>REGON-Nummer: 526823071</p>
              <p>NIP (Steuer-ID): 7011172300</p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Umsatzsteuer-ID</h2>
            <p className="text-gray-700">
              Umsatzsteuer-Identifikationsnummer gemäß §27 a Umsatzsteuergesetz:
            </p>
            <p className="text-gray-900 font-semibold mt-2">NIP: 7011172300</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Aufsichtsbehörde</h2>
            <p className="text-gray-700">
              Als Vermittler von Betreuungskräften unterliegen wir den entsprechenden Aufsichtsbehörden
              in Deutschland und Polen. Für spezifische Anfragen stehen wir Ihnen gerne zur Verfügung.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV</h2>
            <p className="text-gray-700 font-semibold">Kamila Bilska</p>
            <p className="text-gray-700">Geschäftsführung PRIMUNDUS</p>
            <p className="text-gray-700">Landsberger Str. 155</p>
            <p className="text-gray-700">80687 München</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Haftungsausschluss</h2>

            <h3 className="text-lg font-semibold mb-2 text-gray-900">Haftung für Inhalte</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              Die Inhalte unserer Seiten wurden mit größter Sorgfalt erstellt. Für die Richtigkeit,
              Vollständigkeit und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen.
              Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte auf diesen Seiten
              nach den allgemeinen Gesetzen verantwortlich.
            </p>

            <h3 className="text-lg font-semibold mb-2 text-gray-900">Haftung für Links</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              Unser Angebot enthält Links zu externen Webseiten Dritter, auf deren Inhalte wir keinen
              Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen.
              Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber
              der Seiten verantwortlich.
            </p>

            <h3 className="text-lg font-semibold mb-2 text-gray-900">Urheberrecht</h3>
            <p className="text-gray-700 leading-relaxed">
              Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen
              dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art
              der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen
              Zustimmung des jeweiligen Autors bzw. Erstellers.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Streitschlichtung</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:
            </p>
            <a
              href="https://ec.europa.eu/consumers/odr"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              https://ec.europa.eu/consumers/odr
            </a>
            <p className="text-gray-700 leading-relaxed mt-4">
              Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
              Verbraucherschlichtungsstelle teilzunehmen.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Hinweise zum Kostenrechner</h2>
            <p className="text-gray-700 leading-relaxed">
              Die Berechnungen des Kostenrechners basieren auf den aktuellen Pflegesätzen und Zuschüssen
              zum Zeitpunkt der Berechnung. Sie dienen als erste Orientierung und sind unverbindlich.
              Die tatsächlichen Kosten können abhängig von individuellen Faktoren und konkreten
              Anforderungen variieren. Ein persönliches Beratungsgespräch gibt Ihnen verbindliche Auskunft.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Zurück zur Startseite
          </Link>
        </div>
      </div>
    </div>
  );
}
