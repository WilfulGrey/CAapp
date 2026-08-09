import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { COMPANY } from '../../lib/company';

export const metadata: Metadata = {
  title: 'Datenschutz | PRIMUNDUS',
  description: 'Datenschutzerklärung der PRIMUNDUS - Informationen zum Umgang mit Ihren personenbezogenen Daten.',
};

export default function DatenschutzPage() {
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

        <h1 className="text-4xl font-bold mb-8 text-gray-900">Datenschutzerklärung</h1>

        <div className="prose prose-lg max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">1. Verantwortliche Stelle</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Verantwortlich für die Datenverarbeitung auf dieser Website ist:
            </p>
            <div className="bg-gray-50 p-6 rounded-lg">
              <p className="font-semibold mb-2">Primundus Deutschland</p>
              <p>Landsberger Str. 155</p>
              <p>80687 München</p>
              <p className="mt-4 font-semibold">{COMPANY.firma}</p>
              <p>{COMPANY.strasse}</p>
              <p>{COMPANY.plz} {COMPANY.ort}, {COMPANY.land}</p>
              <p>KRS {COMPANY.krs}</p>
              <p>NIP {COMPANY.nip}</p>
              <p className="mt-4">
                Telefon: <a href="tel:+4989200000830" className="text-blue-600 hover:underline">+49 89 200 000 830</a>
              </p>
              <p>
                E-Mail: <a href="mailto:info@primundus.de" className="text-blue-600 hover:underline">info@primundus.de</a>
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">2. Erhebung und Speicherung personenbezogener Daten</h2>
            <h3 className="text-xl font-semibold mb-3 text-gray-900">2.1 Besuch unserer Website</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              Bei der bloß informatorischen Nutzung unserer Website erheben wir nur die personenbezogenen Daten,
              die Ihr Browser an unseren Server übermittelt. Diese Daten werden temporär in einem sogenannten Logfile gespeichert:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>IP-Adresse des anfragenden Rechners</li>
              <li>Datum und Uhrzeit des Zugriffs</li>
              <li>Name und URL der abgerufenen Datei</li>
              <li>Website, von der aus der Zugriff erfolgt (Referrer-URL)</li>
              <li>Verwendeter Browser und ggf. das Betriebssystem Ihres Rechners</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 text-gray-900">2.2 Nutzung des Kostenrechners</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              Bei der Nutzung unseres Kostenrechners erheben wir folgende Daten:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>Ihre Angaben zur Pflegesituation (Pflegegrad, Wohnsituation, benötigte Leistungen)</li>
              <li>Kontaktdaten (Name, E-Mail-Adresse, Telefonnummer) - nur wenn Sie ein Angebot anfordern</li>
              <li>Berechnete Kostenkalkulation</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">3. Zweck der Datenverarbeitung</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Die Verarbeitung Ihrer personenbezogenen Daten erfolgt zu folgenden Zwecken:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>Bereitstellung und technische Administration der Website</li>
              <li>Berechnung einer individuellen Kostenkalkulation für Ihre Pflegesituation</li>
              <li>Zusendung der Kalkulationsergebnisse per E-Mail (auf Wunsch)</li>
              <li>Kontaktaufnahme für ein persönliches Beratungsgespräch (auf Wunsch)</li>
              <li>Statistische Auswertung zur Verbesserung unseres Angebots</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">4. Rechtsgrundlage der Verarbeitung</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Die Verarbeitung Ihrer Daten erfolgt auf Grundlage von:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>Art. 6 Abs. 1 lit. a DSGVO (Einwilligung) - bei Angebotsanfragen</li>
              <li>Art. 6 Abs. 1 lit. b DSGVO (Vertragsanbahnung)</li>
              <li>Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse) - für technische Administration und Statistik</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">5. Weitergabe von Daten</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Wir geben Ihre personenbezogenen Daten nur weiter, wenn:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>Sie ausdrücklich eingewilligt haben</li>
              <li>dies für die Erbringung unserer Dienstleistung erforderlich ist</li>
              <li>eine gesetzliche Verpflichtung besteht</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              Eine Übermittlung Ihrer Daten an Drittländer findet nicht statt.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">6. Speicherdauer</h2>
            <p className="text-gray-700 leading-relaxed">
              Wir speichern Ihre personenbezogenen Daten nur so lange, wie dies für die Erfüllung der
              genannten Zwecke erforderlich ist oder gesetzliche Aufbewahrungsfristen bestehen.
              Anfragedaten werden nach Abschluss der Bearbeitung oder auf Ihren Wunsch gelöscht.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">7. Ihre Rechte</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Sie haben folgende Rechte bezüglich Ihrer personenbezogenen Daten:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>Recht auf Auskunft (Art. 15 DSGVO)</li>
              <li>Recht auf Berichtigung (Art. 16 DSGVO)</li>
              <li>Recht auf Löschung (Art. 17 DSGVO)</li>
              <li>Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
              <li>Recht auf Datenübertragbarkeit (Art. 20 DSGVO)</li>
              <li>Widerspruchsrecht (Art. 21 DSGVO)</li>
              <li>Recht auf Widerruf erteilter Einwilligungen (Art. 7 Abs. 3 DSGVO)</li>
              <li>Beschwerderecht bei einer Aufsichtsbehörde (Art. 77 DSGVO)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">8. Cookies und Tracking</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Unsere Website verwendet Cookies und Tracking-Technologien für folgende Zwecke:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-gray-700">
              <li>Technisch notwendige Cookies für die Funktionalität der Website</li>
              <li>Analyse-Cookies zur Verbesserung unseres Angebots (Google Analytics)</li>
              <li>Conversion-Tracking für Werbezwecke (Google Ads)</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">
              Sie können Ihre Cookie-Einstellungen jederzeit in Ihrem Browser anpassen.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">9. Datensicherheit</h2>
            <p className="text-gray-700 leading-relaxed">
              Wir verwenden geeignete technische und organisatorische Sicherheitsmaßnahmen, um Ihre Daten
              gegen zufällige oder vorsätzliche Manipulationen, Verlust, Zerstörung oder den Zugriff
              unberechtigter Personen zu schützen. Unsere Sicherheitsmaßnahmen werden entsprechend der
              technologischen Entwicklung fortlaufend verbessert.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">10. Aktualität und Änderung dieser Datenschutzerklärung</h2>
            <p className="text-gray-700 leading-relaxed">
              Diese Datenschutzerklärung ist aktuell gültig und hat den Stand Februar 2026.
              Durch die Weiterentwicklung unserer Website oder aufgrund geänderter gesetzlicher
              Vorgaben kann es notwendig werden, diese Datenschutzerklärung zu ändern.
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
