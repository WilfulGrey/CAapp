/*
 * fetchBesucherKohorten liest 14 Tage analytics_sessions — das ist mit
 * Abstand die groesste Abfrage in diesem Report. PostgREST liefert ohne
 * range() hoechstens 1.000 Zeilen und sagt nicht, dass es mehr gaebe:
 * das Diagramm zeigte dann einfach zu wenig Besucher, ohne Fehler.
 * Bei ~65 Sitzungen am Tag ist die Grenze schon in Sichtweite, deshalb
 * ist das Seitenweise-Lesen hier abgesichert.
 */
import { assert, assertEquals } from "@std/assert";
import { fetchBesucherKohorten } from "../queries.ts";

/** Minimaler Supabase-Doppelgaenger: gibt `zeilen` seitenweise zurueck. */
function fakeClient(zeilen: Array<Record<string, unknown>>) {
  const aufrufe: Array<[number, number]> = [];
  const kette = {
    select: () => kette,
    gte: () => kette,
    lt: () => kette,
    range: (von: number, bis: number) => {
      aufrufe.push([von, bis]);
      return Promise.resolve({ data: zeilen.slice(von, bis + 1), error: null });
    },
  };
  return { client: { from: () => kette } as never, aufrufe };
}

const heuteBerlin = (tageZurueck: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - tageZurueck);
  return d.toISOString();
};

Deno.test("liest über die 1.000-Zeilen-Grenze hinaus weiter", async () => {
  // 1.200 Sitzungen von gestern, alle über Anzeigen.
  const zeilen = Array.from({ length: 1200 }, (_, i) => ({
    fingerprint: `f${i}`, landing_page: "/", utm_medium: "cpc", started_at: heuteBerlin(1),
  }));
  const { client, aufrufe } = fakeClient(zeilen);
  const tage = await fetchBesucherKohorten(client, 14);
  assertEquals(aufrufe.length, 2, "zweite Seite wurde nicht geholt");
  const summe = tage.reduce((s, k) => s + k.besucher, 0);
  assertEquals(summe, 1200, "Sitzungen sind unterwegs verloren gegangen");
});

Deno.test("interne Sitzungen (jemand war im /admin) zählen nicht mit", async () => {
  const gestern = heuteBerlin(1);
  const zeilen = [
    { fingerprint: "team", landing_page: "/admin/leads", utm_medium: null, started_at: gestern },
    { fingerprint: "team", landing_page: "/", utm_medium: "cpc", started_at: gestern },
    { fingerprint: "kunde", landing_page: "/", utm_medium: "cpc", started_at: gestern },
    { fingerprint: "kunde2", landing_page: "/", utm_medium: null, started_at: gestern },
  ];
  const { client } = fakeClient(zeilen);
  const tage = await fetchBesucherKohorten(client, 14);
  assertEquals(tage.reduce((s, k) => s + k.besucher, 0), 2, "Team-Sitzungen sind mitgezählt");
  assertEquals(tage.reduce((s, k) => s + k.ausAds, 0), 1);
});

Deno.test("das Gerüst enthält jeden Tag, auch die leeren", async () => {
  const { client } = fakeClient([]);
  const tage = await fetchBesucherKohorten(client, 14);
  assertEquals(tage.length, 14);
  assert(tage.every((k) => k.besucher === 0 && k.ausAds === 0));
  // Aufsteigend: ältester Tag zuerst, damit das Diagramm nicht rückwärts läuft.
  assert(tage[0].iso < tage[13].iso, "Reihenfolge der Tage ist verdreht");
});
