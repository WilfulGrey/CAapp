import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installTranslateGuard } from './lib/translateGuard';
import { postHogStarten } from './lib/posthog';
import { KOSTENRECHNER_URL } from './lib/leadEvents';
import './index.css';
import App from './App';

// Install BEFORE React mounts — patches Node.prototype so the reconciler
// survives DOM mutations from Google Translate / browser translators.
// See src/lib/translateGuard.ts for full rationale.
installTranslateGuard();

// PostHog vor dem ersten Render, damit der erste Seitenaufruf mitzählt. Der
// Proxy liegt auf dem Kostenrechner (gleiche Hauptdomain, siehe
// project 3/next.config.js); das Portal ist eine statische Seite ohne Server.
postHogStarten(`${KOSTENRECHNER_URL}/ingest`);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
