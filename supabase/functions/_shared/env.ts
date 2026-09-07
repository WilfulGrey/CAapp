// Fail-fast für Secrets (Święta zasada 1, Registry #52): `Deno.env.get(x)!` ist
// ein STILLES undefined — der Crash kommt erst irgendwo tief im Code (z.B.
// `.replace` in der Alarm-Phase), und Tests mit DI sehen ihn nie. Hier wirft der
// Bootstrap mit dem Namen des fehlenden Secrets, bevor die Function eine
// einzige Anfrage annimmt.
export function requireEnv(name: string): string {
  const v = (Deno.env.get(name) ?? "").trim();
  if (!v) throw new Error(`missing required secret ${name}`);
  return v;
}
