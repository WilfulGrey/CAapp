#!/usr/bin/env bash
#
# Eigener Arbeitsbereich pro Agenten-Sitzung (CRO, SEO, SEA, …).
#
# WARUM: Mehrere Claude-Sitzungen teilten sich denselben Klon
# (~/SA-Zugang_Neu/CAapp). Wechselt eine davon den Branch, arbeiten die
# anderen ahnungslos weiter — am 16./17.08.2026 sechsmal passiert. Zweimal
# knapp an echtem Schaden vorbei: einmal landeten acht fremde Commits auf
# einem laufenden PR, einmal sieben direkt auf dem Trunk (ein Push hätte CI
# umgangen und wäre ungeprüft auf Prod gegangen). Dazu nimmt `git checkout`
# unkommittete Änderungen kommentarlos auf den fremden Branch mit.
#
# Ein Worktree pro Sitzung beseitigt die Ursache: jede Sitzung hat ihren
# eigenen Branch-Zeiger und ihr eigenes Arbeitsverzeichnis, teilt sich aber
# die Objektdatenbank — kein zweiter Klon, kein zweites Fetch.
#
# ERGEBNIS: ~/SA-Zugang_Neu-<name>/ mit derselben Form wie ~/SA-Zugang_Neu/
# (CAapp/ + .claude/launch.json), damit eine Sitzung dort ohne jede weitere
# Anpassung startet.
#
#   ./scripts/agent-worktree.sh cro            # anlegen
#   ./scripts/agent-worktree.sh cro feature/x  # auf vorhandenem Branch
#   ./scripts/agent-worktree.sh --remove cro   # sauber entfernen
#
set -euo pipefail

TRUNK="${TRUNK:-integration/mamamia-onboarding}"

fehler() { echo "FEHLER: $*" >&2; exit 1; }

# --- Hauptklon finden -------------------------------------------------------
# Funktioniert auch, wenn das Skript AUS einem Worktree heraus läuft: die
# erste Zeile von `worktree list` ist immer der Hauptarbeitsbereich.
SKRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HAUPT="$(git -C "$SKRIPT_DIR" worktree list --porcelain | head -1 | sed 's/^worktree //')"
[ -d "$HAUPT/.git" ] || [ -f "$HAUPT/.git" ] || fehler "Hauptklon nicht gefunden (aus $SKRIPT_DIR)"
ELTERN="$(dirname "$HAUPT")"   # z. B. /Users/…/SA-Zugang_Neu
KLON_NAME="$(basename "$HAUPT")" # CAapp

# --- Entfernen --------------------------------------------------------------
if [ "${1:-}" = "--remove" ] || [ "${1:-}" = "-r" ]; then
  NAME="${2:-}"; [ -n "$NAME" ] || fehler "Aufruf: $0 --remove <name>"
  ZIEL="$ELTERN-$NAME"
  [ -d "$ZIEL/$KLON_NAME" ] || fehler "$ZIEL/$KLON_NAME existiert nicht"
  # --force, weil node_modules und .env.local als "unbekannte Dateien" gelten
  # und git sonst abbricht. Der BRANCH bleibt erhalten — nur der
  # Arbeitsbereich verschwindet, unveröffentlichte Commits gehen nicht verloren.
  # Branchnamen VOR dem Entfernen lesen — danach ist er nicht mehr ermittelbar,
  # und er heißt nicht zwingend wie die Sitzung (zweites Argument beim Anlegen).
  WAR_BRANCH="$(git -C "$ZIEL/$KLON_NAME" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
  git -C "$HAUPT" worktree remove --force "$ZIEL/$KLON_NAME"
  # Nur wegräumen, was DIESES Skript angelegt hat. Bliebe die launch.json
  # liegen, scheiterte ein späteres Neuanlegen an "existiert bereits".
  rm -f "$ZIEL/.claude/launch.json"
  rmdir "$ZIEL/.claude" 2>/dev/null || true
  if ! rmdir "$ZIEL" 2>/dev/null; then
    echo "Hinweis: $ZIEL enthält noch eigene Dateien — bewusst stehen gelassen:"
    ls -A "$ZIEL" | sed 's/^/  /'
  fi
  echo "Entfernt: $ZIEL  (Branch $WAR_BRANCH bleibt bestehen)"
  exit 0
fi

# --- Anlegen ----------------------------------------------------------------
NAME="${1:-}"
[ -n "$NAME" ] || fehler "Aufruf: $0 <sitzungsname> [branch]   |   $0 --remove <name>"
[[ "$NAME" =~ ^[a-z0-9][a-z0-9-]*$ ]] || fehler "Name nur aus Kleinbuchstaben, Ziffern und Bindestrich"
BRANCH="${2:-wt/$NAME}"
ZIEL="$ELTERN-$NAME"
[ -e "$ZIEL" ] && fehler "$ZIEL existiert bereits — erst '$0 --remove $NAME'"

git -C "$HAUPT" worktree prune
git -C "$HAUPT" fetch origin --quiet

echo "→ Worktree $ZIEL/$KLON_NAME auf Branch $BRANCH"
mkdir -p "$ZIEL"
if git -C "$HAUPT" show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git -C "$HAUPT" worktree add "$ZIEL/$KLON_NAME" "$BRANCH" >/dev/null
else
  git -C "$HAUPT" worktree add -b "$BRANCH" "$ZIEL/$KLON_NAME" "origin/$TRUNK" >/dev/null
fi

# --- node_modules -----------------------------------------------------------
# `cp -c` nutzt APFS-clonefile: Sekunden statt Minuten und copy-on-write, der
# Klon kostet also erst Platz, wenn Dateien sich unterscheiden. Auf anderen
# Dateisystemen schlägt -c fehl → ehrlicher Rückfall auf npm ci statt eines
# stillen 1-GB-Vollkopierens.
for UNTER in "." "project 3"; do
  QUELLE="$HAUPT/$UNTER/node_modules"
  [ -d "$QUELLE" ] || continue
  echo "→ node_modules ($UNTER)"
  if ! cp -c -R "$QUELLE" "$ZIEL/$KLON_NAME/$UNTER/node_modules" 2>/dev/null; then
    echo "  APFS-Klon nicht möglich — npm ci"
    (cd "$ZIEL/$KLON_NAME/$UNTER" && npm ci)
  fi
done

# --- gitignorierte Dateien, die eine Sitzung zwingend braucht ---------------
for DATEI in ".env.local" "project 3/.env.local"; do
  if [ -f "$HAUPT/$DATEI" ]; then
    cp "$HAUPT/$DATEI" "$ZIEL/$KLON_NAME/$DATEI"
  else
    echo "  WARNUNG: $DATEI fehlt im Hauptklon — im Worktree ebenfalls nicht vorhanden"
  fi
done

# --- eigene Ports -----------------------------------------------------------
# Zwei Quellen, beide nötig: laufende Server (lsof) UND bereits an andere
# Worktrees VERGEBENE Ports. Nur lsof zu prüfen wäre ein Fehler — legt man
# drei Sitzungen hintereinander an, ohne sie zu starten, bekämen alle drei
# denselben Port und die Kollision fiele erst Tage später auf.
VERGEBEN="$(cat "$ELTERN"*/.claude/launch.json 2>/dev/null \
  | sed -n 's/.*"port"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' | sort -u)"

frei() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1 && return 1
  grep -qx "$1" <<<"$VERGEBEN" && return 1
  return 0
}
finde_port() { local p="$1"; while ! frei "$p"; do p=$((p+1)); done; echo "$p"; }
PORT_NEXT="$(finde_port 3110)"
# Vite-Port erst nach dem Next-Port suchen, damit beide nie derselbe sind.
VERGEBEN="$VERGEBEN
$PORT_NEXT"
PORT_VITE="$(finde_port 5183)"

mkdir -p "$ZIEL/.claude"
cat > "$ZIEL/.claude/launch.json" <<JSON
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "kundenportal",
      "runtimeExecutable": "bash",
      "runtimeArgs": ["-c", "cd $KLON_NAME && npx vite --port $PORT_VITE"],
      "port": $PORT_VITE
    },
    {
      "name": "kostenrechner",
      "runtimeExecutable": "bash",
      "runtimeArgs": ["-c", "cd '$KLON_NAME/project 3' && npx next dev -p $PORT_NEXT"],
      "port": $PORT_NEXT
    }
  ]
}
JSON

cat <<ENDE

Fertig.

  Arbeitsverzeichnis   $ZIEL
  Branch               $BRANCH
  Kostenrechner        Port $PORT_NEXT
  Kundenportal         Port $PORT_VITE

Die Sitzung für "$NAME" ab jetzt mit $ZIEL als Arbeitsverzeichnis starten —
NICHT mehr mit $ELTERN. Dann kann kein anderer Agent mehr den Branch unter
den Füßen wegziehen.

Entfernen: $0 --remove $NAME
ENDE
