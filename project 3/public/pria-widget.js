/* Pria — einbettbarer Beratungs-Chat.
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
(function () {
  if (window.__pria) return;            // zweimal eingebunden: einmal genügt
  window.__pria = true;

  var wurzel = document.createElement('div');
  wurzel.id = 'pria-wurzel';
  document.body.appendChild(wurzel);
  var W = wurzel.attachShadow({ mode: 'open' });

  var stil = document.createElement('style');
  stil.textContent = ':host{\n'+
    '    --coral:#E76F63; --coral-hell:#EC7F73; --coral-tief:#D95A4C;\n'+
    '    --ink:#33302C; --ink-weich:#5C5751; --muted:#918B83;\n'+
    '    --line:#E7E2DB; --line-zart:#F0ECE6; --bg:#F7F5F2; --papier:#FFFFFF;\n'+
    '    --green:#22A06B; --gold:#8B7355;\n'+
    '    /* Bewegung: eine einzige Federkurve für alles, was „aufgeht" —\n'+
    '       daher fühlt sich die ganze Oberfläche wie ein Material an. */\n'+
    '    --feder:cubic-bezier(.22,1,.36,1);\n'+
    '    --weich:cubic-bezier(.4,0,.2,1);\n'+
    '    --schatten-blase:0 1px 2px rgba(40,34,28,.05), 0 6px 16px rgba(40,34,28,.09), 0 24px 48px rgba(40,34,28,.13);\n'+
    '    --schatten-panel:0 1px 2px rgba(40,34,28,.04), 0 10px 28px rgba(40,34,28,.10), 0 40px 80px rgba(40,34,28,.18);\n'+
    '  }\n'+
    '  :host{all:initial;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Inter,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:var(--ink);line-height:1.5}\n'+
    '  *{box-sizing:border-box}\n'+
    '  button{font:inherit;color:inherit}\n'+
    '  button{font:inherit;color:inherit}\n'+
    '\n'+
    '  /* ── Einstieg: nur ein Icon, so groß wie der WhatsApp-Knopf (58 px) ── */\n'+
    '  /* Auf hellen Seiten verschwand die weisse Blase im Hintergrund (Martin,\n'+
    '     21.08.). Jetzt sitzt Pria in einem Korallring — die Hausfarbe hebt sie\n'+
    '     vom Papier ab und sagt zugleich, wer da winkt. Der weisse Spalt dazwischen\n'+
    '     trennt Gesicht und Ring, sonst verschwimmen Haare und Rand. */\n'+
    '  .blase{position:fixed;right:20px;bottom:calc(20px + var(--leiste,0px));width:60px;height:60px;padding:3px;border-radius:50%;\n'+
    '    background:linear-gradient(170deg,var(--coral-hell),var(--coral-tief));border:0;\n'+
    '    box-shadow:0 0 0 2.5px var(--papier), var(--schatten-blase);\n'+
    '    cursor:pointer;z-index:40;display:block;\n'+
    '    /* Kein `animation ... both` mehr: dessen letztes Bild ueberschrieb jede\n'+
    '       spaetere Regel, `.blase.weg` blieb wirkungslos (fiel nur nicht auf,\n'+
    '       weil das offene Panel die Blase ohnehin verdeckt). Der Auftritt ist\n'+
    '       jetzt derselbe Uebergang, der auch das Wegblenden macht — die Blase\n'+
    '       startet klein und unsichtbar und faehrt heraus, sobald sie darf. */\n'+
    '    transition:transform .42s var(--feder), opacity .3s var(--weich), box-shadow .32s var(--weich)}\n'+
    '  .blase:hover{transform:translateY(-3px) scale(1.03)}\n'+
    '  .blase:active{transform:scale(.94)}\n'+
    '  .blase.weg,.blase.schlummert{transform:scale(.7);opacity:0;pointer-events:none}\n'+
    '  .blase .mark{width:100%;height:100%;border-radius:50%;overflow:hidden;display:block}\n'+
    '  .punkt{position:absolute;right:1px;bottom:1px;width:14px;height:14px;border-radius:50%;\n'+
    '    background:#2FC46E;border:2.5px solid var(--papier);box-shadow:0 1px 2px rgba(40,34,28,.2)}\n'+
    '\n'+
    '  /* ── Ansprache beim Scrollen: eine Pille auf Kopfhöhe ──────────────\n'+
    '     Vorbild bild.de (Martin, 21.08.): keine Sprechblase, die aufpoppt,\n'+
    '     sondern ein flacher Streifen NEBEN dem Kopf, in dem eine Frage steht.\n'+
    '     Scrollt der Leser weiter, steht die nächste drin. Der Kopf liegt\n'+
    '     obenauf und überlappt das rechte Ende — deshalb `padding-right`,\n'+
    '     damit kein Text darunter verschwindet. */\n'+
    '  .pille{position:fixed;right:20px;bottom:calc(20px + var(--leiste,0px));\n'+
    '    height:58px;display:none;align-items:center;z-index:39;\n'+
    '    max-width:min(360px,calc(100vw - 40px));\n'+
    '    padding:0 74px 0 17px;border-radius:29px;\n'+
    '    background:var(--papier);border:1px solid rgba(231,111,99,.35);\n'+
    '    box-shadow:var(--schatten-blase);cursor:pointer;text-align:left;\n'+
    '    font:inherit;color:var(--ink);\n'+
    '    transition:transform .42s var(--feder), opacity .3s var(--weich)}\n'+
    '  .pille.on{display:flex}\n'+
    '  .pille.schlummert{transform:translateX(14px) scale(.96);opacity:0;pointer-events:none}\n'+
    '  .pille span{font-size:14px;font-weight:650;line-height:1.28;letter-spacing:-.2px;\n'+
    '    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;\n'+
    '    transition:opacity .22s var(--weich)}\n'+
    '  .pille.wechselt span{opacity:0}\n'+
    '  .pille:active{transform:scale(.98)}\n'+
    '\n'+
    '  /* ── Panel ──────────────────────────────────────────── */\n'+
    '  .panel{position:fixed;right:24px;bottom:24px;width:404px;height:min(690px,84vh);\n'+
    '    background:var(--papier);border-radius:26px;border:1px solid rgba(40,34,28,.07);\n'+
    '    box-shadow:var(--schatten-panel);overflow:hidden;display:none;flex-direction:column;z-index:50;\n'+
    '    transform-origin:calc(100% - 30px) calc(100% - 30px)}\n'+
    '  .panel.on{display:flex;animation:panelAuf .52s var(--feder) both}\n'+
    '  @keyframes panelAuf{\n'+
    '    from{opacity:0;transform:scale(.9) translateY(16px);filter:blur(6px)}\n'+
    '    60%{opacity:1;filter:blur(0)}\n'+
    '    to{opacity:1;transform:none;filter:blur(0)}}\n'+
    '  /* Nach der Öffnungsanimation die Animation abschalten — sonst gewinnt ihr\n'+
    '     fill-forwards gegen die Inline-Höhe, die der Tastatur-Ausgleich setzt. */\n'+
    '  .panel.fertig{animation:none}\n'+
    '\n'+
    '  .bar{background:linear-gradient(175deg,var(--coral-hell) 0%,var(--coral) 55%,var(--coral-tief) 100%);\n'+
    '    color:#fff;padding:15px 16px 14px;display:flex;align-items:center;gap:12px;flex-shrink:0;position:relative}\n'+
    '  .bar::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;background:rgba(0,0,0,.07)}\n'+
    '  .bar .mark{width:43px;height:43px;flex-shrink:0;border-radius:50%;overflow:hidden;display:block;\n'+
    '    box-shadow:0 0 0 2px rgba(255,255,255,.55),0 2px 8px rgba(150,50,40,.28)}\n'+
    '  .bar b{display:flex;align-items:center;gap:8px;font-size:15.5px;line-height:1.15;letter-spacing:-.25px;font-weight:650}\n'+
    '  .kibadge{font-size:9px;font-weight:800;letter-spacing:1px;background:rgba(255,255,255,.2);\n'+
    '    border:1px solid rgba(255,255,255,.42);border-radius:5px;padding:2px 5px 1.5px;backdrop-filter:blur(4px)}\n'+
    '  .bar em{display:block;font-size:11.5px;opacity:.88;font-style:normal;margin-top:3px;letter-spacing:-.05px}\n'+
    '  .zu{margin-left:auto;background:rgba(255,255,255,.16);border:0;color:#fff;width:31px;height:31px;\n'+
    '    border-radius:50%;font-size:15px;cursor:pointer;line-height:1;flex-shrink:0;\n'+
    '    transition:background .18s var(--weich),transform .18s var(--feder)}\n'+
    '  .zu:hover{background:rgba(255,255,255,.28)} .zu:active{transform:scale(.9)}\n'+
    '\n'+
    '  .prog{height:2.5px;background:rgba(40,34,28,.05);flex-shrink:0;overflow:hidden}\n'+
    '  .prog i{display:block;height:100%;width:0;border-radius:0 2px 2px 0;\n'+
    '    background:linear-gradient(90deg,var(--coral-tief),var(--coral-hell));\n'+
    '    box-shadow:0 0 8px rgba(231,111,99,.5);transition:width .62s var(--feder)}\n'+
    '\n'+
    '  .thread{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:18px 15px 8px;background:var(--bg);\n'+
    '    display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}\n'+
    '  .thread::-webkit-scrollbar{width:6px}\n'+
    '  .thread::-webkit-scrollbar-thumb{background:rgba(40,34,28,.14);border-radius:3px}\n'+
    '  .thread::-webkit-scrollbar-track{background:transparent}\n'+
    '\n'+
    '  .row{display:flex;gap:9px;align-items:flex-end;animation:eintritt .42s var(--feder) both}\n'+
    '  .row.me{justify-content:flex-end}\n'+
    '  @keyframes eintritt{\n'+
    '    from{opacity:0;transform:translateY(12px) scale(.97);filter:blur(4px)}\n'+
    '    to{opacity:1;transform:none;filter:blur(0)}}\n'+
    '  .mini{width:28px;height:28px;flex-shrink:0;margin-bottom:2px;border-radius:50%;overflow:hidden;\n'+
    '    box-shadow:0 0 0 1px rgba(40,34,28,.07)}\n'+
    '  .bub{max-width:80%;padding:11px 14px;font-size:14.5px;line-height:1.52;letter-spacing:-.15px;\n'+
    '    border-radius:20px;border-bottom-left-radius:7px;background:var(--papier);\n'+
    '    border:1px solid var(--line-zart);\n'+
    '    box-shadow:0 1px 1px rgba(40,34,28,.03),0 2px 8px rgba(40,34,28,.045)}\n'+
    '  .me .bub{background:linear-gradient(170deg,var(--coral-hell),var(--coral-tief));color:#fff;border-color:transparent;\n'+
    '    border-bottom-left-radius:20px;border-bottom-right-radius:7px;\n'+
    '    box-shadow:0 1px 2px rgba(217,90,76,.25),0 4px 14px rgba(231,111,99,.28)}\n'+
    '  .bub b{font-weight:650}\n'+
    '  .bub small{display:block;font-size:12.5px;color:var(--muted);margin-top:5px;line-height:1.5}\n'+
    '\n'+
    '  .typing{display:flex;gap:4.5px;padding:14px 16px;align-items:center}\n'+
    '  .typing i{width:6px;height:6px;border-radius:50%;background:#C6C0B7;animation:puls 1.3s var(--weich) infinite}\n'+
    '  .typing i:nth-child(2){animation-delay:.16s}.typing i:nth-child(3){animation-delay:.32s}\n'+
    '  @keyframes puls{0%,62%,100%{opacity:.32;transform:translateY(0) scale(.9)}\n'+
    '                  28%{opacity:1;transform:translateY(-3.5px) scale(1)}}\n'+
    '\n'+
    '  /* Avatar-Frames: Ruhe + Blinzeln aus zwei gerenderten Bildern */\n'+
    '  .pav{position:relative;width:100%;height:100%;display:block}\n'+
    '  .pav img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}\n'+
    '  .pav img.zu{opacity:0;animation:blinzeln 5.4s infinite}\n'+
    '  @keyframes blinzeln{0%,92.8%,100%{opacity:0}94.5%{opacity:1}96.2%{opacity:0}}\n'+
    '  /* Seitenblick: derselbe Kopf, anderer Frame — alle 23 s für gut eine Sekunde.\n'+
    '     Zusammen mit dem Blinzeln entsteht ein unregelmäßiges Muster, weil sich die\n'+
    '     Perioden (5,4 s / 23 s / 7,7 s) nicht überlagern. */\n'+
    '  .pav img.denk{opacity:0;animation:seitenblick 23s infinite}\n'+
    '  @keyframes seitenblick{0%,87.5%,100%{opacity:0}89.4%,92.6%{opacity:1}94.4%{opacity:0}}\n'+
    '  /* Atem: knapp einen Pixel Hub, kaum messbar, aber der Kopf steht nicht mehr still.\n'+
    '     Nur die grossen Avatare (Kopfzeile + Blase) — im Verlauf waere es Unruhe. */\n'+
    '  .bar .pav, .blase .pav{animation:atmen 7.7s ease-in-out infinite}\n'+
    '  @keyframes atmen{\n'+
    '    0%{transform:none}\n'+
    '    28%{transform:translateY(-.9px) scale(1.014)}\n'+
    '    52%{transform:translateY(-.2px) scale(1.005)}\n'+
    '    76%{transform:translateY(-1.1px) scale(1.017)}\n'+
    '    100%{transform:none}}\n'+
    '\n'+
    '  .card{max-width:88%;background:var(--papier);border:1px solid var(--line-zart);border-radius:20px;\n'+
    '    border-bottom-left-radius:7px;padding:14px;\n'+
    '    box-shadow:0 1px 1px rgba(40,34,28,.03),0 3px 12px rgba(40,34,28,.06)}\n'+
    '  .faces{display:flex;margin-bottom:10px}\n'+
    '  .faces span{width:35px;height:35px;border-radius:50%;overflow:hidden;border:2.5px solid var(--papier);\n'+
    '    margin-left:-10px;box-shadow:0 1px 3px rgba(40,34,28,.12)}\n'+
    '  .faces span:first-child{margin-left:0}\n'+
    '  .faces img{width:100%;height:100%;object-fit:cover;display:block}\n'+
    '  .anim{display:flex;align-items:center;gap:10px;font-size:13.5px;margin:7px 0;color:#B5AEA5;\n'+
    '    transition:color .4s var(--weich);letter-spacing:-.1px}\n'+
    '  .anim.on,.anim.ok{color:var(--ink)}\n'+
    '  .ring{width:21px;height:21px;border-radius:50%;border:2px solid var(--line);flex-shrink:0;\n'+
    '    display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;\n'+
    '    transition:background .3s var(--weich),border-color .3s var(--weich)}\n'+
    '  .anim.on .ring{border-color:var(--green);border-top-color:transparent;animation:dreh .75s linear infinite}\n'+
    '  .anim.ok .ring{background:var(--green);border-color:var(--green);animation:none}\n'+
    '  @keyframes dreh{to{transform:rotate(360deg)}}\n'+
    '  .feld{width:100%;padding:12px 14px;border:1.5px solid var(--line);border-radius:13px;font-size:15px;\n'+
    '    margin-bottom:8px;font-family:inherit;background:#FCFBF9;color:var(--ink);\n'+
    '    transition:border-color .2s var(--weich),box-shadow .2s var(--weich),background .2s var(--weich)}\n'+
    '  .feld::placeholder{color:#B3ADA4}\n'+
    '  .feld:focus{outline:none;border-color:var(--coral);background:var(--papier);\n'+
    '    box-shadow:0 0 0 3.5px rgba(231,111,99,.13)}\n'+
    '  .go{width:100%;padding:14px;border:0;border-radius:13px;color:#fff;font-size:15.5px;font-weight:700;\n'+
    '    letter-spacing:-.2px;font-family:inherit;cursor:pointer;\n'+
    '    background:linear-gradient(175deg,#2BB077,#1D9160);\n'+
    '    box-shadow:0 1px 2px rgba(24,120,80,.3),0 5px 16px rgba(34,160,107,.3);\n'+
    '    transition:transform .2s var(--feder),box-shadow .2s var(--weich)}\n'+
    '  .go:hover{box-shadow:0 1px 2px rgba(24,120,80,.3),0 8px 22px rgba(34,160,107,.38)}\n'+
    '  .go:active{transform:scale(.978)}\n'+
    '  /* Grau und ohne Schatten, solange Name, E-Mail und Telefon nicht stehen —\n'+
    '     ein Knopf, der nichts tut, ist schlimmer als ein sichtbar gesperrter. */\n'+
    '  .go:disabled{background:#DCD7CF;color:#8C857B;box-shadow:none;cursor:not-allowed;transform:none}\n'+
    '  .klein{font-size:11px;color:var(--muted);text-align:center;margin:9px 0 0;line-height:1.5}\n'+
    '  .mensch{display:flex;gap:12px;align-items:center;background:#FBF8F2;border:1px solid #EBE4D8;\n'+
    '    border-radius:16px;padding:11px 13px}\n'+
    '  .mensch img{width:48px;height:48px;border-radius:50%;object-fit:cover;flex-shrink:0;\n'+
    '    box-shadow:0 1px 4px rgba(40,34,28,.14)}\n'+
    '  .mensch p{margin:0;font-size:13.5px;line-height:1.52;color:var(--ink-weich)}\n'+
    '  .mensch b{color:var(--ink);font-weight:650}\n'+
    '\n'+
    '  /* ── Antwortchips + Eingabe ─────────────────────────── */\n'+
    '  .unten{flex-shrink:0;background:var(--papier);border-top:1px solid var(--line-zart);\n'+
    '    padding-bottom:env(safe-area-inset-bottom)}\n'+
    '  .chips{display:flex;flex-wrap:wrap;gap:8px;padding:13px 13px 3px;max-height:36vh;overflow-y:auto}\n'+
    '  .chips::-webkit-scrollbar{width:5px}\n'+
    '  .chips::-webkit-scrollbar-thumb{background:rgba(40,34,28,.12);border-radius:3px}\n'+
    '  /* max-width: ohne das schiesst ein langer Chip aus dem Panel heraus —\n'+
    '     Flex-Kinder schrumpfen von sich aus nicht unter ihren Inhalt. */\n'+
    '  .chip{max-width:100%;border:1.5px solid rgba(231,111,99,.55);background:var(--papier);color:var(--coral-tief);\n'+
    '    font-weight:600;font-size:13.5px;letter-spacing:-.15px;padding:9px 15px;border-radius:999px;cursor:pointer;\n'+
    '    box-shadow:0 1px 2px rgba(40,34,28,.04);\n'+
    '    animation:chipRein .38s var(--feder) both;\n'+
    '    transition:transform .2s var(--feder),background .18s var(--weich),box-shadow .2s var(--weich),border-color .18s var(--weich)}\n'+
    '  .chip:hover{background:#FEF6F4;border-color:var(--coral);transform:translateY(-1.5px);\n'+
    '    box-shadow:0 2px 6px rgba(40,34,28,.07)}\n'+
    '  .chip:active{transform:scale(.955)}\n'+
    '  .chip.soft{border-color:var(--line);color:var(--ink-weich);font-weight:500;background:#FCFBF9}\n'+
    '  .chip.wa{background:#25D366;border-color:transparent;color:#fff;\n'+
    '    box-shadow:0 1px 2px rgba(21,150,72,.28),0 4px 12px rgba(37,211,102,.28)}\n'+
    '  .chip.wa:hover{background:#20BE5C}\n'+
    '  .chip.stark{background:linear-gradient(175deg,var(--coral-hell),var(--coral-tief));color:#fff;\n'+
    '    border-color:transparent;box-shadow:0 1px 2px rgba(217,90,76,.28),0 4px 12px rgba(231,111,99,.28)}\n'+
    '  .chip.stark:hover{box-shadow:0 2px 4px rgba(217,90,76,.3),0 7px 18px rgba(231,111,99,.36)}\n'+
    '  @keyframes chipRein{from{opacity:0;transform:translateY(9px) scale(.94)}to{opacity:1;transform:none}}\n'+
    '  /* Der fliegende Klon, der vom Chip zur Sprechblase wandert */\n'+
    '  .flug{position:fixed;z-index:99;pointer-events:none;border-radius:999px;\n'+
    '    display:flex;align-items:center;justify-content:center;\n'+
    '    background:linear-gradient(175deg,var(--coral-hell),var(--coral-tief));color:#fff;\n'+
    '    font-weight:600;font-size:13.5px;letter-spacing:-.15px;white-space:nowrap;padding:0 15px;\n'+
    '    box-shadow:0 4px 14px rgba(231,111,99,.32)}\n'+
    '\n'+
    '  .eingabe{display:flex;gap:9px;padding:11px 13px 14px;align-items:center}\n'+
    '  .eingabe input{flex:1;padding:12px 16px;border:1.5px solid var(--line);border-radius:999px;\n'+
    '    font-size:14.5px;font-family:inherit;background:var(--bg);color:var(--ink);\n'+
    '    transition:border-color .2s var(--weich),box-shadow .2s var(--weich),background .2s var(--weich)}\n'+
    '  .eingabe input::placeholder{color:#B3ADA4}\n'+
    '  .eingabe input:focus{outline:none;border-color:var(--coral);background:var(--papier);\n'+
    '    box-shadow:0 0 0 3.5px rgba(231,111,99,.13)}\n'+
    '  .send{width:41px;height:41px;border-radius:50%;border:0;color:#fff;font-size:16px;cursor:pointer;flex-shrink:0;\n'+
    '    background:linear-gradient(175deg,var(--coral-hell),var(--coral-tief));\n'+
    '    box-shadow:0 1px 2px rgba(217,90,76,.28),0 4px 12px rgba(231,111,99,.3);\n'+
    '    transition:transform .2s var(--feder),box-shadow .2s var(--weich)}\n'+
    '  .send:hover{box-shadow:0 2px 4px rgba(217,90,76,.3),0 7px 18px rgba(231,111,99,.38)}\n'+
    '  .send:active{transform:scale(.92)}\n'+
    '\n'+
    '  @media(prefers-reduced-motion:reduce){\n'+
    '    *,*::before,*::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;\n'+
    '      transition-duration:.01ms !important}\n'+
    '    .thread{scroll-behavior:auto}\n'+
    '  }\n'+
    '\n'+
    '  /* ══ Handy ═════════════════════════════════════════════════════════\n'+
    '     Bewusst als LETZTER Block: Selektoren wie .bub oder .chip haben\n'+
    '     dieselbe Spezifität wie ihre Grundregeln — stünde das hier oben,\n'+
    '     würden die Grundregeln alles wieder überschreiben. Genau das war\n'+
    '     vorher der Fall: außer .panel war der ganze Block wirkungslos. */\n'+
    '  /* 640 statt 540: auch breitere Handys und kleine Falter im Hochformat\n'+
    '     bekommen die Vollbild-Ansicht, nicht das schwebende Kästchen. */\n'+
    '  @media(max-width:640px){\n'+
    '    /* An allen vier Kanten festgenagelt statt width:100% + height:100dvh.\n'+
    '       Prozente und dvh lösen sich gegen den Ursprungs-Container auf, und der\n'+
    '       ist nicht immer das, was der Nutzer sieht — auf schmalen Geräten hingen\n'+
    '       Kopfzeile und Sprechblasen dadurch rechts aus dem Bild, oben blieb ein\n'+
    '       Streifen der Seite stehen. inset lässt keinen Spielraum. */\n'+
    '    .panel{top:0;right:0;bottom:0;left:0;width:auto;height:auto;max-height:none;\n'+
    '      border-radius:0;border:0;transform-origin:bottom center}\n'+
    '    /* Kopfzeile schiebt sich unter der Notch/Insel hervor, Eingabe über den\n'+
    '       Home-Balken. Ohne das klebt beides an den Systemelementen. */\n'+
    '    .bar{padding-top:calc(15px + env(safe-area-inset-top))}\n'+
    '    /* Auf dem Handy liest sich alles eine Spur größer besser, und die Blasen\n'+
    '       dürfen breiter werden — 80 % von 375 px ist unnötig schmal. */\n'+
    '    .thread{padding:16px 14px 10px;gap:11px}\n'+
    '    .bub{max-width:84%;font-size:15.5px}\n'+
    '    .bub small{font-size:12px}\n'+
    '    /* Chips dürfen dem Verlauf nicht den halben Schirm wegnehmen. */\n'+
    '    .chips{max-height:min(30dvh,196px);padding:12px 12px 3px}\n'+
    '\n'+
    '    /* Der Verlauf ist der Chat — er darf nie ganz verschwinden.\n'+
    '\n'+
    '       `flex:1` heisst `flex:1 1 0%`, die Basis ist also null: bei knappem\n'+
    '       Platz gab der Verlauf alles ab, waehrend die Chips ihre 196 px\n'+
    '       behielten (`dvh` schrumpft nicht mit der Tastatur). Mit offener\n'+
    '       Tastatur sah man dadurch einen leeren grauen Streifen, darunter drei\n'+
    '       Reihen Knoepfe und die Eingabezeile — kein Chat, ein Formularfetzen.\n'+
    '       Eine Mindesthoehe dreht die Rangfolge um: erst das Gespraech, dann\n'+
    '       die Vorschlaege. */\n'+
    '    .thread{min-height:112px}\n'+
    '\n'+
    '    /* Und waehrend getippt wird, zaehlt das Geschriebene. Die Vorschlaege\n'+
    '       weichen auf eine seitlich schiebbare Reihe aus, statt drei Reihen zu\n'+
    '       umbrechen — das gibt dem Gespraech rund 150 px zurueck, ohne dass\n'+
    '       ein Knopf verloren geht. */\n'+
    '    .panel.tippt .chips{flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;\n'+
    '      max-height:none;padding:10px 12px;scrollbar-width:none;\n'+
    '      -webkit-overflow-scrolling:touch;\n'+
    '      /* Als eigener Streifen lesbar, sonst stoesst die letzte Sprechblase\n'+
    '         ohne Absatz an die Knoepfe. */\n'+
    '      border-top:1px solid var(--line);background:var(--papier)}\n'+
    '    .panel.tippt .thread{padding-bottom:14px}\n'+
    '    .panel.tippt .chips::-webkit-scrollbar{display:none}\n'+
    '    .panel.tippt .chip{flex:0 0 auto}\n'+
    '    .chip{font-size:14px;padding:10px 16px}\n'+
    '    .mensch p{font-size:15px}\n'+
    '    .klein{font-size:12px}\n'+
    '    .eingabe input{font-size:16px}   /* unter 16 px zoomt iOS beim Fokus hinein */\n'+
    '    .blase{right:16px;bottom:calc(16px + var(--leiste,0px) + env(safe-area-inset-bottom))}\n'+
    '    /* Die Pille laeuft bis kurz vor den linken Rand — auf dem Handy ist\n'+
    '       Platz knapp, und zwei Zeilen Frage brauchen ihn. */\n'+
    '    .pille{right:16px;bottom:calc(16px + var(--leiste,0px) + env(safe-area-inset-bottom));\n'+
    '      max-width:calc(100vw - 32px)}\n'+
    '    .pille span{font-size:14.5px}\n'+
    '  }\n'+
    '  /* ══ Voll-Chat: /beratung ══════════════════════════════════════════\n'+
    '     data-pria-voll am <html> (setzt die Landingpage, bevor dieses Skript\n'+
    '     läuft) schaltet den Chat von „schwebt über der Seite" auf „ist die\n'+
    '     Seite": das Panel füllt das Fenster zwischen der Kopfzeile der Seite\n'+
    '     (--pria-oben) und ihrem Pflichtlinks-Streifen (--pria-unten); Blase,\n'+
    '     Pille und ✕ gibt es dort nicht. Beide Variablen setzt die Seite an\n'+
    '     :root — Custom Properties durchqueren die Shadow-Grenze, all:initial\n'+
    '     am :host setzt sie NICHT zurück.\n'+
    '     Steht bewusst NACH dem Handy-Block: .panel.voll gewinnt per\n'+
    '     Spezifität gegen dessen .panel — die Reihenfolge-Falle von oben\n'+
    '     betrifft nur gleichrangige Selektoren. Öffnet sich die Tastatur,\n'+
    '     überschreiben die Inline-Styles aus handyLayout() das hier ohnehin. */\n'+
    '  .panel.voll{top:var(--pria-oben,0px);right:0;bottom:var(--pria-unten,0px);left:0;\n'+
    '    width:auto;height:auto;max-height:none;margin:0 auto;max-width:620px;\n'+
    '    border-radius:0;border:0;box-shadow:none;transform-origin:bottom center}\n'+
    '  @media(min-width:641px){\n'+
    '    /* Auf dem Desktop als Säule auf der Bühne, nicht als Vollbild-Fläche. */\n'+
    '    .panel.voll{border-radius:24px 24px 0 0;border:1px solid rgba(40,34,28,.07);\n'+
    '      border-bottom:0;box-shadow:var(--schatten-panel)}\n'+
    '  }\n'+
    '  .panel.voll .zu{display:none}\n'+
    '  /* Notch und Statusleiste übernimmt die Kopfzeile der Seite. */\n'+
    '  .panel.voll .bar{padding-top:15px}\n'+
    '  /* Solange der Chat offen ist, soll die Seite darunter nicht mitscrollen. */';
  W.appendChild(stil);

  // Einzige Regel, die nach draußen wirkt: solange der Chat offen ist, soll
  // die Seite darunter nicht mitscrollen.
  var aussen = document.createElement('style');
  aussen.textContent = 'body.chat-offen{overflow:hidden}';
  document.head.appendChild(aussen);

  var huelle = document.createElement('div');
  huelle.innerHTML = '<!-- WIDGET AB HIER — alles darueber ist die angedeutete Website -->\n'+
    '<button class="pille" id="pille" aria-label="Frage an Pria stellen"><span id="pillentext"></span></button>\n'+
    '\n'+
    '<button class="blase" id="blase" aria-label="Beratung öffnen">\n'+
    '  <span class="mark"></span><span class="punkt"></span>\n'+
    '</button>\n'+
    '\n'+
    '<div class="panel" id="panel">\n'+
    '  <div class="bar">\n'+
    '    <span class="mark"></span>\n'+
    '    <div>\n'+
    '      <b>Pria von Primundus</b>\n'+
    '      <em id="status">KI-gestützte Assistentin</em>\n'+
    '    </div>\n'+
    '    <button class="zu" id="zu" aria-label="Chat schließen">✕</button>\n'+
    '  </div>\n'+
    '  <div class="prog"><i id="prog"></i></div>\n'+
    '  <div class="thread" id="thread"></div>\n'+
    '  <div class="unten">\n'+
    '    <div class="chips" id="chips"></div>\n'+
    '    <div class="eingabe">\n'+
    '      <input id="frei" placeholder="Nachricht eingeben …" autocomplete="off" aria-label="Nachricht">\n'+
    '      <button class="send" id="senden" aria-label="Senden">➤</button>\n'+
    '    </div>\n'+
    '  </div>\n'+
    '</div>';
  while (huelle.firstChild) W.appendChild(huelle.firstChild);

  
const PRIA={ruhe:'data:image/jpeg;base64,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', zu:'data:image/jpeg;base64,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', denk:'data:image/jpeg;base64,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', gruss:'data:image/jpeg;base64,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'};
const MARTA='data:image/jpeg;base64,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';
const PKS=['data:image/jpeg;base64,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','data:image/jpeg;base64,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','data:image/jpeg;base64,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','data:image/jpeg;base64,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','data:image/jpeg;base64,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'];
const ruhig=matchMedia('(prefers-reduced-motion: reduce)').matches;
/* Voll-Chat-Modus (Landingpage /beratung): die Seite setzt data-pria-voll,
   bevor dieses Skript läuft. Dann ist der Chat die Seite — sofort offen,
   ohne Blase, Pille und ✕ (Panel-Lage: .panel.voll im Stylesheet). */
const VOLL=document.documentElement.hasAttribute('data-pria-voll');

const thread=W.getElementById('thread'),chips=W.getElementById('chips'),prog=W.getElementById('prog');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const tipp=(m=8)=>navigator.vibrate&&navigator.vibrate(m);
let modus='beraten', offeneFrage=null, gestartet=false;
// Wie weit ist der Kunde? Nicht mitzaehlen, sondern am Zustand ablesen —
// so bleibt es auch nach Nachtraegen und Rueckfragen richtig.
let kontaktOffen=false, uebergeben=false;
const frageNummer=s=>s?FLOW.indexOf(s)+1:0;

/* ─── Bausteine ───────────────────────────────────────────────────── */
function avatar(src,mitBlinzeln,lebendig){
  if(!mitBlinzeln) return '<span class="pav"><img src="'+src+'" alt=""></span>';
  return '<span class="pav"><img src="'+PRIA.ruhe+'" alt="">'+
         (lebendig?'<img class="denk" src="'+PRIA.denk+'" alt="">':'')+
         '<img class="zu" src="'+PRIA.zu+'" alt=""></span>';
}
function runter(){thread.scrollTop=thread.scrollHeight;}

/* ─── Gesprächsprotokoll ────────────────────────────────────────────
   Jede Sprechblase wandert in eine Datei auf dem Server, zusammen mit
   der Marke, an der die Kontaktdaten abgeschickt wurden. Damit lässt
   sich ein Lead hinterher gegenlesen: was stand VOR der Kontaktaufnahme
   im Gespräch, was danach. Gepuffert und gesammelt geschickt — nicht
   eine Anfrage je Blase. */
const SID=(()=>{ let v=null;
  try{ v=sessionStorage.getItem('pria-sid'); }catch(e){}
  if(!v){ v=Date.now().toString(36)+Math.random().toString(36).slice(2,8);
          try{ sessionStorage.setItem('pria-sid',v); }catch(e){} }
  return v; })();
const puffer=[];
/* Wo es keine Protokoll-Route gibt (im Kostenrechner gibt es sie noch nicht),
   wird nach dem ersten Fehlschlag nicht weiter geschickt — sonst feuert das
   Widget alle 1,5 s ins Leere. Der eigentliche Platz dafür sind die
   lead_events; bis dahin schluckt es der Chat still. */
let protokollAus=false;
function protokoll(rolle,text,extra){
  const rein=String(text||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  if(!rein && !(extra&&extra.ereignis)) return;
  puffer.push(Object.assign({zeit:new Date().toISOString(),rolle,text:rein},extra||{}));
}
function spuelen(beimGehen){
  if(protokollAus){ puffer.length=0; return; }
  if(!puffer.length) return;
  const koerper=JSON.stringify({sid:SID,zeilen:puffer.splice(0,puffer.length)});
  if(beimGehen&&navigator.sendBeacon)
    return navigator.sendBeacon('/api/pria/protokoll',new Blob([koerper],{type:'application/json'}));
  fetch('/api/pria/protokoll',{method:'POST',headers:{'content-type':'application/json'},body:koerper})
    .then(r=>{ if(r.status===404||r.status===405) protokollAus=true; })
    .catch(()=>{ protokollAus=true; });
}
setInterval(spuelen,1500);
addEventListener('pagehide',()=>spuelen(true));

function bub(html,mir){
  const r=document.createElement('div');r.className='row'+(mir?' me':'');
  r.innerHTML=(mir?'':'<div class="mini">'+avatar(null,true)+'</div>')+'<div class="bub">'+html+'</div>';
  thread.appendChild(r);runter();
  protokoll(mir?'kunde':'pria',html);
  return r;
}
function tippt(){
  const r=document.createElement('div');r.className='row';
  // Während sie „tippt", schaut sie kurz zur Seite — dasselbe Gesicht,
  // anderer Frame. Das ist der Unterschied zwischen Avatar und Standbild.
  r.innerHTML='<div class="mini">'+avatar(PRIA.denk)+'</div><div class="bub typing"><i></i><i></i><i></i></div>';
  thread.appendChild(r);runter();return r;
}
function sagen(html,extra){
  return new Promise(res=>{const t=tippt();
    setTimeout(()=>{t.remove();bub(html+(extra?'<small>'+extra+'</small>':''));res();},
      ruhig?120:Math.min(2500,780+html.length*13));});
}
function setChips(liste){
  chips.innerHTML='';
  liste.forEach((c,i)=>{const b=document.createElement('button');
    b.className='chip'+(c.stil?' '+c.stil:'');b.textContent=c.t;
    b.style.animationDelay=(i*70)+'ms';b.onclick=()=>c.f(b);chips.appendChild(b);});
  runter();
}
/* Der angetippte Chip fliegt an seinen Platz im Verlauf, statt zu
   verschwinden und woanders neu aufzutauchen. Erst wenn er angekommen
   ist, erscheint die echte Sprechblase — deshalb wirkt es wie ein
   Objekt, das sich bewegt, und nicht wie zwei Zustände. */
function flug(chip,text){
  return new Promise(res=>{
    if(ruhig||!chip||!chip.animate){bub(text,true);return res();}
    const von=chip.getBoundingClientRect();
    const klon=document.createElement('div');
    klon.className='flug';klon.textContent=text;
    klon.style.left=von.left+'px';klon.style.top=von.top+'px';
    klon.style.width=von.width+'px';klon.style.height=von.height+'px';
    W.appendChild(klon);
    chips.innerHTML='';
    const zeile=bub(text,true);
    const ziel=zeile.querySelector('.bub');
    ziel.style.visibility='hidden';
    const nach=ziel.getBoundingClientRect();
    const sx=nach.width/von.width, sy=nach.height/von.height;
    /* Notausgang (22.08.): Bis hierher haing die GANZE Unterhaltung an
       `onfinish`. Feuert das nicht, loest dieses Promise nie auf — und
       weil `starteFunnel` darauf wartet, steht der Chat fuer immer still:
       keine Frage, keine Chips, nichts. Genau das hat Martin gesehen, als
       er nach dem Rueckruf doch ein Angebot wollte.

       Und es gibt reichlich Gruende, warum es nicht feuert: eine
       Zeitleiste, die nicht laeuft (Tab im Hintergrund, Seite gerade nicht
       gezeichnet), iOS waehrend der Tastatur-Animation, ungueltige Werte,
       wenn eine der beiden Boxen keine Groesse hat. Eine Verzierung darf
       das Gespraech nicht aufhalten — deshalb loest jetzt zusaetzlich ein
       Wecker, und wer zuerst kommt, gewinnt. */
    let erledigt=false;
    const schluss=()=>{
      if(erledigt) return; erledigt=true;
      klon.remove(); ziel.style.visibility=''; res();
    };
    klon.animate([
      {transform:'none',borderRadius:'999px',opacity:1},
      {transform:`translate(${nach.left-von.left}px,${nach.top-von.top}px) scale(${sx},${sy})`,
       borderRadius:'20px',opacity:1}
    ],{duration:380,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'})
    .onfinish=schluss;
    setTimeout(schluss,900);
  });
}
/* Vorrat an Schnellfragen. Beantwortetes verschwindet, das Nächste rückt nach —
   niemand soll zweimal dieselbe Frage angeboten bekommen. */
/* Was in der Pille steht, entscheidet, ob jemand den Chat ueberhaupt oeffnet.
   Deshalb eine eigene, kurze Liste — nicht die Chip-Fragen von unten (die
   duerfen breiter streuen). Reihenfolge nach Zugkraft (Martin, 21.08.):
   erst der Preis, dann die Dringlichkeit, dann unser Alleinstellungsmerkmal,
   danach die zwei grossen Einwaende. Formuliert, wie ein Angehoeriger denkt —
   nicht wie eine FAQ-Ueberschrift. */
const PILLENFRAGEN=[
  'Was kostet das bei uns?',
  'Wie schnell kann jemand da sein?',
  'Kann ich die Pflegekraft vorher sehen?',
  'Ist das legal — mit Anmeldung und allem?',
  'Was passiert, wenn die Kraft krank wird?'
];
const SCHNELLFRAGEN=[
  'Was kostet das?',
  'Ist das legal?',
  'Wie schnell geht das?',
  'Kann ich jederzeit kündigen?',
  'Was ist, wenn die Pflegekraft krank wird?',
  'Kann ich die Pflegekraft aussuchen?',
  'Was macht die Pflegekraft genau?',
  'Was ist, wenn meine Mutter ins Krankenhaus muss?',
  'Braucht sie ein eigenes Zimmer?'
];
const beantwortet=new Set();
/* Springt zum Kontaktfeld und setzt den Fokus in die erste Luecke. Der Kunde
   hatte die Karte oben im Verlauf und musste selbst danach suchen. */
function zumKontakt(){
  const knopf=W.getElementById('abs');
  if(!knopf) return false;
  const karte=knopf.closest('.row')||knopf.closest('.card');
  if(karte) karte.scrollIntoView({behavior:ruhig?'auto':'smooth',block:'center'});
  const leer=['kname','kmail','ktel'].map(i=>W.getElementById(i)).find(f=>f&&!f.value.trim());
  if(leer) setTimeout(()=>leer.focus(),ruhig?0:420);
  return true;
}

function beraterChips(){
  /* Stehen alle Angaben und fehlen nur die Kontaktdaten, ist alles andere
     Ablenkung (Martin, 21.08.): keine Wissensfragen, kein „Preis berechnen" —
     der Preis ist ja gerechnet. Nur der eine Weg, und der Hinweis, dass es
     auch getippt geht. */
  if(kontaktOffen){
    return setChips([
      {t:'Meine Daten eintragen',stil:'stark',f:()=>{chips.innerHTML='';zumKontakt();}},
      {t:'Lieber hier im Chat',stil:'soft',f:async()=>{
        chips.innerHTML='';
        await sagen('Gern — schreiben Sie mir einfach <b>Name, E-Mail und Telefon</b> in einer Zeile. '+
                    'Ich trage es dann oben für Sie ein.');
        W.getElementById('frei').focus();
      }}
    ]);
  }
  const offen=SCHNELLFRAGEN
    .filter(q=>{const e=suche(q);return !e||!beantwortet.has(e);})
    .slice(0,3)
    .map(q=>({t:q,f:b=>frage(q,b)}));
  /* Die zwei Wege zuerst, die Wissensfragen danach (Martin, 22.08.).
     Vorher standen sie hinten — beim Umbruch in mehrere Reihen ging das
     noch, in der einreihigen Tipp-Ansicht rutschten sie aus dem Bild und
     man sah nur noch die Fragen. */
  setChips([
    {t:'Preis berechnen',stil:'stark',f:b=>starteFunnel('preis',b)},
    {t:'Pflegekräfte ansehen',stil:'stark',f:b=>starteFunnel('kraefte',b)},
    ...offen
  ]);
}

/* ─── Wissen aus unseren eigenen Inhalten ──────────────────────────── */
const WISSEN=[
 {w:['kost','preis','teuer','euro','geld','bezahl','monat'],q:'Kostenseite',
  weiter:'Wenn Sie mögen, rechne ich Ihnen das konkret aus: <b>acht kurze Fragen</b>, danach sehen Sie '+
         'Ihren Preis — und gleich die Pflegekräfte, die zu Ihrer Situation passen.',
  // Kurz halten (Martin, 21.08.): ein fester Monatspreis, und das Angebot,
  // ihn auszurechnen. Alles Weitere — Pflegegeld, An-/Abreise, Zuschlaege —
  // steht im Angebot und kommt auf Nachfrage, nicht als Vorabvortrag.
  a:'Sie zahlen an uns einen <b>festen Monatspreis</b> für die Betreuung — keine Vermittlungsgebühr, '+
    'keine versteckten Posten. Wie hoch er ist, hängt ganz von Ihrer Situation ab.'},
 {w:['legal','recht','anmeld','schwarz','sozialver','a1','mindestlohn','illegal'],q:'Über uns',
  a:'Ja — und zwar ohne Grauzone. Die Betreuungskräfte sind <b>bei uns fest angestellt</b>. '+
    'Wir schicken Ihnen niemanden, den Sie dann selbst beschäftigen müssen: Anmeldung, Sozialversicherung, '+
    'A1-Bescheinigung und Mindestlohn laufen über uns.'},
 {w:['schnell','wann','dauer','wie lang','sofort','start','eilig','werktag'],q:'Ablauf',
  a:'Meist ist die Kraft in <b>4 bis 7 Werktagen</b> bei Ihnen — im Notfall auch schneller. '+
    'Das Angebot mit passenden Kräften sehen Sie sofort, Sie müssen also nicht warten, um zu wissen, '+
    'woran Sie sind.<br><br>Wenn es bei Ihnen eilt, sagen Sie es mir gleich: Dann priorisieren wir.'},
 {w:['kündig','vertrag','bindung','laufzeit','frist'],q:'Konditionen',
  a:'Sie schließen <b>keinen Vertrag, bevor Sie eine Kraft ausgewählt haben</b>. Danach ist täglich '+
    'kündbar und taggenau abgerechnet — Sie zahlen nie einen angefangenen Monat zu Ende.'},
 {w:['urlaub','krank','ausfall','ersatz','wechsel','turnus'],q:'Leistungen',
  a:'Sie stehen nie ohne da: Fällt Ihre Kraft aus, stellen wir <b>Ersatz</b>. Beim regulären Wechsel '+
    'wissen Sie vorher, wer als Nächstes kommt.'},
 {w:['krankenhaus','klinik','reha','stationär','aufenthalt'],q:'Krankenhaus & Wechsel',
  a:'Bis zu <b>sieben Tage</b> Abwesenheit ändern nichts am Vertrag. Ab dem achten Tag <b>ruht er '+
    'kostenlos</b>, bis die Betreuung weitergeht — Sie zahlen also nicht für eine leere Wohnung.'},
 {w:['pflegegrad','antrag','kasse','pflegegeld','mdk','begutacht'],q:'Ratgeber Pflegegrad',
  a:'Ohne Pflegegrad können Sie trotzdem starten. Den Antrag stellen Sie parallel — er gilt <b>rückwirkend '+
    'ab Antragstellung</b>, Sie verlieren also kein Geld. Die Anleitung dafür bekommen Sie von uns.'},
 {w:['aussuchen','auswahl','profil','wer kommt','seh','foto','kennenlern','finde','finden','suche','suchen','wie komme ich','bekomme ich','wie funktioniert','ablauf','wie läuft'],q:'Kundenportal',
  weiter:'Ich kann Ihnen die passenden Profile gleich zeigen — dafür brauche ich acht kurze Angaben.',
  a:'Das ist der Unterschied zu den meisten: Sie <b>sehen die Kräfte vorher</b> — Profil, Erfahrung, '+
    'Sprachniveau — und suchen selbst aus. Nicht wir entscheiden, wer bei Ihrer Mutter einzieht.'},
 {w:['gebühr','provision','vermittlungs','versteck','zusatz'],q:'Kostenseite',
  a:'Es gibt <b>keine Vermittlungsgebühr</b> und keine versteckten Posten. Sie zahlen die Betreuung, sonst nichts.'},
 {w:['deutsch','sprach','spricht','verständ','polnisch'],q:'Pflegekräfte',
  a:'Sie bestimmen das Niveau. „Kommunikativ“ reicht für den Alltag; bei Schwerhörigkeit oder Demenz '+
    'empfehle ich <b>„Gut“</b> — das kostet etwas mehr, spart Ihnen aber viel Ärger.'},
 {w:['aufgabe','macht','tätig','koch','wasch','putz','spritz','medikament','behandlungs'],q:'Leistungen',
  a:'Die Kraft übernimmt Haushalt, Körperpflege, Begleitung und Gesellschaft — sie ist da, wenn nachts '+
    'etwas ist. <b>Medizinische Behandlungspflege</b> (Spritzen, Wundversorgung) macht weiterhin der '+
    'ambulante Pflegedienst; das lässt sich gut kombinieren.'},
 {w:['zimmer','wohnen','unterkunft','platz','schlaf','essen'],q:'Voraussetzungen',
  a:'Die Kraft braucht ein <b>eigenes, abschließbares Zimmer</b> und Verpflegung im Haushalt. Mehr nicht — '+
    'kein Umbau, keine Sonderausstattung.'},
 {w:['heim','pflegeheim','alternative','vergleich','besser'],q:'Vergleich',
  weiter:'Soll ich Ihre Seite der Rechnung aufmachen? Acht Fragen, dann steht Ihr Monatspreis — '+
         'dann vergleichen Sie zwei echte Zahlen statt zwei Behauptungen.',
  a:'Im Heim teilt sich Ihre Mutter das Personal mit vielen anderen — und der Platz kostet trotzdem '+
    'jeden Monat einen hohen Betrag. Zuhause hat sie eine Person für sich, in ihrer Wohnung, mit ihrem '+
    'Rhythmus. Wir stellen Ihnen beide Monatsbeträge offen gegenüber.'},
 {w:['testsieger','beste','auszeichnung','welt','bewertung'],q:'Auszeichnung',
  a:'Wir sind als <b>Nr. 1 der Pflegekräfte-Vermittler</b> ausgezeichnet worden — für das Verhältnis '+
    'aus Preis und Qualität. Wichtiger als das Siegel ist mir aber, dass Sie selbst sehen, wer kommt.'},
 {w:['sprech','anruf','telefon','mit einem menschen','berater','rückruf','echte person','whatsapp'],q:null,
  mensch:true,
  a:'Sehr gern — ich bin ja nur die digitale Beraterin. <b>Marta und ihr Team</b> sind jeden Tag von 8 bis 20 Uhr '+
    'erreichbar, telefonisch unter <b>089 200 000 830</b>, per WhatsApp oder als Rückruf, wann es Ihnen passt.'}
];
function suche(text){
  const t=text.toLowerCase();let best=null,score=0;
  for(const e of WISSEN){const s=e.w.filter(w=>t.includes(w)).length;if(s>score){score=s;best=e;}}
  return best;
}
/* „weiß nicht" ist keine unverstandene Frage, sondern eine ehrliche Antwort.
   Dann schlägt Pria den häufigsten Fall vor, statt nachzuhaken. */
const UNSICHER=/wei(ß|ss) (ich )?(es )?nicht|keine ahnung|unsicher|unklar|kann ich nicht sagen|schwer zu sagen|^\?+$/i;
async function vorschlagen(s){
  chips.innerHTML='';
  const label=(s.o.find(function(x){return x[0]===s.vorschlag;})||[,''])[1];
  await sagen('Kein Problem. '+s.warum);
  setChips([
    {t:'Ja, so rechnen',stil:'stark',f:b=>waehle(s,s.vorschlag,label,b)},
    {t:'Doch etwas anderes',stil:'soft',f:()=>setChips(s.o.map(([v,l])=>({t:l,f:b=>waehle(s,v,l,b)})))}
  ]);
}

/* ─── Das Menschliche zuerst ─────────────────────────────────────────
   Begrüßung, Dank, Zustimmung, Zweifel, Erschöpfung, Wut. Wer hier
   schreibt, steht oft unter Druck — darauf gehört eine Antwort, bevor
   irgendein Wissen abgefragt wird. Reihenfolge zählt: Diese Prüfung
   läuft VOR Themen- und Wissenssuche. */
const SOZIAL=[
 {w:/^(hallo|hi|hey|moin|servus|guten (tag|morgen|abend)|gr(ü|ue)(ß|ss) gott|na)\b/i,
  a:()=>offeneFrage?'Hallo! Schön, dass Sie noch da sind.':'Hallo! Schön, dass Sie da sind. Was beschäftigt Sie gerade?'},
 {w:/(h(ä|ae)tte|habe|hab)\s+(da\s+)?(mal\s+)?(noch\s+)?(eine|ne|'ne|kurze)?\s?frage|kurze frage|darf ich (was|etwas|mal) fragen|kann ich (was|etwas) fragen|^frage:?$/i,
  a:()=>'Nur zu — fragen Sie einfach.'},
 {w:/^(danke|vielen dank|dankesch(ö|oe)n|merci|top|super|perfekt|sehr nett)/i,
  a:()=>'Sehr gern.'},
 {w:/^(ok(ay)?|alles klar|verstehe|gut|passt|jaa*|hm+|aha|mhm)\b\.?$/i,
  a:()=>offeneFrage?'':'Gut. Fragen Sie mich einfach, wenn etwas offen ist.'},
 {w:/tsch(ü|ue)ss|auf wiedersehen|bis (dann|sp(ä|ae)ter)|sch(ö|oe)nen (tag|abend)/i,
  a:()=>'Alles Gute Ihnen — und melden Sie sich jederzeit wieder. Ich bin rund um die Uhr da.'},
 {w:/wie geht('?s| es dir| es ihnen)/i,
  a:()=>'Danke der Nachfrage — mir geht es immer gut, das ist der Vorteil an mir. 🙂 Wichtiger ist, wie es bei Ihnen gerade läuft.'},
 {w:/bist du (ein )?(mensch|echt|roboter|computer|ki|bot)|wer bist du|bin ich bei einem menschen/i,
  a:()=>'Nein — ich bin Pria, die KI-Assistentin von Primundus. Ich beantworte Ihre Fragen '+
        'und rechne Ihnen aus, was eine Betreuung <b>bei Ihnen</b> kostet — mit passenden '+
        'Pflegekräften, die gerade verfügbar sind. Möchten Sie lieber mit einem Menschen '+
        'sprechen, verbinde ich Sie mit Marta und ihrem Team.'},
 // Erschöpfung und Trauer: hier wird nicht verkauft.
 // Bewusst großzügig: zwischen „schaffe" und „nicht mehr" stehen im echten
 // Satz meist noch drei Wörter („ich schaffe das alles nicht mehr").
 {w:/(schaff|pack|kann|mag|halte)[a-zäöüß]*(\s+\S+){0,3}\s+nicht mehr|(ü|ue)berfordert|am ende|verzweifelt|wei(ß|ss) (ich )?nicht (mehr )?weiter|keine kraft|(zu viel|alles zu viel)|ausgebrannt|burn ?out|hilflos|allein damit/i,
  a:()=>'Das klingt, als wäre gerade sehr viel auf einmal. Das höre ich oft — und es ist kein Zeichen von Schwäche: '+
        'Die Pflege eines Angehörigen ist eine Aufgabe für mehrere Menschen, nicht für einen.<br><br>'+
        'Wenn Sie mögen, schauen wir in Ruhe, was Ihnen konkret Luft verschafft. Und wenn Sie lieber mit '+
        'jemandem sprechen: Marta ist jeden Tag von 8 bis 20 Uhr erreichbar.', ruhig:true},
 {w:/gestorben|verstorben|beerdig|todesfall|ist tot/i,
  a:()=>'Das tut mir aufrichtig leid. Mein Beileid.<br><br>Wenn Sie gerade etwas anderes brauchen als ein Angebot, '+
        'ist das völlig in Ordnung — ich bin da, wenn es so weit ist.', ruhig:true},
 {w:/bl(ö|oe)d|dumm|unf(ä|ae)hig|scheiss|schei(ß|ss)|nervt|quatsch/i,
  a:()=>'Das darf ich mir anhören. 🙂 Sagen Sie mir einfach, was Sie brauchen — oder ich hole Ihnen '+
        'sofort einen Menschen ans Telefon.'}
];
async function sozialAntwort(s){
  chips.innerHTML='';
  const text=s.a();
  if(text) await sagen(text);
  if(s.ruhig){                                  // nicht weiterfragen, nur dasein
    return setChips([
      {t:'Mit einem Menschen sprechen',stil:'stark',f:b=>frage('Kann ich mit einem Menschen sprechen?',b)},
      {t:'Ich schaue erst mal weiter',stil:'soft',f:()=>beraterChips()}
    ]);
  }
  if(offeneFrage){
    const o=offeneFrage;
    await pause(ruhig?0:300);
    await sagen('Wir waren hier: <b>'+o.q+'</b>','Frage '+frageNummer(o)+' von '+FLOW.length);
    return setChips(o.o.map(([v,l])=>({t:l,f:b=>waehle(o,v,l,b)})));
  }
  beraterChips();
}

/* Themen-Wächter. Alles, was nach Betreuung klingt, ist eine echte Frage —
   auch wenn Pria die Antwort nicht kennt; die geht dann an einen Menschen.
   Alles andere führt sie charmant zurück, statt sich zu entschuldigen. */
const THEMA=/pfleg|betreu|kraft|kräfte|mutter|vater|oma|opa|eltern|angehörig|senior|kost|preis|euro|geld|zahl|vertrag|kündig|kasse|zimmer|haushalt|demenz|alzheimer|krank|nacht|deutsch|führerschein|wechsel|urlaub|rechnung|termin|start|anreise|abreise|grad|hilfe|zuhause|wohnung/i;
/* Nur DAS ist erkennbar abseits — nicht „alles, was ich nicht kenne". */
const ABWEGIG=/wetter|fu(ß|ss)ball|bundesliga|witz|rezept|kochen f(ü|ue)r mich|aktie|b(ö|oe)rse|bitcoin|krypto|politik|wahl|hotel|flug|urlaub buchen|auto kaufen|lotto|horoskop|gedicht|lied|film|spiel/i;
/* Kauderwelsch: kein Vokal, keine Leerzeichen, aber lang genug für Absicht. */
function kauderwelsch(t){
  const s=t.trim();
  return s.length>4 && !/\s/.test(s) && !/[aeiouäöüy]/i.test(s);
}
const CHARMANT=[
  'Da muss ich passen — mein Fachgebiet ist die Betreuung zu Hause. Bei allem anderen bin ich erstaunlich unbegabt. 🙂',
  'Ehrlich gesagt: davon verstehe ich nichts. Von häuslicher Betreuung dafür eine ganze Menge.',
  'Das führt uns beide ein bisschen weit weg. Zur Betreuung zu Hause kann ich Ihnen dafür jede Frage beantworten.',
  'Sie testen mich, oder? 🙂 Nur zu — und wenn eine echte Frage kommt, bin ich sofort da.'
];
let abwegig=0;
async function zurueckfuehren(){
  await sagen(CHARMANT[Math.min(abwegig,CHARMANT.length-1)]);
  abwegig++;
  await pause(ruhig?0:380);
  await sagen(offeneFrage
    ? 'Wollen wir da weitermachen, wo wir waren? Meine Frage war: <b>'+offeneFrage.q+'</b>'
    : 'Wenn Sie schon hier sind: Soll ich Ihnen zeigen, was eine Betreuung <b>bei Ihnen</b> kosten würde? Das dauert zwei Minuten.');
  if(offeneFrage){
    const s=offeneFrage;
    return setChips(s.o.map(([v,l])=>({t:l,f:x=>waehle(s,v,l,x)})));
  }
  setChips([{t:'Ja, Preis berechnen',stil:'stark',f:b=>starteFunnel('preis',b)},
            {t:'Ich habe eine andere Frage',stil:'soft',f:()=>{W.getElementById('frei').focus();beraterChips();}}]);
}

/* ─── Fragen: NUR was in den Preis einfließt ───────────────────────
   Abgeglichen mit calculate() in lib/calculator-context.tsx. */
const FLOW=[
 {k:'personen',kurz:'Personen',vorschlag:'1',warum:'Die allermeisten fragen für eine Person — damit rechne ich erst einmal.',q:'Wie viele Personen benötigen Pflege?',
  o:[['1','1 Pflegebedürftige/r'],['2','2 Pflegebedürftige (Ehepaar)']],
  r:{'1':'Danke, notiert.','2':'Für Ehepaare haben wir eigene Kräfte — das ist günstiger als zweimal einzeln.'}},
 {k:'haushalt',kurz:'Weitere Personen im Haushalt',vorschlag:'nein',warum:'Ich gehe erst einmal davon aus, dass niemand sonst im Haushalt lebt.',q:'Leben weitere Personen mit im Haushalt?',
  o:[['ja','Ja'],['nein','Nein']],
  // „das sagen wir jeder Kraft vorher" war albern (Martin, 21.08.) —
  // natürlich bekommt die Kraft alle Angaben. Also nur quittieren.
  r:{ja:'Notiert.',nein:'Alles klar.'}},
 {k:'pflegegrad',kurz:'Pflegegrad',vorschlag:'0',warum:'Dann rechne ich ohne Pflegegrad — kommt später einer dazu, wird es nur günstiger.',q:'Gibt es schon einen Pflegegrad?',
  o:[['0','Kein Pflegegrad'],['1','Pflegegrad 1'],['2','Pflegegrad 2'],['3','Pflegegrad 3'],
     ['4','Pflegegrad 4'],['5','Pflegegrad 5'],['?','Weiß ich nicht']],
  r:{'0':'Kein Problem — Sie können sofort starten und den Antrag parallel stellen. Er gilt rückwirkend ab Antragstellung.',
     '?':'Das klären wir gemeinsam, dafür müssen Sie jetzt nichts nachschlagen. Ich rechne erst einmal ohne.',
     '_':'Danke — dafür bekommen Sie Pflegegeld von der Kasse, das Sie für die Betreuung einsetzen '+
        'können. Wie viel das bei Ihnen ausmacht, berechne ich Ihnen gleich beim Angebot.'}},
 {k:'mobil',kurz:'Mobilität',vorschlag:'rollator',warum:'„Mit Rollator“ trifft es bei den meisten ganz gut — nehmen wir das als Ausgangspunkt.',q:'Mobilität der zu betreuenden Person',
  o:[['mobil','Mobil – geht selbstständig'],['rollator','Mit Rollator'],
     ['rollstuhl','Auf Rollstuhl angewiesen'],['bett','Bettlägerig']],
  r:{mobil:'Sehr gut — dann kommt fast jede unserer Kräfte infrage.',
     rollator:'Alles klar, das ist Alltag für unsere Kräfte.',
     rollstuhl:'Verstanden. Ich achte darauf, dass wir Kräfte mit Transfer-Erfahrung vorschlagen.',
     bett:'Danke für die Offenheit. Dafür wählen wir gezielt Kräfte mit Erfahrung in der Lagerung aus.'}},
 {k:'nacht',kurz:'Nachts Hilfe',vorschlag:'gelegentlich',warum:'„Gelegentlich“ ist der häufigste Fall — damit liegen wir meistens richtig.',q:'Ist nachts Hilfe nötig?',
  o:[['nein','Nein, nachts keine Hilfe nötig'],['gelegentlich','Gelegentlich, nicht jede Nacht'],
     ['taeglich','Jede Nacht, bis zu 1 Einsatz'],['mehrmals','Jede Nacht, mehrere Einsätze']],
  r:{nein:'Gut — das erleichtert die Suche spürbar.',
     '_':'Verstanden, das ist notiert.'}},
 {k:'fuehrerschein',kurz:'Führerschein',vorschlag:'nein',
  warum:'Die meisten kommen ohne aus — Einkäufe und Arztfahrten lassen sich fast immer anders lösen.',
  q:'Soll die Pflegekraft Auto fahren können?',
  hinweis:'Mit Führerschein ist die Auswahl kleiner und es kostet etwas mehr. '+
          'Oft reicht ein Taxi oder Fahrdienst für die paar Fahrten im Monat.',
  o:[['ja','Ja, unbedingt'],['nein','Nein / nicht unbedingt']],
  r:{ja:'Verstanden — dann suche ich gezielt Kräfte mit Führerschein.',
     nein:'Gut, damit haben Sie deutlich mehr Auswahl.'}},
 {k:'geschlecht',kurz:'Geschlecht der Pflegekraft',vorschlag:'egal',
  warum:'„Egal“ ist die häufigste Wahl und gibt Ihnen die größte Auswahl.',
  q:'Haben Sie beim Geschlecht der Pflegekraft einen Wunsch?',
  hinweis:'Bei der Körperpflege ist vielen das gleiche Geschlecht wichtig. Muss beim Aufstehen '+
          'oder Umsetzen kräftig geholfen werden, sind männliche Betreuer oft die bessere Wahl.',
  o:[['egal','Egal'],['weiblich','Weiblich'],['maennlich','Männlich']],
  r:{egal:'Gut — damit haben Sie die größte Auswahl.',
     '_':'Notiert, danach suche ich aus.'}},
 {k:'deutsch',kurz:'Deutschkenntnisse',vorschlag:'kommunikativ',warum:'„Kommunikativ“ reicht für den Alltag und ist die häufigste Wahl.',
  q:'Wie gut soll die Pflegekraft Deutsch sprechen?',
  // Was im Formular hinter dem i-Punkt steht, liefern wir gleich mit —
  // dann muss niemand erst „was bedeutet das genau?“ fragen.
  hinweis:'Grundlegend = nur wenige Wörter · Kommunikativ = einfache Verständigung · '+
          'Gut = nahezu jede Alltagssituation',
  o:[['grundlegend','Grundlegend'],['kommunikativ','Kommunikativ'],['gut','Gut']],
  r:{grundlegend:'Alles klar — damit haben Sie die größte Auswahl.',
     kommunikativ:'Gute Wahl, das reicht für den Alltag.',
     gut:'Gute Wahl bei Schwerhörigkeit oder Demenz — kostet etwas mehr, spart aber viel Ärger.'}}
];
const antwort={};

/* Wo stehen wir? Nicht mitzaehlen, sondern nachsehen: die erste Frage,
   die noch keine Antwort hat. Sonst faengt der Lauf nach jeder Rueckfrage
   wieder bei eins an, obwohl alles laengst notiert ist. */
function naechsteOffene(){ return FLOW.find(f=>antwort[f.k]===undefined) || null; }
function fortschritt(){
  const da=FLOW.filter(f=>antwort[f.k]!==undefined).length;
  prog.style.width=Math.round(da/FLOW.length*100)+'%';
  return da;
}

async function starteFunnel(grund,chip,echo,einleitung){
  tipp(); modus='fragen'; offeneFrage=null;
  protokoll('system','Fragenlauf gestartet',{ereignis:'funnel',grund});

  /* Schon alles beantwortet? Dann NICHT von vorn (Martin, 21.08.): das war
     der aergerlichste Fehler — Pria wusste, dass die Angaben stehen, und
     fragte sie trotzdem noch einmal ab. Je nachdem, wie weit der Kunde ist,
     fuehrt sie stattdessen dorthin, wo es weitergeht. */
  if(uebergeben){
    if(echo!==false) await flug(chip, echo || 'Angebot');
    await sagen('Ihr <b>Kundenportal</b> ist schon offen — dort stehen Ihr Preis und die Pflegekräfte. '+
                'Den Link haben Sie zusätzlich per E-Mail.');
    return beraterChips();
  }
  if(kontaktOffen){
    if(echo!==false) await flug(chip, echo || 'Angebot');
    await sagen('Ihre Angaben habe ich alle beisammen — es fehlen nur noch <b>Ihre Kontaktdaten</b> '+
                'im Feld oben, dann sehen Sie Preis und Pflegekräfte sofort.');
    runter();
    return;
  }
  if(!naechsteOffene()){
    if(echo!==false) await flug(chip, echo || 'Angebot');
    await sagen('Ihre <b>Angaben</b> stehen schon — dann rechne ich Ihnen das jetzt aus.');
    fortschritt();
    return matching();
  }
  // echo===false: der Kunde hat es schon selbst geschrieben („rechnet mir das
  // mal durch") — dann kein zweites Etikett in seinem Namen.
  if(echo!==false) await flug(chip, echo || (grund==='preis'?'Preis berechnen':'Pflegekräfte ansehen'));
  // Keine Spanne, kein „ab": das Angebot ist die Antwort auf die Preisfrage.
  // Und nicht um Erlaubnis fragen — einfach anfangen (Martin, 21.08.).
  // Kurz halten (Martin, 21.08.): einmal auf die Situation eingehen, dann das
  // Angebot. Was danach passiert, sieht der Kunde ohnehin — es vorher zu
  // erklären ist eine Blase zu viel.
  // Teilweise beantwortet (etwa nach einem Nachtrag): dort weitermachen,
  // nicht bei eins.
  /* Der erste Satz kommt vom Modell, wenn der Kunde etwas geschrieben hat — nur
     so geht Pria auf SEINE Worte ein, statt immer denselben Satz zu sagen
     (Martin, 22.08.: „Kunde will Angebot, und wir sagen, das hängt von seiner
     Situation ab"). Die Mechanik dahinter ist unsere und bleibt fest. */
  const schonDa=FLOW.filter(f=>antwort[f.k]!==undefined).length;
  const mechanik = schonDa
    ? '<b>' + (FLOW.length-schonDa) + ' kurze Fragen</b> fehlen noch, den Rest habe ich schon.'
    : (grund==='preis'
        ? '<b>Acht kurze Fragen</b>, dann haben Sie Ihren Preis — ich fange einfach an.'
        : '<b>Acht kurze Fragen</b>, dann zeige ich Ihnen die passenden Kräfte — ich fange einfach an.');
  const vorspann = einleitung ? einleitung.trim().replace(/<br>\s*$/,'')
    : (schonDa ? '' : (grund==='preis' ? 'Das hängt ganz von Ihrer Situation ab.'
                                       : 'Wer zu Ihnen passt, hängt von Ihrer Situation ab.'));
  await sagen((vorspann ? vorspann + ' ' : '') + mechanik);
  fortschritt();   // schon Beantwortetes soll man am Balken sehen
  naechste();
}
async function naechste(){
  const s=naechsteOffene();
  if(!s) return matching();
  // Kurz durchatmen zwischen Reaktion und nächster Frage — sonst prasselt es.
  await pause(ruhig?0:520);
  await sagen(s.q,'Frage '+(FLOW.indexOf(s)+1)+' von '+FLOW.length+(s.hinweis?'<br>'+s.hinweis:''));
  offeneFrage=s;
  setChips(s.o.map(([v,l])=>({t:l,f:b=>waehle(s,v,l,b)})));
}
/* Anschluss an die offene Frage — angekündigt, nicht heimlich übersprungen. */
async function weiterFrage(){
  chips.innerHTML='';
  if(!offeneFrage) return beraterChips();
  await sagen('Dann machen wir da weiter, wo wir waren: <b>'+offeneFrage.q+'</b>');
  const s=offeneFrage;
  setChips(s.o.map(([v,l])=>({t:l,f:b=>waehle(s,v,l,b)})));
}
async function waehle(s,v,l,chip,ausText){
  tipp(); offeneFrage=null;
  // Kam der Wert aus einem freien Satz, steht die Nachricht des Kunden schon
  // im Verlauf. Sie dann noch einmal als Etikett zu wiederholen liest sich,
  // als lege Pria ihm Worte in den Mund. Was notiert wurde, steht stattdessen
  // klein unter ihrer Reaktion — sichtbar, aber nicht als seine Aussage.
  if(!ausText) await flug(chip,l);
  antwort[s.k]=v;
  const t=(s.r||{})[v]||(s.r||{})['_'];
  if(t) await sagen(t, ausText?'Notiert: '+l:'');
  else if(ausText) await sagen('Notiert: <b>'+l+'</b>');
  fortschritt();
  naechste();
}
async function matching(){
  W.getElementById('status').textContent='sucht passende Kräfte …';
  const r=document.createElement('div');r.className='row';
  r.innerHTML='<div class="mini">'+avatar(PRIA.denk)+'</div><div class="card">'+
    '<div class="anim" id="a0"><span class="ring"></span>Ihr Angebot wird berechnet</div>'+
    '<div class="anim" id="a1"><span class="ring"></span><span id="zahl">142</span> Pflegekräfte werden geprüft</div>'+
    '<div class="anim" id="a2"><span class="ring"></span>Fertig</div></div>';
  thread.appendChild(r);runter();
  const setz=(i,c)=>W.getElementById('a'+i).className='anim '+c;
  const ok=i=>{setz(i,'ok');W.querySelector('#a'+i+' .ring').textContent='✓';};
  setz(0,'on');await pause(1400);ok(0);setz(1,'on');
  let n=142;const iv=setInterval(()=>{n-=Math.ceil((n-5)/12);if(n<=5){n=5;clearInterval(iv);}W.getElementById('zahl').textContent=n;},110);
  await pause(2500);clearInterval(iv);W.getElementById('zahl').textContent='5';ok(1);setz(2,'on');
  await pause(800);ok(2);tipp([10,40,10]);
  W.getElementById('status').textContent=untertitel;
  prog.style.width='100%';
  await sagen('Fertig. Ihr Preis ist berechnet — und ich habe <b>5 verfügbare Pflegekräfte</b> gefunden, '+
              'die zu Ihrer Situation passen.');
  await pause(ruhig?0:420);
  // Begründung für die Kontaktdaten: die Profile sind echte Menschen. Das ist der
  // ehrliche Datenschutz-Grund — und der überzeugendere.
  await sagen('Die Profile echter Pflegekräfte dürfen wir nicht offen im Netz zeigen. Ich richte Ihnen '+
              'deshalb einen <b>geschützten Zugang</b> ein — dafür brauche ich nur Ihre Kontaktdaten.',
              'Sie sehen Preis und Pflegekräfte sofort, eine Kopie schicke ich zusätzlich per E-Mail. 100 % kostenfrei und unverbindlich.');
  kontakt();
}
/* Übergabe ins Kundenportal — sichtbarer Countdown statt Seitensprung,
   wie auf der Ergebnisseite des Formulars (app/result/page.tsx). Im
   Prototyp gibt es keinen echten Lead, deshalb endet der Knopf hier. */
async function uebergabe(){
  const r=document.createElement('div');r.className='row';
  r.innerHTML='<div class="mini">'+avatar(PRIA.denk)+'</div><div class="card">'+
    '<div class="anim on" id="u0"><span class="ring"></span>Ihr geschützter Zugang wird erstellt</div>'+
    '<div class="anim" id="u1"><span class="ring"></span>Kundenportal öffnet sich in <b id="uz">3</b> …</div>'+
    '</div>';
  thread.appendChild(r);runter();
  await pause(ruhig?0:700);
  W.getElementById('u0').className='anim ok';
  W.querySelector('#u0 .ring').textContent='✓';
  W.getElementById('u1').className='anim on';
  // Zügiger als beim ersten Wurf (Martin, 21.08.): wer bis hierher gekommen
  // ist, will ins Portal und nicht zusehen, wie gezählt wird.
  for(let n=3;n>0;n--){ W.getElementById('uz').textContent=n; await pause(ruhig?0:480); }
  W.getElementById('u1').className='anim ok';
  W.querySelector('#u1 .ring').textContent='✓';
  W.getElementById('u1').innerHTML='<span class="ring">✓</span>Kundenportal geöffnet';
  protokoll('system','Übergabe ins Kundenportal',{ereignis:'portal_handoff'});
  spuelen();
}

/* ─── Diagnose ────────────────────────────────────────────────────
   Sichtbar nur mit ?priadebug=1 in der Adresse.

   Warum das hier steht: das Verhalten der Tastatur auf dem iPhone laesst
   sich am Schreibtisch nicht nachstellen, und aus Screenshots allein habe
   ich mehrfach falsch geschlossen. Diese Zahlen sagen in einem Bild, was
   Sache ist — welches Fenster wie gross ist, wo das Panel steht, ob die
   Seite wirklich festgehalten wird und ob Safari `resizes-content` kennt.

   Bewusst ausserhalb des Shadow-Roots (document.body): so misst die
   Anzeige unabhaengig vom Chat und wandert mit, falls der Chat wandert.
   `document.head.querySelector` statt `document.querySelector` — letzteres
   lenkt der Widget-Bauer in den Shadow-Root um. */
if(/[?&]priadebug=1/.test(location.search)){
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;'+
    'background:rgba(0,0,0,.84);color:#5f5;font:11px/1.35 ui-monospace,Menlo,monospace;'+
    'padding:5px 7px;white-space:pre;pointer-events:none;max-width:100vw';
  document.body.appendChild(box);
  const meta = document.head.querySelector('meta[name=viewport]');
  const modern = !!meta && meta.content.indexOf('resizes-content') >= 0;
  const zeig = () => {
    const r = panel.getBoundingClientRect();
    const b = getComputedStyle(document.body);
    box.textContent =
      'iH '+innerHeight+'  vv '+(vv?Math.round(vv.height):'—')+
        '  off '+(vv?Math.round(vv.offsetTop):'—')+'  sY '+Math.round(scrollY)+'\n'+
      'panel  top '+Math.round(r.top)+'  h '+Math.round(r.height)+
        '   inline top:'+(panel.style.top||'—')+' h:'+(panel.style.height||'—')+'\n'+
      'body '+b.position+' top:'+b.top+'   takt '+(taktLaeuft?'an':'aus')+
        '   vp '+(modern?'resizes-content':'STANDARD');
    requestAnimationFrame(zeig);
  };
  requestAnimationFrame(zeig);
}

/* ─── Rückruf ─────────────────────────────────────────────────────
   Bis 22.08. war „Rückruf vereinbaren" ein Knopf mit leerem Handler:
   der Kunde klickte, Pria bestätigte freundlich, und niemand rief an.
   Jetzt geht die Bitte an /api/pria/rueckruf — Mail ans Team plus
   Ereignis im Protokoll — und Pria sagt erst dann zu, wenn das geklappt
   hat. Scheitert es, hört der Kunde die Nummer statt eines Versprechens. */
let rueckrufOffen=false;
function rueckruf(){
  if(rueckrufOffen) return;
  rueckrufOffen=true;
  chips.innerHTML='';
  // Vorbelegen, was schon dasteht: wer die Kontaktdaten oben ausgefüllt
  // hat, soll sie nicht zweimal tippen.
  const oben=id=>{const f=W.getElementById(id);return f?f.value.trim():'';};
  /* Die E-Mail ist freiwillig — für einen Anruf braucht sie niemand. Sie
     entscheidet aber darüber, ob aus der Bitte ein Lead werden kann: die
     Lead-Tabelle führt die Adresse als Identität, und erfinden kommt nicht
     in Frage. Steht oben schon eine, wird nicht noch einmal gefragt. */
  const habenMail=oben('kmail');
  const r=document.createElement('div');r.className='row';
  r.innerHTML='<div class="mini">'+avatar(null,true)+'</div><div class="card">'+
   '<p class="klein" style="margin:0 0 10px">Wie erreicht Marta Sie am besten?</p>'+
   '<input class="feld" id="rname" placeholder="Ihr Name" autocomplete="name">'+
   '<input class="feld" id="rtel" type="tel" inputmode="tel" placeholder="Ihre Telefonnummer" autocomplete="tel">'+
   (habenMail?'':'<input class="feld" id="rmail" type="email" inputmode="email" '+
     'placeholder="E-Mail (freiwillig)" autocomplete="email">')+
   '<button class="go" id="rgo" disabled>Rückruf anfordern</button>'+
   '<p class="klein">'+
   (habenMail?'':'Für den Anruf genügen Name und Nummer. Die E-Mail nur, wenn Sie Ihre '+
     'Unterlagen zusätzlich schriftlich möchten.<br>')+
   'Erreichbar täglich von 8 bis 20 Uhr · kostenlos und unverbindlich</p></div>';
  thread.appendChild(r);runter();
  const rn=W.getElementById('rname'), rt=W.getElementById('rtel');
  rn.value=oben('kname'); rt.value=oben('ktel');

  const go=W.getElementById('rgo');
  // Derselbe milde Maßstab wie beim Kontaktformular — und derselbe Grundsatz:
  // kein Knopf, der sich drücken lässt und nichts tut.
  const gueltig=()=>rn.value.trim().length>1 && rt.value.replace(/\D/g,'').length>=7;
  const pruefen=()=>{go.disabled=!gueltig();};
  [rn,rt].forEach(f=>f.addEventListener('input',pruefen));
  pruefen();

  go.onclick=async()=>{
    go.disabled=true; go.textContent='Wird weitergegeben …';
    const name=rn.value.trim(), tel=rt.value.trim();
    const rmail=W.getElementById('rmail');
    const mail=habenMail || (rmail?rmail.value.trim():'');
    // Womit der Anruf anfangen kann: die letzte Frage des Kunden.
    const letzte=[...verlauf].reverse().find(z=>z.rolle==='kunde');
    let ok=false;
    try{
      const res=await fetch('/api/pria/rueckruf',{method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({sid:SID,name,telefon:tel,email:mail,
          anlass:letzte?letzte.text:'',antworten:Object.assign({},antwort)})});
      ok=res.ok;
    }catch(e){ ok=false; }

    if(!ok){
      // Ehrlich bleiben: lieber die Nummer nennen, als einen Anruf zusagen,
      // der nirgends angekommen ist.
      go.textContent='Rückruf anfordern'; go.disabled=false; rueckrufOffen=false;
      await sagen('Das hat gerade nicht geklappt — und ich sage Ihnen lieber Bescheid, '+
                  'als einen Anruf zu versprechen, der nicht ankommt.',
                  'Am schnellsten erreichen Sie uns direkt: <b>089 200 000 830</b>, '+
                  'täglich von 8 bis 20 Uhr.');
      return beraterChips();
    }

    go.textContent='✓ Rückruf ist notiert';
    // Sperre wieder loesen: wer spaeter eine zweite Nummer nachreichen will,
    // soll den Knopf nicht tot vorfinden.
    rueckrufOffen=false;
    protokoll('system','Rückruf erbeten — '+name+', '+tel,{ereignis:'rueckruf'});
    spuelen();
    await sagen('Ist notiert — <b>Marta ruft Sie an</b> unter '+tel+'. '+
                'Sie meldet sich innerhalb der Sprechzeiten, täglich von 8 bis 20 Uhr.');

    // Warten muss er deshalb nicht. Was Pria selbst kann, bietet sie
    // jetzt an — statt wieder den ganzen Themenkorb auszukippen.
    await pause(ruhig?0:460);
    if(uebergeben){
      await sagen('Ihre Unterlagen hat Marta dann schon vorliegen. Bis dahin: '+
                  'gibt es etwas, das Sie vorab von mir wissen möchten?');
      return setChips([
        {t:'Ja, ich habe noch eine Frage',stil:'stark',f:()=>{
          chips.innerHTML=''; W.getElementById('frei').focus();}},
        {t:'Nein, ich warte auf den Anruf',stil:'soft',f:async()=>{
          chips.innerHTML='';
          await sagen('Alles klar. Bis gleich am Telefon.');}}
      ]);
    }
    const fertig=FLOW.every(f=>antwort[f.k]);
    await sagen(fertig
      ? 'Möchten Sie bis dahin schon Ihren <b>Preis und die passenden Pflegekräfte</b> sehen? '+
        'Ihre Angaben habe ich alle — es fehlen nur noch Ihre Kontaktdaten.'
      : 'Möchten Sie bis dahin schon Ihren <b>Preis</b> sehen? Acht kurze Fragen, '+
        'dann haben Sie ihn samt passenden Pflegekräften — noch vor dem Anruf.');
    setChips([
      {t:fertig?'Ja, Angebot ansehen':'Ja, Preis berechnen',stil:'stark',f:b=>starteFunnel('preis',b)},
      {t:'Ich habe vorher noch eine Frage',stil:'soft',f:()=>{
        chips.innerHTML=''; W.getElementById('frei').focus();}},
      {t:'Nein, ich warte auf den Anruf',stil:'soft',f:async()=>{
        chips.innerHTML='';
        await sagen('Alles klar. Bis gleich am Telefon.');}}
    ]);
  };

  /* Zwei Auswege, nicht einer (Martin, 22.08.): Wer die Karte offen hat
     und es sich anders ueberlegt, wollte bisher nur „weiterschreiben"
     koennen — der Weg zum Angebot fehlte ganz. */
  const weg=()=>{ rueckrufOffen=false; r.remove(); };
  setChips([
    {t:'Doch lieber Preis berechnen',stil:'stark',f:b=>{weg();return starteFunnel('preis',b);}},
    {t:'Doch lieber weiterschreiben',stil:'soft',f:()=>{
      weg(); return offeneFrage?weiterFrage():beraterChips();}}
  ]);
}

function kontakt(){
  const r=document.createElement('div');r.className='row';
  r.innerHTML='<div class="mini">'+avatar(null,true)+'</div><div class="card">'+
   '<div class="faces">'+PKS.map(p=>'<span><img src="'+p+'" alt=""></span>').join('')+'</div>'+
   // type: damit auf dem Handy gleich die passende Tastatur aufgeht.
   '<input class="feld" id="kname" placeholder="Ihr Name" autocomplete="name">'+
   '<input class="feld" id="kmail" type="email" inputmode="email" placeholder="E-Mail" autocomplete="email">'+
   '<input class="feld" id="ktel" type="tel" inputmode="tel" placeholder="Telefon" autocomplete="tel">'+
   '<button class="go" id="abs" disabled>Angebot &amp; Pflegekräfte ansehen</button>'+
   '<p class="klein">Kostenlos · unverbindlich · kein Vertrag vor Ihrer Auswahl</p></div>';
  thread.appendChild(r);runter();
  kontaktOffen=true;

  /* Der Knopf bleibt gesperrt, bis alle drei Felder etwas hergeben. Vorher
     liess er sich drücken und tat nichts — das ist genau der tote Knopf,
     den es nicht geben darf. Absichtlich milde geprüft: wir wollen niemanden
     wegen eines Formats aussperren, nur offensichtlich Leeres abfangen. */
  // Zweiter Weg, gleich angeboten: viele tippen lieber, als in ein Formular
  // zu greifen — besonders auf dem Handy.
  setChips([
    {t:'Lieber hier im Chat eingeben',stil:'soft',f:async()=>{
      chips.innerHTML='';
      await sagen('Gern — <b>Name, E-Mail und Telefon</b> in einer Zeile genügt. Ich trage es oben ein.');
      W.getElementById('frei').focus();
    }}
  ]);

  const felder=['kname','kmail','ktel'].map(id=>W.getElementById(id));
  const go=W.getElementById('abs');
  const gueltig=()=>{
    const [name,mail,tel]=felder.map(f=>f.value.trim());
    return name.length>1
      && /^[^\s@]+@[^\s@]+\.[a-zA-ZäöüÄÖÜ]{2,}$/.test(mail)
      && tel.replace(/\D/g,'').length>=7;
  };
  const pruefen=()=>{ go.disabled=!gueltig(); };
  felder.forEach(f=>f.addEventListener('input',pruefen));
  pruefen();

  go.onclick=async()=>{
    tipp(12);
    go.disabled=true;
    kontaktOffen=false; uebergeben=true;
    // DIE Marke im Verlauf: alles davor ist „vor Lead", alles danach „nach Lead".
    protokoll('system','Kontaktdaten abgeschickt',{ereignis:'lead',antworten:Object.assign({},antwort)});
    spuelen();
    // Kein Echo in seinem Namen: er hat die Felder ausgefüllt, das sieht er.
    // Eine Blase "Meine Daten stehen drin" legt ihm Worte in den Mund.
    await sagen('Danke. Ich lege Ihren Zugang an und öffne Ihnen gleich Ihr <b>Kundenportal</b> — '+
                'dort stehen Ihr Preis und die fünf Pflegekräfte.',
                'Den Link schicke ich Ihnen zusätzlich per E-Mail, er ist 14 Tage gültig.');

    /* Derselbe Weg wie beim Formular: /api/pria/lead rechnet den Preis und
       reicht an /api/angebot-anfordern weiter — Lead, Eingangsbestätigung und
       Magiclink entstehen dort. Zurück kommen portalUrl, leadId und
       bruttopreis (für den Conversion-Push unten). */
    /* Google-Klick-IDs mitgeben: die Seiten-Analytics merkt gclid/wbraid/
       gbraid in sessionStorage (_prim_ad_params), der Server allowlistet
       (angebot-anfordern) — ohne sie kann der Offline-Conversion-Import
       (docs/google-ads-tracking.md) Chat-Leads keinem Klick zuordnen.
       Zusätzlich die URL selbst lesen: auf der Testseite pria.html läuft
       keine Seiten-Analytics. */
    let adParams={};
    try{ adParams=JSON.parse(sessionStorage.getItem('_prim_ad_params')||'{}')||{}; }catch(e){}
    try{
      const q=new URLSearchParams(location.search);
      for(const k of ['gclid','wbraid','gbraid','utm_term','utm_content']){
        const v=q.get(k); if(v&&!adParams[k]) adParams[k]=v;
      }
    }catch(e){}

    let portalUrl=null, leadId=null, brutto=null, gescheitert=false;
    try{
      const res=await fetch('/api/pria/lead',{method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({sid:SID,name:felder[0].value.trim(),email:felder[1].value.trim(),
          telefon:felder[2].value.trim(),antworten:Object.assign({},antwort),adParams:adParams})});
      const d=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(d.fehler||('HTTP '+res.status));
      portalUrl=d.portalUrl||null; leadId=d.leadId||null;
      brutto=(typeof d.bruttopreis==='number')?d.bruttopreis:null;
    }catch(e){
      gescheitert=true;
      console.warn('[Pria] Lead nicht angelegt:',e.message);
    }

    if(gescheitert){
      /* Nicht so tun, als sei alles gut: der Kunde hat seine Daten gegeben und
         muss wissen, dass sie angekommen sind — oder eben nicht. */
      await sagen('Da ist beim Anlegen etwas schiefgegangen — Ihre Angaben sind bei uns, aber der '+
                  'Zugang steht noch nicht. Marta meldet sich bei Ihnen. Wenn es eilt: <b>089 200 000 830</b>.');
      return setChips([{t:'Nochmal versuchen',stil:'stark',f:()=>{go.disabled=false;kontaktOffen=true;uebergeben=false;runter();}}]);
    }

    /* Conversion melden — Schnittstellen-Vertrag mit SEA (26.08.): derselbe
       dataLayer-Push wie im MultiStepForm (angebot_erfolgreich mit lead_id,
       conversion_value = bruttopreis, user_email für Enhanced Conversions —
       die GTM-Variable „Nutzerdaten" hasht die E-Mail, Klartext verlässt
       den Browser nicht). Das dortige eventCallback-Warten vor dem Redirect
       braucht es hier nicht: bis goToPortal() unten navigiert, liegen
       Übergabe-Animation und Marta-Karte dazwischen (≥3 s) — mehr Zeit, als
       die Tags im Formular je bekommen. care_start_timing entfällt: Pria
       fragt es nicht. Der Wächter verhindert Doppel-Navigation
       (Chip + Timer). */
    let redirected=false;
    const goToPortal=()=>{ if(redirected||!portalUrl) return; redirected=true; location.assign(portalUrl); };
    if(leadId){
      window.dataLayer=window.dataLayer||[];
      window.dataLayer.push({
        event:'angebot_erfolgreich',
        lead_id:leadId,
        pflegegrad:/^[1-5]$/.test(String(antwort.pflegegrad))?parseInt(antwort.pflegegrad,10):0,
        conversion_value:brutto,
        user_email:felder[1].value.trim(),
      });
    }

    await uebergabe();
    const m=document.createElement('div');m.className='row';
    m.innerHTML='<div class="mini">'+avatar(null,true)+'</div><div class="card" style="padding:0;border:0;box-shadow:none;background:transparent">'+
      '<div class="mensch"><img src="'+MARTA+'" alt=""><p><b>Ab hier übernimmt ein Mensch.</b> Marta Kapcio sieht sich Ihre '+
      'Angaben persönlich an und meldet sich bei Ihnen — täglich zwischen 8 und 20 Uhr. Wenn es eilt: <b>089 200 000 830</b>.</p></div></div>';
    thread.appendChild(m);runter();

    if(portalUrl){
      setChips([{t:'→ Ihr Kundenportal öffnen',stil:'stark',f:goToPortal}]);
      // Wie auf der Ergebnisseite des Formulars: nach dem Countdown von selbst.
      setTimeout(()=>{ if(!ruhig) goToPortal(); }, 1600);
    }else{
      // Kein Link zur Hand: dann keinen Chip zeigen, der nichts tut, sondern
      // den Weg, der hier wirklich weiterhilft.
      await sagen('Den Zugangslink schicke ich Ihnen per E-Mail — er ist gleich bei Ihnen.');
      setChips([{t:'Lieber anrufen lassen',stil:'soft',f:()=>rueckruf()}]);
    }
  };
}

/* ─── Nachträge: „Moment, ich wohne ja mit im Haus" ──────────────────
   Menschen antworten nicht in Formularreihenfolge. Fällt jemandem drei
   Fragen später etwas zu einer früheren ein, muss das ankommen — sonst
   rechnen wir mit falschen Angaben weiter. Erkannt wird das Thema, der
   Wert wird aus dem Satz abgeleitet, und danach geht es dort weiter,
   wo wir gerade waren. */
const THEMEN=[
 {k:'haushalt',
  w:/wohn|lebt? (mit|bei)|mit im haus|im selben haus|haushalt|tochter|sohn|enkel|ehemann|ehefrau|(ehe)?partner|schwester|bruder|allein/i,
  stufen:[['nein',/allein|niemand|keiner|sonst keine/i],['ja',/./]]},
 {k:'personen',
  w:/ehepaar|zu zweit|beide eltern|vater und mutter|zwei (personen|pflege)/i,
  stufen:[['2',/./]]},
 // Mobilität und Nacht: mehrere Treffer sind der Normalfall („drinnen …, draußen …").
 // Dann schlägt Pria die anspruchsvollere Stufe vor — damit die Pflegekraft
 // vorbereitet ist und nicht vor Ort überrascht wird.
 {k:'mobil',
  w:/rollator|rollstuhl|bettl(ä|ae)gerig|liegt nur|geht (noch )?selbst|l(ä|ae)uft (noch )?(allein|selbst)|mobil/i,
  stufen:[['mobil',/geht (noch )?selbst|l(ä|ae)uft (noch )?(allein|selbst)|(voll )?mobil/i],
          ['rollator',/rollator|gehhilfe|rollwagen/i],
          ['rollstuhl',/rollstuhl|rolli\b/i],
          ['bett',/bettl(ä|ae)gerig|liegt nur|steht nicht mehr auf/i]],
  grund:'Ich trage die anspruchsvollere Stufe ein — so ist die Pflegekraft darauf vorbereitet und wird vor Ort nicht überrascht.'},
 {k:'nacht',
  w:/nachts?|in der nacht/i,
  stufen:[['nein',/kein|nicht|nie|schl(ä|ae)ft durch|durch/i],
          ['gelegentlich',/gelegentlich|manchmal|ab und zu|selten/i],
          ['taeglich',/jede nacht|t(ä|ae)glich|einmal/i],
          ['mehrmals',/mehrmals|mehrere|(ö|oe)fter|st(ü|ue)ndlich/i]],
  grund:'Ich trage die höhere Belastung ein — das sagen wir jeder Kraft vorher, dann gibt es hinterher keine Diskussion.'},
 {k:'deutsch',
  w:/deutsch|sprach|spricht|verst(ä|ae)ndig/i,
  stufen:[['grundlegend',/wenig|kaum|grundlegend|paar w(ö|oe)rter/i],
          ['kommunikativ',/kommunikativ|einfach|alltag/i],
          ['gut',/sehr gut|\bgut\b|flie(ß|ss)end/i]],
  grund:'Bei Sprache gehe ich lieber eine Stufe höher — das kostet etwas mehr, erspart aber Missverständnisse im Alltag.'},
 {k:'fuehrerschein',
  w:/f(ü|ue)hrerschein|auto fahren|fahren k(ö|oe)nnen|pkw|fahrdienst|taxi/i,
  stufen:[['nein',/kein|nicht|nein|brauch(en|t) (wir )?nicht|taxi|fahrdienst/i],['ja',/./]]},
 {k:'geschlecht',
  w:/(m(ä|ae)nnlich|weiblich|frau als|mann als|lieber eine frau|lieber einen mann|geschlecht)/i,
  stufen:[['egal',/egal|beides|spielt keine rolle/i],['weiblich',/weiblich|frau/i],['maennlich',/m(ä|ae)nnlich|mann/i]]},
 {k:'pflegegrad',
  w:/pflegegrad|grad\s*[0-5]/i,
  stufen:[['0',/kein/i],['1',/1|eins/],['2',/2|zwei/],['3',/3|drei/],['4',/4|vier/],['5',/5|f(ü|ue)nf/]]}
];
/** Alle passenden Stufen, von der leichtesten zur anspruchsvollsten. */
function stufenTreffer(th,text){
  const t=[];
  for(const [v,re] of th.stufen) if(re.test(text)) t.push(v);
  return t;
}
function themaZu(text){
  for(const th of THEMEN) if(th.w.test(text)) return th;
  return null;
}
/* Mehrere Stufen im selben Satz („drin Rollator, draußen Rollstuhl") —
   dann nicht raten: die anspruchsvollere vorschlagen, begründen, bestätigen lassen. */
async function mehrdeutig(s,treffer,weiterMit){
  chips.innerHTML='';
  const v=treffer[treffer.length-1];
  const label=(s.o.find(x=>x[0]===v)||[,v])[1];
  const genannt=treffer.map(x=>(s.o.find(y=>y[0]===x)||[,x])[1]);
  const th=THEMEN.find(t=>t.k===s.k);
  await sagen('Sie nennen zwei Situationen: <b>'+genannt.join('</b> und <b>')+'</b>. '+
              (th&&th.grund?th.grund:'Ich nehme die anspruchsvollere Angabe.'));
  await pause(ruhig?0:320);
  await sagen('Soll ich <b>'+label+'</b> eintragen?');
  setChips([
    {t:'Ja, '+label,stil:'stark',f:b=>weiterMit(v,label,b)},
    ...treffer.slice(0,-1).map(x=>{
      const l=(s.o.find(y=>y[0]===x)||[,x])[1];
      return {t:'Nein, '+l,stil:'soft',f:b=>weiterMit(x,l,b)};
    })
  ]);
}

async function nachtragen(th,text){
  chips.innerHTML='';
  const s=FLOW.find(f=>f.k===th.k); if(!s) return;
  const treffer=stufenTreffer(th,text);
  if(treffer.length>1) return mehrdeutig(s,treffer,(v,label)=>uebernehmen(s,v,label));
  const v=treffer[0]||s.vorschlag;
  const label=(s.o.find(x=>x[0]===v)||[,v])[1];
  return uebernehmen(s,v,label);
}
/** Wert für eine Frage setzen, bestätigen und dort weitermachen, wo wir waren. */
async function uebernehmen(s,v,label){
  chips.innerHTML='';
  const schonDa=antwort[s.k]!==undefined;
  antwort[s.k]=v;
  await sagen((schonDa?'Danke, gut dass Sie das sagen — ich ändere das: ':'Das notiere ich gleich mit: ')+
              '<b>'+(s.kurz||s.q)+': '+label+'</b>');
  if(offeneFrage && offeneFrage.k===s.k){ fortschritt(); offeneFrage=null; return naechste(); }
  if(offeneFrage){
    await pause(ruhig?0:380);
    await sagen('Und weiter bei <b>'+offeneFrage.q+'</b>','Frage '+frageNummer(offeneFrage)+' von '+FLOW.length);
    const o=offeneFrage;
    return setChips(o.o.map(([w,l])=>({t:l,f:b=>waehle(o,w,l,b)})));
  }
  beraterChips();
}

/* ─── Freitext: erst verstehen, dann antworten ──────────────────────
   Bis hierher lief alles über Stichwörter. Das ist an echter Sprache
   dreimal gescheitert („wie finde ich eine pflegekraft?", „ich schaffe
   das alles nicht mehr", jeder Tippfehler). Jetzt liest ein Sprachmodell
   die Nachricht — aber es entscheidet nichts: Reihenfolge der Fragen,
   gespeicherte Werte, Preis und Übergabe bleiben hier im Code.
   Fällt der Dienst aus, greift die alte Stichwortsuche. */
const PRIA_API='/api/pria';
/* Früher schaltete EIN fehlgeschlagener Aufruf den Sprachdienst für den Rest
   des Besuchs ab — danach antwortete wieder die Stichwortsuche mit „Das kann
   ich Ihnen nicht aus dem Stand beantworten", obwohl Pria die Antwort kennt.
   Jetzt: nach zwei Fehlern kurz Ruhe, danach wird es wieder versucht. */
let llmPauseBis=0, llmFehler=0;
/* Ist der Dienst gar nicht erreichbar (z. B. in der veröffentlichten Vorschau,
   die keinen Server hat), darf das nicht stillschweigend passieren: sonst wirkt
   Pria dumm, obwohl nur das Modell fehlt. Das steht dann im Kopf. */
let untertitel='KI-gestützte Assistentin', ohneModell=false;
const verlauf=[];

function zustand(){
  return {modus, offeneFrage:offeneFrage?offeneFrage.k:null,
    schritt:FLOW.filter(f=>antwort[f.k]!==undefined).length,
    kontaktdatenOffen:kontaktOffen, schonUebergeben:uebergeben,
    antworten:Object.assign({},antwort)};
}
async function priaFragen(text){
  // 45 statt 20 s: Opus 5 mit dem grossen Systemprompt braucht ueber Mobilfunk
  // regelmaessig mehr als 20 — und jeder Abbruch wirft den Chat zurueck auf die
  // Stichwortsuche, was der Kunde als schlechtere Antwort sieht (21.08.).
  const ctl=new AbortController(), zeit=setTimeout(()=>ctl.abort(),45000);
  try{
    const res=await fetch(PRIA_API,{method:'POST',signal:ctl.signal,
      headers:{'content-type':'application/json'},
      body:JSON.stringify({sid:SID,text,zustand:zustand(),verlauf:verlauf.slice(-12)})});
    if(!res.ok){const b=await res.json().catch(()=>({}));throw new Error(b.fehler||('HTTP '+res.status));}
    return await res.json();
  } finally { clearTimeout(zeit); }
}
/* Die Sprechblase direkt setzen: gewartet wurde schon während der Anfrage,
   ein zweites Tipp-Signal wäre gelogen. */
function sagenJetzt(html,extra){ bub(html+(extra?'<small>'+extra+'</small>':'')); }

/* Chips, die das Modell vorschlägt: zwei Texte sind reserviert und starten
   den Fragenlauf, alles andere geht als neue Nachricht des Kunden zurück. */
function modellChips(liste){
  return liste.map(t=>{
    if(/^preis berechnen$/i.test(t))        return {t,stil:'stark',f:b=>starteFunnel('preis',b)};
    if(/^pflegekräfte ansehen$/i.test(t))   return {t,stil:'stark',f:b=>starteFunnel('kraefte',b)};
    return {t,stil:'soft',f:b=>frage(t,b)};
  });
}

async function verarbeite(r,kundentext){
  /* Sicherheitsnetz gegen den Fehler vom 22.08.: Das Modell hat die Antwort
     nur BESTAETIGT statt sie als Antwort zu liefern — gespeichert wurde
     nichts, und der Chat stellte dieselbe Frage sofort noch einmal.
     Steht eine Frage offen und findet die Stichwortpruefung im Satz des
     Kunden genau einen gueltigen Wert dafuer, gilt der. Lieber der
     schlichte Treffer als eine Schleife. */
  if(offeneFrage && kundentext && ['wissen','sozial','unklar','abwegig'].includes(r.typ)){
    const th=THEMEN.find(t=>t.k===offeneFrage.k);
    const treffer=th?stufenTreffer(th,kundentext):[];
    if(treffer.length===1){
      const s=offeneFrage, v=treffer[0];
      const label=(s.o.find(x=>x[0]===v)||[,v])[1];
      chips.innerHTML='';
      if(r.text) sagenJetzt(r.text);
      return waehle(s,v,label,null,true);
    }
  }

  if(r.text) verlauf.push({rolle:'pria',text:r.text});

  // Antwort auf die offene Frage oder Nachtrag zu einer anderen —
  // in beiden Fällen setzt der Code den Wert, nicht das Modell.
  if((r.typ==='antwort'||r.typ==='nachtrag') && r.feld){
    const s=FLOW.find(f=>f.k===r.feld);
    if(s && r.werte.length){
      const offen = offeneFrage && offeneFrage.k===s.k;
      // Menschen antworten und fragen im selben Satz. Die mitgestellte Frage
      // wird zuerst beantwortet — sonst verschluckt Pria sie und wirkt taub.
      if(r.text){ chips.innerHTML='';
        sagenJetzt(r.text);
        await pause(ruhig?0:420); }
      if(r.werte.length>1)
        return mehrdeutig(s,r.werte, offen ? (v,l,b)=>waehle(s,v,l,b||null)
                                           : (v,l)=>uebernehmen(s,v,l));
      const v=r.werte[0], label=(s.o.find(x=>x[0]===v)||[,v])[1];
      return offen ? waehle(s,v,label,null,true) : uebernehmen(s,v,label);
    }
  }
  // „Weiß ich nicht" ist eine ehrliche Antwort, kein Missverständnis: Pria
  // schlägt den häufigsten Fall vor, begründet ihn und lässt bestätigen —
  // statt ihn stillschweigend einzutragen.
  if(r.typ==='vorschlag' && r.feld && offeneFrage && offeneFrage.k===r.feld){
    chips.innerHTML='';
    return vorschlagen(offeneFrage);
  }
  // Kein Modelltext davor: der kuratierte Einstieg sagt dasselbe, nur besser.
  /* Kontaktdaten aus dem Chat: der Kunde tippt sie, statt oben ins Feld zu
     greifen. Wir tragen ein, was erkannt wurde, und lassen bestaetigen —
     automatisch abschicken waere bei personenbezogenen Daten uebergriffig. */
  if(r.typ==='kontakt' && kontaktOffen){
    chips.innerHTML='';
    const felder={kname:r.kontaktName, kmail:r.kontaktMail, ktel:r.kontaktTelefon};
    let gesetzt=0;
    for(const [id,wert] of Object.entries(felder)){
      const f=W.getElementById(id);
      if(f && wert){ f.value=wert; f.dispatchEvent(new Event('input')); gesetzt++; }
    }
    const knopf=W.getElementById('abs');
    if(!gesetzt){
      await sagen(r.text||'Das habe ich nicht herauslesen können — schreiben Sie mir bitte '+
                  '<b>Name, E-Mail und Telefon</b>, dann trage ich es ein.');
      return beraterChips();
    }
    zumKontakt();
    if(knopf && !knopf.disabled){
      await sagen('Ich habe es oben eingetragen:<br><b>'+
        [r.kontaktName,r.kontaktMail,r.kontaktTelefon].filter(Boolean).join('</b> · <b>')+'</b>');
      return setChips([
        {t:'Passt — Angebot ansehen',stil:'stark',f:()=>{chips.innerHTML='';knopf.click();}},
        {t:'Ich ändere es oben',stil:'soft',f:()=>{chips.innerHTML='';zumKontakt();}}
      ]);
    }
    // Etwas fehlt noch — sagen, was.
    const fehlt=[['kname','Ihr Name'],['kmail','Ihre E-Mail'],['ktel','Ihre Telefonnummer']]
      .filter(([id])=>{const f=W.getElementById(id);return !f||!f.value.trim();})
      .map(([,l])=>l);
    await sagen('Danke, das habe ich oben eingetragen. Es fehlt noch <b>'+
                fehlt.join('</b> und <b>')+'</b>.');
    return beraterChips();
  }

  if(r.typ==='preis')   return starteFunnel('preis',null,false,r.text);
  if(r.typ==='kraefte') return starteFunnel('kraefte',null,false,r.text);

  chips.innerHTML='';
  // Keine Quellenzeile mehr (Martin, 21.08.): im Gespräch wirkt sie wie ein
  // Beleg-Anhängsel, das niemand anklickt. Wer nachfragt, bekommt die Antwort.
  if(r.text) sagenJetzt(r.text);

  if(r.typ==='mensch'){
    return setChips([
      {t:'Auf WhatsApp schreiben',stil:'wa',f:()=>{protokoll('system','WhatsApp geöffnet',{ereignis:'whatsapp'});spuelen();window.open('https://wa.me/4989200000830','_blank','noopener');}},
      {t:'Rückruf vereinbaren',stil:'stark',f:()=>rueckruf()},
      {t:'Doch lieber weiterfragen',stil:'soft',f:()=>offeneFrage?weiterFrage():beraterChips()}
    ]);
  }
  // Läuft der Fragenlauf, hat die offene Frage Vorrang vor allen Vorschlägen.
  if(modus==='fragen'&&offeneFrage){ await pause(ruhig?0:340); return weiterFrage(); }
  if(r.chips&&r.chips.length) return setChips(modellChips(r.chips));
  beraterChips();
}

async function frage(text,chip){
  tipp();
  if(chip) await flug(chip,text); else {bub(text,true);chips.innerHTML='';}
  W.getElementById('frei').value='';
  verlauf.push({rolle:'kunde',text});

  if(Date.now()>=llmPauseBis){
    const t=tippt();
    try{
      const r=await priaFragen(text);
      t.remove(); llmFehler=0;
      return verarbeite(r,text);
    }catch(e){
      t.remove(); llmFehler++;
      if(llmFehler>=2){
        llmPauseBis=Date.now()+30000; llmFehler=0;
        if(!ohneModell){ ohneModell=true;
          untertitel='KI-gestützte Assistentin · Vorschau ohne Sprachmodell';
          W.getElementById('status').textContent=untertitel; }
      }
      console.warn('[Pria] Sprachdienst nicht erreichbar, Stichwortsuche übernimmt:',e.message);
    }
  }
  return frageLokal(text);
}

/* ─── Notnagel: die alte Stichwortsuche ────────────────────────────── */
async function frageLokal(text){
  const t=text.toLowerCase();

  // Zuerst das Menschliche — Begrüßung, Dank, Erschöpfung.
  const sz=SOZIAL.find(s=>s.w.test(text.trim()));
  if(sz){ abwegig=0; return sozialAntwort(sz); }

  // Steht eine Frage offen und der Kunde weiß es nicht: Vorschlag statt Rückfrage.
  if(offeneFrage && offeneFrage.vorschlag && UNSICHER.test(text)) return vorschlagen(offeneFrage);

  // Bezieht sich der Satz auf eine unserer Angaben? Dann ist es eine
  // Antwort oder ein Nachtrag — keine Wissensfrage.
  if(modus==='fragen'){
    const th=themaZu(text);
    if(th){
      if(offeneFrage && th.k===offeneFrage.k){          // Antwort auf die offene Frage
        const o=offeneFrage, treffer=stufenTreffer(th,text);
        if(treffer.length>1) return mehrdeutig(o,treffer,(v,label,b)=>waehle(o,v,label,b||null));
        if(treffer.length===1){
          const label=(o.o.find(x=>x[0]===treffer[0])||[,treffer[0]])[1];
          return waehle(o,treffer[0],label,null);
        }
      }
      return nachtragen(th,text);                        // Nachtrag zu einer früheren
    }
  }

  if(/preis berechn|angebot|kostenrechner|durchrechnen|konkret/.test(t)) return starteFunnel('preis');
  if(/pflegekräfte (sehen|ansehen)|profile sehen|wer würde/.test(t)) return starteFunnel('kraefte');

  const e=suche(text);

  // Grundannahme umgedreht: Ein unbekannter Satz ist erst einmal eine ernst
  // gemeinte Nachricht. Charmant zurückgeführt wird nur, was ERKENNBAR vom
  // Thema weg ist — oder gar keine Sprache. Alles andere bekommt eine
  // Rückfrage. (Die eigentliche Lösung ist das Sprachmodell; Stichwörter
  // verlieren gegen normale Sprache.)
  if(!e && (ABWEGIG.test(text) || kauderwelsch(text))) return zurueckfuehren();

  // Nichts gefunden, aber es geht um Betreuung: nicht raten, nachfragen.
  if(!e){
    await sagen('Das kann ich Ihnen nicht aus dem Stand beantworten — und lieber frage ich nach, '+
                'als Ihnen etwas Falsches zu sagen.');
    const wege=[
      // Zuerst der Weg, der die meisten Betreuungsfragen tatsächlich beantwortet.
      {t:'Preis und Pflegekräfte ansehen',stil:'stark',f:b=>starteFunnel('preis',b)},
      {t:'Frage an einen Mitarbeiter geben',stil:'soft',f:async()=>{
        chips.innerHTML=''; bub('Bitte an einen Mitarbeiter geben',true);
        await sagen('Mache ich — Marta bekommt Ihre Frage im Wortlaut. Sagen Sie mir nur noch, '+
                    'unter welcher Nummer sie Sie erreicht.');
        if(offeneFrage) setChips([{t:'Und dann weiter bei Ihrer Frage',stil:'soft',f:()=>weiterFrage()}]);
      }},
      {t:'Ich formuliere es anders',stil:'soft',f:()=>{chips.innerHTML='';W.getElementById('frei').focus();}}
    ];
    if(offeneFrage && offeneFrage.vorschlag)
      wege.unshift({t:'Ich weiß es nicht — schlagen Sie etwas vor',stil:'soft',f:()=>vorschlagen(offeneFrage)});
    if(offeneFrage) wege.push({t:'Einfach weitermachen',stil:'soft',f:()=>weiterFrage()});
    return setChips(wege);
  }

  beantwortet.add(e);
  await sagen(e.a);

  // Nach den kaufnahen Antworten die Abzweigung anbieten, statt sie
  // im Chip-Wald zu verstecken.
  if(e.weiter && modus!=='fragen'){
    await pause(ruhig?0:420);
    await sagen(e.weiter);
    const rest=SCHNELLFRAGEN.filter(q=>{const x=suche(q);return !x||!beantwortet.has(x);}).slice(0,2);
    return setChips([
      {t:'Ja, Preis berechnen',stil:'stark',f:b=>starteFunnel('preis',b)},
      {t:'Pflegekräfte ansehen',stil:'stark',f:b=>starteFunnel('kraefte',b)},
      ...rest.map(q=>({t:q,stil:'soft',f:b=>frage(q,b)}))
    ]);
  }

  // Wunsch nach einem Menschen: die drei echten Wege anbieten.
  if(e.mensch){
    return setChips([
      {t:'Auf WhatsApp schreiben',stil:'wa',f:()=>{protokoll('system','WhatsApp geöffnet',{ereignis:'whatsapp'});spuelen();window.open('https://wa.me/4989200000830','_blank','noopener');}},
      {t:'Rückruf vereinbaren',stil:'stark',f:()=>rueckruf()},
      ...(offeneFrage?[{t:'Doch lieber weiterfragen',stil:'soft',f:()=>weiterFrage()}]
                     :[{t:'Doch lieber weiterfragen',stil:'soft',f:()=>beraterChips()}])
    ]);
  }

  if(modus==='fragen'&&offeneFrage) await weiterFrage();
  else beraterChips();
}
W.getElementById('senden').onclick=()=>{const v=W.getElementById('frei').value.trim();if(v)frage(v);};
W.getElementById('frei').addEventListener('keydown',e=>{if(e.key==='Enter'){const v=e.target.value.trim();if(v)frage(v);}});

/* ─── Öffnen, Schließen, Ansprache ────────────────────────────────── */
const blase=W.getElementById('blase'), panel=W.getElementById('panel'),
      pille=W.getElementById('pille'), pillentext=W.getElementById('pillentext');
// Pria schlummert, bis der Kunde am Formular vorbei ist (siehe unten).
let darfZeigen=false;

/* ─── Die Pille: eine Frage auf Kopfhöhe ────────────────────────────
   Vorbild bild.de: kein Aufpoppen, sondern ein ruhiger Streifen neben
   dem Kopf. Beim Weiterscrollen steht die nächste Frage drin — so
   merkt man, dass da jemand mitliest, ohne dass etwas im Weg ist. */
let frageNr=-1;
function pilleSetzen(i){
  if(i===frageNr) return;
  const text=PILLENFRAGEN[i%PILLENFRAGEN.length];
  if(frageNr<0){                       // erster Auftritt: ohne Wechselblende
    pillentext.textContent=text; frageNr=i; pille.classList.add('on');
    return;
  }
  frageNr=i;
  pille.classList.add('wechselt');
  setTimeout(()=>{ pillentext.textContent=text; pille.classList.remove('wechselt'); }, ruhig?0:220);
}
/* Wie weit ist der Leser? Alle rund anderthalb Bildschirmhöhen die
   nächste Frage — dicht genug, um aufzufallen, weit genug, um nicht
   zu flackern. */
function pillePruefen(){
  if(!darfZeigen||panel.classList.contains('on')) return;
  pilleSetzen(Math.floor(scrollY/(innerHeight*1.5)));
}
addEventListener('scroll',pillePruefen,{passive:true});

function versteckePille(){ pille.classList.remove('on'); }

/* ─── Handy: Seite festhalten und Tastatur ausgleichen ──────────────
   Zwei Dinge, die auf dem iPhone schiefgingen (Martin, 22.08.): Beim Tippen
   sprang das Panel, und die Seite dahinter liess sich scrollen.

   Ursache 1: `overflow:hidden` am body reicht auf iOS nicht. Verlaesslich ist
   `position:fixed` mit gemerkter Scrollposition — danach kann nichts mehr
   wegrutschen, und die Tastatur verkleinert nur noch das sichtbare Fenster.
   Nur auf dem Handy: auf dem Desktop schwebt ein kleines Panel, dort waere
   das Festhalten der ganzen Seite eine Zumutung.

   Ursache 2: `handyLayout` wurde aufgerufen, war aber nirgends definiert —
   bei jedem Oeffnen flog ein ReferenceError. Hier ist sie wieder. */
let gemerkterScroll = 0, seiteFest = false;
function seiteSperren(an){
  const b = document.body;
  if(an){
    b.classList.add('chat-offen');
    if(innerWidth > 640 || seiteFest) return;
    gemerkterScroll = window.scrollY || document.documentElement.scrollTop || 0;
    b.style.position='fixed'; b.style.top=(-gemerkterScroll)+'px';
    b.style.left='0'; b.style.right='0'; b.style.width='100%';
    seiteFest = true;
  }else{
    b.classList.remove('chat-offen');
    if(!seiteFest) return;
    b.style.position=''; b.style.top=''; b.style.left=''; b.style.right=''; b.style.width='';
    window.scrollTo(0, gemerkterScroll);
    seiteFest = false;
  }
}

const vv = window.visualViewport;
function handyLayout(){
  if(!panel.classList.contains('on')) return;
  const ausCss=()=>{ panel.style.height=''; panel.style.bottom=''; panel.style.top='';
                     panel.style.transform=''; };
  if(!vv || innerWidth>640) return ausCss();
  /* Nur eingreifen, wenn die Tastatur wirklich Platz wegnimmt. Alles unter
     120 px ist Adressleiste oder Messrauschen.

     Hier stand bis 22.08. `- vv.offsetTop` mit drin, und das war der Fehler,
     über den Martin gestolpert ist: offsetTop ist nicht zusätzliche
     Verdeckung, sondern wie weit iOS das sichtbare Fenster nach unten
     geschoben hat, um das fokussierte Feld freizulegen. Beides voneinander
     abzuziehen ließ die Tastatur rechnerisch verschwinden — genau dann, wenn
     sie am weitesten offen war. Die Bedingung schlug fehl, das Panel behielt
     seine volle Layout-Höhe, und die Eingabezeile stand plötzlich als
     loser Block irgendwo im Bild, während sich der Rest wegschieben ließ. */
  const tastatur = innerHeight - vv.height;
  if(tastatur < 120) return ausCss();
  /* Ueber `top`, nicht ueber `transform`.

     Der Unterschied ist auf iOS keine Geschmacksfrage: Safari laesst bei
     offener Tastatur das Layout-Fenster unveraendert und schiebt nur das
     sichtbare Fenster darueber hin und her (`interactive-widget` steht auf
     dem Standard `resizes-visual`). Ein `position:fixed`-Element haengt am
     Layout-Fenster und wandert dabei aus dem Bild. Ein transformiertes
     fixed-Element wird zusaetzlich auf eine eigene Compositing-Ebene
     gehoben, die WebKit waehrend der Tastatur-Animation nachweislich nicht
     zuverlaessig nachfuehrt — im Video vom 22.08. trieb das Panel als
     loser weisser Block ueber der Seite. `top` wird dagegen im normalen
     Layout aufgeloest. */
  panel.style.bottom = 'auto';
  panel.style.top = Math.round(vv.offsetTop) + 'px';
  panel.style.height = Math.round(vv.height) + 'px';
  panel.style.transform = '';
  runter();
}

/* Waehrend getippt wird, jeden Frame nachziehen.

   Die Ereignisse allein genuegen nicht: `visualViewport.scroll` feuert
   waehrend des Schiebens gedrosselt und waehrend der Tastatur-Animation
   teils gar nicht — genau in den Momenten, in denen das Panel verrutscht.
   Ein rAF-Takt kostet nur, solange ein Feld im Chat den Fokus hat, und
   endet mit dem Fokus. Verglichen wird vorher, damit nicht jeder Frame
   ein Style-Schreiben ausloest. */
let taktLaeuft = false, letzterStand = '';
function takt(){
  if(!taktLaeuft) return;
  if(vv){
    const stand = Math.round(vv.offsetTop)+'/'+Math.round(vv.height);
    if(stand !== letzterStand){ letzterStand = stand; handyLayout(); }
  }
  requestAnimationFrame(takt);
}
function taktAn(an){
  if(an === taktLaeuft) return;
  taktLaeuft = an; letzterStand = '';
  /* Die Klasse steuert nur das Aussehen (siehe .panel.tippt im CSS, dort
     bewusst nur im Handy-Block): beim Tippen weichen die Vorschlaege auf
     eine Reihe aus, damit das Gespraech sichtbar bleibt. */
  panel.classList.toggle('tippt', an);
  if(an) requestAnimationFrame(takt); else handyLayout();
  // Nach dem Umbau ans Ende — sonst haengt die letzte Blase ueber dem Rand.
  runter();
}
if(vv){ vv.addEventListener('resize',handyLayout); vv.addEventListener('scroll',handyLayout); }
/* Sicherheitsnetz: iOS meldet den Tastatur-Resize nicht immer sofort, und
   beim Wechsel zwischen zwei Feldern gar nicht. Fokus und Unschärfe sind das
   verlässlichere Signal — zweimal nachfassen kostet nichts. */
/* `composedPath()[0]` statt `e.target`: als Widget liegt der Chat in einem
   Shadow-Root, und ein am Fenster abgefangenes Ereignis nennt dort nur das
   Wirtselement, nicht das Feld darin. `panel.contains(e.target)` waere
   immer falsch gewesen — der Takt haette im echten Widget nie angefangen,
   waehrend er auf der Testseite lief. Genau die Sorte Unterschied, die
   erst auf dem Geraet auffaellt. */
const imChat = e => {
  const ziel = e.composedPath ? e.composedPath()[0] : e.target;
  return !!ziel && panel.contains(ziel);
};
addEventListener('focusin',e=>{
  // Ein Fokus im Kostenrechner dahinter geht das Panel nichts an.
  if(imChat(e)){ handyLayout(); taktAn(true); }
});
addEventListener('focusout',e=>{
  if(!imChat(e)) return;
  // Kurz weiterlaufen: beim Wechsel zwischen zwei Feldern kommt der
  // naechste focusin erst nach dem focusout, und die Tastatur bleibt offen.
  // activeElement ueber die Wurzel — im Shadow-Root nennt `document` nur
  // den Wirt.
  setTimeout(()=>{
    const wurzel = panel.getRootNode();
    const a = (wurzel && wurzel.activeElement) || null;
    if(!a || !panel.contains(a)) taktAn(false);
  }, 80);
});
addEventListener('orientationchange',()=>setTimeout(handyLayout,260));
panel.addEventListener('animationend',()=>{ panel.classList.add('fertig'); handyLayout(); });

async function oeffne(start){
  tipp(); versteckePille();
  blase.classList.add('weg'); panel.classList.add('on');
  seiteSperren(true);
  // Auch ohne Animation (reduzierte Bewegung) muss die Höhe stimmen.
  setTimeout(()=>{ panel.classList.add('fertig'); handyLayout(); }, 700);
  if(gestartet) return; gestartet=true;
  await pause(340);
  // Kurz halten: Der KI-Hinweis steht in der Kopfzeile, nicht im Gespräch.
  await sagen('Guten Tag! Ich bin <b>Pria</b> von Primundus. 👋');
  if(start==='lp'){
    /* Landingpage /beratung: der Besucher kam über eine Anzeige für Preis
       und Angebot — direkt hinein, ohne Umweg über „fragen Sie mich".
       Wortlaut nach der Preisansprache-Linie (Martin, 21.08.): das Angebot
       ist die Antwort, keine Spanne, kein Zögern. */
    return starteFunnel('preis',null,false,
      'Ich rechne Ihnen hier Ihren <b>Monatspreis</b> aus und stelle Ihnen gleich '+
      '<b>passende Pflegekräfte</b> vor, die aktuell verfügbar sind.');
  }
  if(start==='preis') return starteFunnel('preis',null,'Ja, gern');
  // Nicht nur „fragen Sie mich" (Martin, 22.08.) — was sie KANN, gehört in den
  // zweiten Satz, sonst wirkt sie wie ein Auskunftsschalter.
  await sagen('Ich beantworte Ihre Fragen zur häuslichen Betreuung — und rechne Ihnen aus, '+
              'was sie <b>bei Ihnen</b> kostet, samt <b>Vorstellung passender Pflegekräfte</b>, '+
              'die gerade verfügbar sind.');
  beraterChips();
}
/* ─── Fremde Leisten am unteren Rand ────────────────────────────────
   Auf der echten Seite liegt unten der Cookie-Hinweis — und der gehoert
   obenauf, nicht Pria. Statt uns darueberzuschieben, ruecken wir so weit
   nach oben, wie die Leiste hoch ist. Erkannt wird sie ueber den Punkt
   unten rechts: was dort liegt und fest positioniert ist, ist die Leiste.
   Verschwindet sie, rutscht Pria von selbst zurueck. */
const wurzelEl = (typeof W !== 'undefined' && W.host) ? W.host : document.body;
function leisteHoehe(){
  const punkte = document.elementsFromPoint
    ? document.elementsFromPoint(Math.round(innerWidth - 40), innerHeight - 6) : [];
  for(const e of punkte){
    if(e === wurzelEl || wurzelEl.contains(e)) continue;
    const st = getComputedStyle(e);
    if(st.position !== 'fixed' && st.position !== 'sticky') continue;
    const r = e.getBoundingClientRect();
    // Eine Leiste, kein Vollbild-Overlay und kein Zierstreifen.
    if(r.height >= 36 && r.height < innerHeight * 0.5) return Math.round(r.height + 10);
  }
  return 0;
}
let leisteJetzt = -1;
function leistePruefen(){
  if(panel.classList.contains('on')) return;      // offen deckt Pria ohnehin alles
  const h = leisteHoehe();
  if(h === leisteJetzt) return;
  leisteJetzt = h;
  wurzelEl.style.setProperty('--leiste', h + 'px');
}

// Der Hinweis kann spaeter erscheinen (Consent-Skript laedt nach) und wieder
// verschwinden — beides mitbekommen, ohne dauernd zu messen.
leistePruefen();
addEventListener('resize',leistePruefen,{passive:true});
setTimeout(leistePruefen,1200); setTimeout(leistePruefen,3000);
if(window.MutationObserver) new MutationObserver(()=>{
  clearTimeout(window.__leisteTimer);
  window.__leisteTimer=setTimeout(leistePruefen,220);
}).observe(document.body,{childList:true,subtree:false});

/* ─── Auftritt: erst nach dem Formular ──────────────────────────────
   Genau die Regel, die der WhatsApp-Knopf vorher hatte (Martin, 08.07.):
   Solange eine Kostenrechner-Karte im Bild ist, stoert ein schwebender
   Knopf nur den Weiter-Knopf darunter. Erst wenn der Kunde daran vorbei
   gescrollt ist, meldet sich Pria.
   Gibt es keine solche Karte — etwa auf der Prototyp-Seite — genuegt eine
   Bildschirmhoehe Scrollen. */
blase.classList.add('schlummert');
pille.classList.add('schlummert');
function zeigen(an){
  if(VOLL) an=false;              // im Voll-Chat gibt es keine Blase und keine Pille
  if(an===darfZeigen) return;
  darfZeigen=an;
  blase.classList.toggle('schlummert',!an);
  pille.classList.toggle('schlummert',!an);
  if(an) pillePruefen(); else versteckePille();
}
/* SEITE statt document: im Widget lenkt der Erzeuger jedes
   `document.querySelector*` in den Shadow-DOM um — die Kostenrechner-Karten
   liegen aber in der SEITE. */
const SEITE=document;
const karten=SEITE.querySelectorAll('[data-calculator-card], #calculator-form');
const imBild=new Set();
if(karten.length && window.IntersectionObserver){
  const beobachter=new IntersectionObserver(eintraege=>{
    for(const e of eintraege){ e.isIntersecting?imBild.add(e.target):imBild.delete(e.target); }
    pruefeAuftritt();
  },{threshold:0});
  karten.forEach(k=>beobachter.observe(k));
}
/* ZWEI Bedingungen, und beide muessen erfuellt sein:
     1. Es wurde ueberhaupt gescrollt — das ist die Regel, um die es geht.
     2. Keine Kostenrechner-Karte steht im Bild (dieselbe Ruecksicht, die
        der WhatsApp-Knopf hatte: sonst liegt der Knopf auf dem Weiter-Knopf).
   Die zweite allein hat nicht getragen: `IntersectionObserver` meldet in
   Hintergrund-Tabs nichts, und "keine Meldung" sah aus wie "keine Karte im
   Bild" — Pria stand dann sofort da, ohne dass jemand gescrollt hatte. */
function pruefeAuftritt(){
  zeigen(scrollY > Math.min(innerHeight*0.6, 420) && imBild.size===0);
}
addEventListener('scroll',pruefeAuftritt,{passive:true});
pruefeAuftritt();

blase.onclick=()=>oeffne();
pille.onclick=async()=>{ const f=pillentext.textContent; await oeffne(); frage(f); };
W.getElementById('zu').onclick=()=>{
  tipp();
  panel.classList.remove('on','fertig','tippt');
  // Auch `top` zuruecksetzen — sonst behaelt das Panel beim naechsten
  // Oeffnen den Versatz der letzten Tastatur.
  panel.style.height=''; panel.style.bottom=''; panel.style.top='';
  panel.style.transform='';
  taktAn(false);
  seiteSperren(false);
  blase.classList.remove('weg');
};

/* Avatare setzen: in der Blase begrüßt sie, im Kopf ist sie ruhig. */
W.querySelector('.bar .mark').innerHTML=avatar(null,true,true);
W.querySelector('.blase .mark').innerHTML=avatar(null,true,true);

/* ─── Voll-Chat: sofort offen, als Seite ────────────────────────────
   Auf /beratung ist der Chat kein Gast, sondern der Gastgeber: keine
   Blase, keine Auftrittsregel (zeigen() bleibt dort aus), das Panel liegt
   als .panel.voll unter der Kopfzeile der Seite. Das lp-Ereignis im
   Protokoll trennt diese Gespräche in Admin → Gespräche von denen des
   schwebenden Widgets. */
if(VOLL){
  panel.classList.add('voll');
  blase.classList.add('weg');
  protokoll('system','Voll-Chat (Landingpage) geöffnet',{ereignis:'lp'});
  oeffne('lp');
}

})();
