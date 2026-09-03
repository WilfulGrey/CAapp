/* Deno-Spiegel von src/__tests__/mails/kundenEmpfaenger.test.ts — die
 * Edge-Kopie in empfaenger.ts muss dasselbe entscheiden wie lib/empfaenger.ts. */
import { assertEquals } from "jsr:@std/assert";
import { kundenEmpfaenger, kopieAdresse, ccListe } from "../empfaenger.ts";

Deno.test("Kopie-Adresse wird als cc angehaengt", () => {
  assertEquals(kundenEmpfaenger({ email: "vater@example.de", email_cc: "tochter@example.de" }),
    { to: "vater@example.de", cc: "tochter@example.de" });
});

Deno.test("ohne / leere / identische Kopie: nur ein Empfaenger", () => {
  assertEquals(kundenEmpfaenger({ email: "vater@example.de" }), { to: "vater@example.de" });
  assertEquals(kundenEmpfaenger({ email: "vater@example.de", email_cc: "  " }), { to: "vater@example.de" });
  assertEquals(kundenEmpfaenger({ email: "Vater@Example.de", email_cc: "vater@example.de" }), { to: "Vater@Example.de" });
});

Deno.test("Komma-Konstrukt und kaputte Adressen fallen weg", () => {
  assertEquals(kopieAdresse("a@x.de, b@y.de", "vater@example.de"), null);
  assertEquals(kopieAdresse("tochter@", "vater@example.de"), null);
});

Deno.test("ccListe: Martins Kopie + Kundenkopie, ohne Dubletten und Leerwerte", () => {
  assertEquals(ccListe("martin@wyzzi.net", "tochter@example.de"), "martin@wyzzi.net, tochter@example.de");
  assertEquals(ccListe("martin@wyzzi.net", null, "", "MARTIN@wyzzi.net"), "martin@wyzzi.net");
  assertEquals(ccListe(null, undefined), undefined);
});
