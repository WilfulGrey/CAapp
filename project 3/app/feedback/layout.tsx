import type { Metadata } from 'next';

// Die Rückmeldungs-Seite wird nur über den Link in der Bewertungs-Mail
// aufgerufen. Sie gehört nicht in den Suchindex — sonst konkurriert sie mit
// den Seiten, die tatsächlich ranken sollen, und taucht bei Markensuchen auf.
export const metadata: Metadata = {
  title: 'Ihre Rückmeldung — Primundus',
  robots: { index: false, follow: false },
  alternates: { canonical: '/feedback' },
};

export default function FeedbackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
