import type { Metadata } from 'next';

// Jede persönliche Angebotsseite erbte bisher canonical '/' vom
// Root-Layout — aus Google-Sicht hunderte Duplikate der Startseite
// (GSC-Meldung 17.08.). Jetzt self-canonical; indexiert wird ohnehin
// nichts (X-Robots-Tag noindex aus next.config.js).
export async function generateMetadata(
  { params }: { params: { leadId: string } }
): Promise<Metadata> {
  return { alternates: { canonical: `/kalkulation/${params.leadId}` } };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
