import { COMPANY } from './company';
import { faqs } from '../components/calculator/faqData';

// Schema.org-JSON-LD (SEO-Audit 2026-08-14). Grundsätze:
//  • Nur Fakten, die sichtbar auf der Seite stehen (Impressum, FAQ-Sektion).
//  • KEIN AggregateRating/Review — Bewertungs-Markup über die eigene Firma
//    auf der eigenen Seite verstößt gegen Googles Self-Serving-Richtlinie.
//  • KEINE Preise am Service — die sind rechner-dynamisch.
//  • FAQ-Texte kommen aus faqData.ts (gleiche Quelle wie die sichtbare
//    Sektion), damit Markup und Seitentext nie auseinanderlaufen.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://kostenrechner.primundus.de';

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const SERVICE_ID = `${SITE_URL}/#service`;

// Maschinenlesbares E.164-Format von COMPANY.telefon ('089 200 000 830').
const PHONE_E164 = '+4989200000830';

/** Organization + WebSite — site-weit, eingebunden im Root-Layout. */
export function organizationGraph() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': ORGANIZATION_ID,
        name: COMPANY.marke,
        legalName: COMPANY.firma,
        url: `${SITE_URL}/`,
        logo: {
          '@type': 'ImageObject',
          url: `${SITE_URL}/images/primundus_logo_header.webp`,
        },
        email: COMPANY.email,
        telephone: PHONE_E164,
        // Beide Anschriften wie im Impressum: Kontaktanschrift Deutschland
        // (dort inline, identisch zu app/impressum/page.tsx) + rechtlicher
        // Sitz aus COMPANY.
        address: [
          {
            '@type': 'PostalAddress',
            name: 'Kontaktanschrift Deutschland',
            streetAddress: 'Landsberger Str. 155',
            postalCode: '80687',
            addressLocality: 'München',
            addressCountry: 'DE',
          },
          {
            '@type': 'PostalAddress',
            name: 'Rechtlicher Sitz',
            streetAddress: COMPANY.strasse,
            postalCode: COMPANY.plz,
            addressLocality: COMPANY.ort,
            addressCountry: 'PL',
          },
        ],
        identifier: [
          { '@type': 'PropertyValue', name: 'KRS', value: COMPANY.krs },
          { '@type': 'PropertyValue', name: 'NIP', value: COMPANY.nip },
        ],
        areaServed: { '@type': 'Country', name: 'Deutschland' },
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer service',
          telephone: PHONE_E164,
          email: COMPANY.email,
          availableLanguage: ['de'],
          areaServed: 'DE',
          // Mo–So 8–20 Uhr, wie im Impressum/Footer angegeben.
          hoursAvailable: {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: [
              'Monday',
              'Tuesday',
              'Wednesday',
              'Thursday',
              'Friday',
              'Saturday',
              'Sunday',
            ],
            opens: '08:00',
            closes: '20:00',
          },
        },
        sameAs: [`https://${COMPANY.web}`],
      },
      {
        '@type': 'WebSite',
        '@id': WEBSITE_ID,
        url: `${SITE_URL}/`,
        name: 'PRIMUNDUS - 24-Stunden-Pflege Kostenrechner',
        inLanguage: 'de',
        publisher: { '@id': ORGANIZATION_ID },
      },
    ],
  };
}

/** Service + FAQPage — nur auf der Startseite (dort ist die FAQ sichtbar). */
export function homePageGraph() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        '@id': SERVICE_ID,
        name: '24-Stunden-Pflege und häusliche Betreuung',
        serviceType: 'Vermittlung von Betreuungskräften für die 24-Stunden-Pflege zu Hause',
        description:
          'Vermittlung geprüfter Betreuungskräfte für die Betreuung im eigenen Zuhause als Alternative zum Pflegeheim. Täglich kündbar, Betreuungsstart in der Regel innerhalb von 4–7 Werktagen.',
        provider: { '@id': ORGANIZATION_ID },
        areaServed: { '@type': 'Country', name: 'Deutschland' },
        audience: {
          '@type': 'Audience',
          audienceType: 'Angehörige von Pflegebedürftigen und Pflegebedürftige',
        },
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE_URL}/#faq`,
        mainEntity: faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        })),
      },
    ],
  };
}

/** JSON für ein <script type="application/ld+json"> — escaped '<' gegen
 *  vorzeitiges Script-Ende (Standard-Hygiene bei dangerouslySetInnerHTML). */
export function jsonLdString(graph: object): string {
  return JSON.stringify(graph).replace(/</g, '\\u003c');
}
