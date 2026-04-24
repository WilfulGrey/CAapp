// MSW server instance for all Vitest tests.
// Default handlers live in test/fixtures/mamamia-mocks.ts; individual tests
// override via `server.use(...)` for per-test scenarios.

import { setupServer } from 'msw/node';

export const server = setupServer();
