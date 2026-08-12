import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    css: false,
    // Override real .env.local values so MSW handlers in test/fixtures
    // intercept the correct base URL (see test/mocks/server.ts).
    env: {
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      // Muss hier stehen, sonst zieht ein lokal gesetztes
      // VITE_KOSTENRECHNER_URL die Bridge-Aufrufe an `bridgeHandler` vorbei
      // (leadEvents.ts fällt sonst auf genau diese Prod-URL zurück) und der
      // Accept-Pfad-Test scheitert mit „bridgePayload is null" — ohne dass
      // am Code irgendetwas kaputt wäre. Gefunden 11.08.
      VITE_KOSTENRECHNER_URL: 'https://kostenrechner.primundus.de',
    },
    // Edge Functions run under Deno (deno test). Playwright E2E under playwright test.
    // Vitest owns src/** only. `**/node_modules/**` (not `node_modules/**`)
    // so nested node_modules — e.g. `project 3/node_modules` — are excluded too.
    // `project 3/**` is the kostenrechner (separate Next.js app, own tooling).
    // `**/.claude/**` — stare worktree'y agentowych sesji (`.claude/worktrees/*`
    // z pełnymi kopiami src/) zatruwały lokalny run duplikatami testów na
    // nieaktualnym kodzie (177 "failed files" przy zielonym CI, 2026-08-12).
    exclude: ['supabase/**', 'e2e/**', '**/node_modules/**', 'dist/**', 'project 3/**', '**/.claude/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/vite-env.d.ts', 'src/data/**'],
    },
  },
});
