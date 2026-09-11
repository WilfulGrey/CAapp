#!/usr/bin/env python3
"""
Importiert die Vermittler-Liste (CSV aus dem Anbieterverzeichnis) in partner_kontakte.

    scripts/partner-kontakte-import.py <projekt-ref> <datei.csv> [--dry-run]

Erwartete Spalten (Semikolon, UTF-8): Firma; Anrede; Vorname; Nachname; E-Mail.
- Anrede nur „Herr“/„Frau“, sonst leer → die Mail sagt „Guten Tag,“.
- A/B-Variante fest aus der Adresse (sha1 gerade = A), gleich wie im Probelauf.
- Bereits vorhandene Adressen bleiben unverändert (ON CONFLICT DO NOTHING),
  auch ihr Status — ein erneuter Import holt niemanden aus „abgemeldet“ zurück.

Der Import verschickt nichts. Auth wie scripts/apply-migrations.sh:
SUPABASE_ACCESS_TOKEN oder das Token der Supabase-CLI aus dem macOS-Schlüsselbund.
Die Kontaktdatei gehört nicht ins Repo.
"""
from __future__ import annotations

import base64
import csv
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.request

EMAIL = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")


def token() -> str:
    t = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    if t:
        return t
    raw = subprocess.run(
        ["security", "find-generic-password", "-s", "Supabase CLI", "-a", "supabase", "-w"],
        capture_output=True, text=True,
    ).stdout.strip()
    return base64.b64decode(raw.removeprefix("go-keyring-base64:")).decode() if raw else ""


def sql_text(v: str | None) -> str:
    return "null" if not v else "'" + v.replace("'", "''") + "'"


def zeilen(datei: str):
    with open(datei, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f, delimiter=";"):
            email = (r.get("E-Mail") or "").strip()
            if not EMAIL.match(email):
                print(f"übersprungen, keine gültige Adresse: {email!r}", file=sys.stderr)
                continue
            anrede = (r.get("Anrede") or "").strip()
            yield {
                "email": email,
                "firma": (r.get("Firma") or "").strip() or None,
                "anrede": anrede if anrede in ("Herr", "Frau") else None,
                "vorname": (r.get("Vorname") or "").strip() or None,
                "nachname": (r.get("Nachname") or "").strip() or None,
                "variante": "A" if int(hashlib.sha1(email.lower().encode()).hexdigest(), 16) % 2 == 0 else "B",
            }


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    ref, datei, trocken = sys.argv[1], sys.argv[2], "--dry-run" in sys.argv
    liste = list(zeilen(datei))
    quelle = os.path.basename(datei)
    werte = ",\n".join(
        "(" + ", ".join([sql_text(z["email"]), sql_text(z["firma"]), sql_text(z["anrede"]), sql_text(z["vorname"]),
                         sql_text(z["nachname"]), sql_text(z["variante"]), sql_text(quelle)]) + ")"
        for z in liste
    )
    sql = (
        "insert into public.partner_kontakte (email, firma, anrede, vorname, nachname, variante, quelle) values\n"
        + werte + "\non conflict do nothing;\n"
        "select count(*) as gesamt, count(*) filter (where status = 'aktiv') as aktiv from public.partner_kontakte;"
    )
    a = sum(1 for z in liste if z["variante"] == "A")
    print(f"{len(liste)} Kontakte, Variante A {a} / B {len(liste) - a}, "
          f"persönliche Anrede {sum(1 for z in liste if z['anrede'] and z['nachname'])}")
    if trocken:
        print(sql[:600] + "\n…")
        return
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        print(resp.read().decode())


if __name__ == "__main__":
    main()
