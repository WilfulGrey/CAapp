import { redirect } from 'next/navigation';

// Übergangs-Weiterleitung: die Chat-Landingpage heißt seit 27.08.
// /sofortangebot (Martins Entscheid — die URL trägt die Kern-USP).
// /beratung war nie verlinkt oder beworben; der Redirect fängt nur
// alte Test-Lesezeichen und in Session-Nachrichten geteilte Links ab.
export const dynamic = 'force-dynamic';

export default function BeratungWeiterleitung() {
  redirect('/sofortangebot');
}
