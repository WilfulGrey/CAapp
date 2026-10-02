import { createClient } from '@supabase/supabase-js';

/* Supabase-Client NUR für die Admin-Seiten. Sie lesen und schreiben leads & Co.
   direkt aus dem Browser — RLS lässt das nur noch für das Konto des Panels zu
   (Supabase Auth, Flag app_metadata.primundus_admin, das nur der Server setzen
   kann; public.ist_admin()). Der Anon-Schlüssel allein sieht diese Tabellen nicht.

   Angemeldet wird in /admin-login mit demselben Passwort wie das Admin-Cookie
   (ADMIN_PASSWORD auf Render) — das Passwort steht also an zwei Stellen und wird
   immer an beiden geändert. Die Sitzung (Token-Erneuerung, Realtime) hält
   supabase-js selbst; AdminLayoutClient leitet ohne Sitzung zum Login, weil der
   Client sonst still auf den Anon-Schlüssel zurückfällt und leere Listen zeigt. */
export const ADMIN_EMAIL = 'admin-panel@primundus.de';

export const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
