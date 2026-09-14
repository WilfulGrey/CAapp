import type { Metadata } from 'next';

// Wie /abmelden: Self-Canonical, die Route ist per X-Robots-Tag noindex
// (NOINDEX_PATHS in next.config.js).
export const metadata: Metadata = {
  alternates: { canonical: '/kein-interesse' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
