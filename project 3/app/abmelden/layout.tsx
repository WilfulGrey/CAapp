import type { Metadata } from 'next';

// Self-Canonical statt des vom Root-Layout geerbten '/' (GSC-Meldung
// 17.08.: "Duplikat – vom Nutzer nicht als kanonisch festgelegt").
// Diese Route ist per X-Robots-Tag noindex; ein Canonical auf die
// Startseite wäre ein widersprüchliches Signal.
export const metadata: Metadata = {
  alternates: { canonical: '/abmelden' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
