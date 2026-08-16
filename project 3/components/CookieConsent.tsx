"use client";

import { useState, useEffect } from "react";
import { X, Settings, Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cookieConsent, ConsentState } from "@/lib/cookie-consent";

export function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<ConsentState>({
    necessary: true,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    // CRO 15.08.: sofort zeigen statt nach 1 s — vorher erschien das Banner
    // genau dann, wenn der Besucher zu lesen begonnen hatte, und verdeckte
    // auf Mobil 38 % des Bildschirms inkl. der ersten Wizard-Frage.
    if (!cookieConsent.hasConsent()) {
      setShowBanner(true);
    }
  }, []);

  // CRO 15.08.: kein window.location.reload() mehr. GA/GTM hören jetzt auf
  // das 'cookie-consent-changed'-Event (lib/cookie-consent.ts dispatcht es),
  // und lib/analytics.ts feuert Pageview + aktuellen Wizard-Step nach
  // Einwilligung selbst nach. Der Reload warf den Besucher an den
  // Seitenanfang zurück und baute die App komplett neu auf.
  const handleAcceptAll = () => {
    cookieConsent.acceptAll();
    setShowBanner(false);
  };

  const handleAcceptNecessary = () => {
    cookieConsent.acceptNecessary();
    setShowBanner(false);
  };

  const handleOpenSettings = () => {
    const current = cookieConsent.getConsent();
    if (current) {
      setPreferences(current);
    }
    setShowSettings(true);
  };

  const handleSavePreferences = () => {
    cookieConsent.saveConsent(preferences);
    setShowSettings(false);
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <>
      {/* CRO 15.08.: kompaktes Banner. Vorher 307px hoch (38 % eines
          Handy-Bildschirms) und damit genau über der ersten Wizard-Frage;
          12 % aller Taps der Seite gingen ans Banner. Jetzt: 2-Zeilen-Text,
          Buttons in einer Reihe, „Nur notwendige" gleichwertig sichtbar. */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="flex-1 min-w-0 flex items-start gap-2.5">
              <Cookie className="w-4 h-4 text-[#708A95] flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-gray-600 leading-snug">
                <span className="font-semibold text-gray-900">Cookies:</span>{" "}
                Funktion &amp; Analyse.{" "}
                <a
                  href="/datenschutz"
                  className="text-[#708A95] hover:underline font-medium"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Mehr erfahren
                </a>
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={handleOpenSettings}
                aria-label="Cookie-Einstellungen öffnen"
                className="h-8 w-8 flex flex-shrink-0 items-center justify-center rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50"
              >
                <Settings className="w-4 h-4" />
              </button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAcceptNecessary}
                className="h-8 flex-1 sm:flex-none text-xs border-gray-300 hover:bg-gray-50"
              >
                Nur notwendige
              </Button>
              <Button
                size="sm"
                onClick={handleAcceptAll}
                className="h-8 flex-1 sm:flex-none text-xs bg-[#708A95] hover:bg-[#62808A] text-white"
              >
                Alle akzeptieren
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cookie className="w-5 h-5 text-[#708A95]" />
              Cookie-Einstellungen
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              Verwalten Sie Ihre Cookie-Präferenzen. Sie können Ihre Einstellungen jederzeit ändern.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex-1 pr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Label htmlFor="necessary" className="font-semibold text-sm">
                      Notwendige Cookies
                    </Label>
                    <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">
                      Erforderlich
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Diese Cookies sind für die grundlegende Funktionalität der Website erforderlich
                    und können nicht deaktiviert werden.
                  </p>
                </div>
                <Switch
                  id="necessary"
                  checked={true}
                  disabled
                  className="data-[state=checked]:bg-gray-400"
                />
              </div>

              <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex-1 pr-4">
                  <Label htmlFor="analytics" className="font-semibold text-sm mb-1 block">
                    Analytics-Cookies
                  </Label>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Helfen uns zu verstehen, wie Besucher mit der Website interagieren,
                    um unseren Service zu verbessern.
                  </p>
                </div>
                <Switch
                  id="analytics"
                  checked={preferences.analytics}
                  onCheckedChange={(checked) =>
                    setPreferences({ ...preferences, analytics: checked })
                  }
                  className="data-[state=checked]:bg-[#708A95]"
                />
              </div>

              <div className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex-1 pr-4">
                  <Label htmlFor="marketing" className="font-semibold text-sm mb-1 block">
                    Marketing-Cookies
                  </Label>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Werden verwendet, um Besuchern relevante Werbung und Marketing-Kampagnen anzuzeigen.
                  </p>
                </div>
                <Switch
                  id="marketing"
                  checked={preferences.marketing}
                  onCheckedChange={(checked) =>
                    setPreferences({ ...preferences, marketing: checked })
                  }
                  className="data-[state=checked]:bg-[#708A95]"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowSettings(false)}
              className="text-sm"
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleSavePreferences}
              className="bg-[#708A95] hover:bg-[#62808A] text-white text-sm"
            >
              Einstellungen speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
