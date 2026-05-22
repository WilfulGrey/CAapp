import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installTranslateGuard } from './lib/translateGuard';
import './index.css';
import App from './App';

// Install BEFORE React mounts — patches Node.prototype so the reconciler
// survives DOM mutations from Google Translate / browser translators.
// See src/lib/translateGuard.ts for full rationale.
installTranslateGuard();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
