"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LayoutDashboard, Users, Euro, Gift, LogOut, ChartBar as BarChart3, MessageSquare, Receipt, ExternalLink, ChevronDown } from 'lucide-react';

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  /* Drei Punkte stehen fest, der Rest klappt auf (Martin, 06.09.2026: „menü
     bricht immer noch um — vielleicht … die wichtigsten: Dashboard, Leads,
     Gespräche anzeigen und weitere zum aufklappen"). So bleibt die Leiste auch
     beim nächsten Menüpunkt in einer Zeile. */
  const hauptItems = [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/leads', label: 'Leads', icon: Users },
    { href: '/admin/gespraeche', label: 'Gespräche', icon: MessageSquare },
  ];
  const weitereItems = [
    { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/admin/kosten', label: 'Kosten', icon: Receipt },
    { href: '/admin/preise', label: 'Preise', icon: Euro },
    { href: '/admin/zuschuesse', label: 'Zuschüsse', icon: Gift },
  ];

  const [offen, setOffen] = useState(false);
  const aufklappRef = useRef<HTMLDivElement>(null);
  /* Klick daneben schliesst — sonst bleibt das Menü offen und verdeckt die
     Seite, wenn man woandershin klickt. */
  useEffect(() => {
    if (!offen) return;
    const zu = (e: MouseEvent) => {
      if (!aufklappRef.current?.contains(e.target as Node)) setOffen(false);
    };
    document.addEventListener('mousedown', zu);
    return () => document.removeEventListener('mousedown', zu);
  }, [offen]);
  // Nach einem Seitenwechsel wieder zu.
  useEffect(() => { setOffen(false); }, [pathname]);

  async function handleLogout() {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    router.push('/admin-login');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-[#5C4A32] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                {/* Kurz, damit die Leiste nicht umbricht. */}
                <h1 className="text-lg font-bold whitespace-nowrap">Admin</h1>
              </div>
              <div className="hidden sm:ml-5 sm:flex sm:items-center sm:gap-1">
                {hauptItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                        isActive ? 'bg-[#7D6850]' : 'hover:bg-[#6B5942]'
                      }`}
                    >
                      <item.icon className="w-4 h-4 mr-1.5 hidden lg:block" />
                      {item.label}
                    </Link>
                  );
                })}

                {/* „Mehr" mit den selteneren Punkten. Steht man auf einem davon, bleibt der
                    Knopf hervorgehoben — sonst wüsste man nicht, wo man ist. */}
                <div className="relative" ref={aufklappRef}>
                  <button
                    type="button"
                    onClick={() => setOffen((v) => !v)}
                    aria-expanded={offen}
                    aria-haspopup="menu"
                    className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                      weitereItems.some((i) => i.href === pathname) ? 'bg-[#7D6850]' : 'hover:bg-[#6B5942]'
                    }`}
                  >
                    Mehr
                    <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${offen ? 'rotate-180' : ''}`} />
                  </button>
                  {offen && (
                    <div role="menu" className="absolute left-0 z-50 mt-1 w-52 overflow-hidden rounded-lg border border-black/10 bg-white py-1 shadow-xl">
                      {weitereItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            role="menuitem"
                            className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                              isActive ? 'bg-[#F3EDE4] font-semibold text-[#3D2B1F]' : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <item.icon className="h-4 w-4 text-[#7D6850]" />
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Rechts nur Symbole: die zwei Wörter kosteten Breite, die dem Menü
                fehlte. Beschriftung bleibt als Titel und für Vorleseprogramme. */}
            <div className="flex shrink-0 items-center gap-1">
              <Link
                href="/"
                title="Zur Website"
                aria-label="Zur Website"
                className="inline-flex items-center rounded-lg p-2 transition-colors hover:bg-[#6B5942]"
              >
                <ExternalLink className="w-4 h-4" />
              </Link>
              <button
                onClick={handleLogout}
                title="Abmelden"
                aria-label="Abmelden"
                className="inline-flex items-center rounded-lg p-2 transition-colors hover:bg-[#6B5942]"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
