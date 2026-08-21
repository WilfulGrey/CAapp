#!/usr/bin/env python3
"""
Erzeugt aus chat-prototyp.html das einbettbare Widget `pria-widget.js`.

Warum überhaupt ein Erzeuger: Der Prototyp bleibt die EINE Quelle. Alles, was
an Pria geändert wird — Texte, Layout, Ablauf — passiert dort und wandert von
hier aus in die Testseite und ins Widget. Zwei gepflegte Kopien wären nach dem
zweiten Tag auseinandergelaufen.

Warum Shadow-DOM: Pria bringt Klassennamen wie `.card`, `.row`, `.chip` und
`.feld` mit. Auf einer Demo-Seite ist das egal, im echten Kostenrechner nicht —
die Regeln würden in beide Richtungen abfärben. Im Shadow-DOM gilt das CSS nur
innen, und das der Seite kommt nicht herein. Kein Präfix-Geschraube an 127
Selektoren, keine Überraschung bei der nächsten Tailwind-Klasse.

Was NICHT hineingehört: die angedeutete Website (Nav, Hero, Karten) — die ist
nur Kulisse für den Prototyp.
"""
import io
import re
import sys
from pathlib import Path

# Quelle ist die Testseite: sie enthaelt die ganze Wahrheit (CSS, Markup, JS)
# plus die angedeutete Website drumherum. Das Widget ist dieselbe Datei ohne
# Kulisse und in einen Shadow-DOM gepackt. Aendern also immer in pria.html,
# danach dieses Skript laufen lassen:
#     python3 scripts/pria-widget-bauen.py
HIER = Path(__file__).resolve().parent
QUELLE = HIER.parent / 'public' / 'pria.html'
ZIEL = HIER.parent / 'public' / 'pria-widget.js'


def bauen(html: str) -> str:
    css = re.search(r'<style>(.*?)</style>', html, re.S).group(1)
    rumpf = re.search(r'<body[^>]*>(.*?)<script>', html, re.S).group(1)
    js = re.search(r'<script>(.*?)</script>', html, re.S).group(1)

    # ── Kulisse raus ────────────────────────────────────────────────
    css = re.sub(r'  /\* ── angedeutete Website.*?(?=  /\* ── Einstieg)', '', css, flags=re.S)
    assert '.karte{' not in css, 'Demo-CSS nicht sauber entfernt'
    rumpf = re.sub(r'<div class="site">.*?</div>\s*(?=<div class="teaser")', '', rumpf, flags=re.S)
    assert 'PRIMUNDUS' not in rumpf, 'Demo-Markup nicht sauber entfernt'

    # ── Seitenweite Regeln, die drinnen nichts verloren haben ───────
    # `body.chat-offen` sperrt die Seite DAHINTER — die einzige Regel, die
    # bewusst nach draußen wirkt. Sie wandert deshalb als eigenes <style>
    # ins Dokument, nicht in den Schatten.
    css = css.replace('  body.chat-offen{overflow:hidden}', '')
    css = re.sub(r'  html\{[^}]*\}\n', '', css)
    css = re.sub(r'  body\{[^}]*\}\n', '', css)
    css = re.sub(r'  ::selection\{[^}]*\}\n', '', css)
    assert 'body{margin:0' not in css

    # Die Variablen hängen an :host statt an :root — im Schatten ist das die
    # Wurzel, und die Seite draußen bekommt keine fremden --bg/--ink.
    css = css.replace('  :root{', '  :host{', 1)
    # Schrift setzen: drinnen erbt sonst die Schrift der Seite, und Pria sähe
    # auf jeder Seite anders aus.
    css = css.replace(
        '  *{box-sizing:border-box}',
        '  :host{all:initial;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",'
        '"Segoe UI",Inter,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;'
        'color:var(--ink);line-height:1.5}\n'
        '  *{box-sizing:border-box}\n'
        '  button{font:inherit;color:inherit}', 1)

    # ── Elementzugriffe in den Schatten umlenken ────────────────────
    # createElement/body/documentElement bleiben beim Dokument — nur das
    # Suchen nach Prias eigenen Elementen wandert.
    js = js.replace('document.getElementById(', 'W.getElementById(')
    js = js.replace('document.querySelector(', 'W.querySelector(')
    js = js.replace('document.querySelectorAll(', 'W.querySelectorAll(')
    # Der fliegende Chip trägt eine Klasse aus dem Schatten-CSS — käme er ins
    # Dokument, wäre er unsichtbar formatiert.
    js = js.replace('document.body.appendChild(klon);', 'W.appendChild(klon);')
    assert 'document.getElementById' not in js
    assert 'document.body.classList' in js, 'Seiten-Sperre darf NICHT umgelenkt werden'

    def js_text(t: str) -> str:
        """Text → JS-String-Literal. Zeilenweise verkettet, damit die erzeugte
        Datei lesbar bleibt und nicht aus einer einzigen 200-KB-Zeile besteht."""
        zeilen = t.split('\n')
        return "'" + "\\n'+\n    '".join(
            z.replace('\\', '\\\\').replace("'", "\\'") for z in zeilen) + "'"

    css_literal = js_text(css.strip())
    marke = js_text(rumpf.strip())

    return f"""/* Pria — einbettbarer Beratungs-Chat.
 *
 * ERZEUGT aus chat-prototyp.html von widget-bauen.py. NICHT von Hand ändern —
 * die Änderung wäre beim nächsten Lauf weg. Quelle ist der Prototyp.
 *
 * Einbindung: <script src="/pria-widget.js" defer></script>. Das Widget hängt
 * sich selbst an <body> und lebt in einem Shadow-DOM, damit sein CSS und das
 * der Seite sich nicht gegenseitig verstellen.
 *
 * Es spricht mit /api/pria auf derselben Domain. Antwortet die Route nicht,
 * fällt Pria sichtbar auf ihre Stichwortsuche zurück.
 */
(function () {{
  if (window.__pria) return;            // zweimal eingebunden: einmal genügt
  window.__pria = true;

  var wurzel = document.createElement('div');
  wurzel.id = 'pria-wurzel';
  document.body.appendChild(wurzel);
  var W = wurzel.attachShadow({{ mode: 'open' }});

  var stil = document.createElement('style');
  stil.textContent = {css_literal};
  W.appendChild(stil);

  // Einzige Regel, die nach draußen wirkt: solange der Chat offen ist, soll
  // die Seite darunter nicht mitscrollen.
  var aussen = document.createElement('style');
  aussen.textContent = 'body.chat-offen{{overflow:hidden}}';
  document.head.appendChild(aussen);

  var huelle = document.createElement('div');
  huelle.innerHTML = {marke};
  while (huelle.firstChild) W.appendChild(huelle.firstChild);

  {js}
}})();
"""


def main() -> int:
    html = io.open(QUELLE, encoding='utf-8').read()
    quelle = bauen(html)
    ziel = ZIEL
    io.open(ziel, 'w', encoding='utf-8').write(quelle)
    print(f'{ziel.name}: {len(quelle):,} Zeichen')
    return 0


if __name__ == '__main__':
    sys.exit(main())
