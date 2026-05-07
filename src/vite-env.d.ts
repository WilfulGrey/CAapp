/// <reference types="vite/client" />

// Required env vars — set via .env.local (see ONBOARDING.md §2)
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
