import type { Metadata } from 'next';

// page.tsx ist "use client" und kann kein metadata exportieren — das
// Route-Layout setzt daher das self-referencing canonical. Ohne dieses
// würde das canonical '/' aus dem Root-Layout vererbt und die Seite als
// Duplikat der Startseite kanonisiert (SEO-Audit 2026-08-14).
export const metadata: Metadata = {
  alternates: {
    canonical: '/24h-pflege-kostenrechner',
  },
};

export default function KostenrechnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
