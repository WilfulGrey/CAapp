import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './mocks/server';

// MSW lifecycle — tests that don't use network do not pay cost (server idle).
// `onUnhandledRequest: 'error'` forces tests to declare every external call.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Vite's env (import.meta.env.VITE_SUPABASE_URL etc) is populated from .env.local
// at build time, but jsdom tests load the module fresh. Ensure values exist.
(import.meta as ImportMeta & { env: Record<string, string> }).env.VITE_SUPABASE_URL ||=
  'https://test.supabase.co';
(import.meta as ImportMeta & { env: Record<string, string> }).env.VITE_SUPABASE_ANON_KEY ||=
  'test-anon-key';
