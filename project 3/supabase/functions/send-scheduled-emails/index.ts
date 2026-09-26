// Deployed by CI — .github/workflows/test.yml → deploy-kostenrechner-edge-functions
// (on push to integration/mamamia-onboarding). Do not deploy manually.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";
// Buffer ist in Deno kein Global. nodemailer erwartet für Attachments einen
// Node-Buffer (siehe sendEmailSmtp). Ohne diesen Import schlugen alle Mails
// MIT Anhang (Reminder-Inline-Foto, Angebots-PDF) mit "Buffer is not defined"
// fehl — die Edge-Runtime liefert ihn über den node:-Specifier.
import { Buffer } from "node:buffer";
// Multi-Job-Helfer (Bug #25) — pure Funktionen, separat wegen Testbarkeit.
import { appendJobParam, reminderBookedCancel } from "./followupJobs.ts";
// Kunden-Meilenstein: Bewerbung eingegangen = Profil fertig (Registry #69).
import { type LeadMilestone, MEILENSTEIN_EREIGNISSE, meilensteinAus } from "./meilenstein.ts";
// Nachfass-Kette und Abschiedssatz (Registry #70).
import {
  AKTIVITAET_NACH_PAUSE,
  GESTRICHENE_MAILS,
  KETTE_NACH_MAIL1,
  OFFENE_STATUS,
  pauseAktiv,
  rueckmeldungLink,
} from "./kette.ts";
// Persönliche Nachfrage zum Wunschtermin (Registry #72).
import {
  WIEDERVORLAGE_BETREFF,
  WIEDERVORLAGE_KERN,
  WIEDERVORLAGE_KNOPF,
  WIEDERVORLAGE_SPAETER,
  WIEDERVORLAGE_SPAETER_LINK,
  wiedervorlageEinstieg,
} from "./wiedervorlage.ts";
// Anrede-Namen sauber schreiben (Versalien → „Ruppert") — Kopie aus lib/email.ts,
// weil Edge Functions nicht aus lib/ importieren können. Siehe names.ts.
import { buildLeadRef, capitalizeName as capitalize, cleanNamePart } from "./names.ts";
// Nachtruhe-Fenster — Kopie von lib/quiet-hours.ts (Edge Fns koennen nicht aus
// lib/ importieren); Aenderungen immer in BEIDEN Dateien.
import { sendezeitIso } from "./quietHours.ts";
// Kundenmails neu (Vorschau v2, Martin 26.09.2026): Builder in kundenMails.ts (testbar),
// Stopp- und Countdown-Regeln in stopRegeln.ts.
import type { BewerbungsAngebot } from "./mailBausteine.ts";
import {
  type AngebotEingabe,
  angebotMail,
  erinnerungMail,
  type KundenMail,
  type Kontext,
  nachfass2Mail,
  nachfass3Mail,
  neuePflegekraefteMail,
  nudge1Mail,
  nudge2Mail,
  portalLink,
  reservierungBeendetMail,
  sucheStandMail,
  vierDingeMail,
} from "./kundenMails.ts";
import {
  ERINNERUNG_TYPEN,
  erinnerungStopp,
  erinnerungStufe,
  neuePflegekraefteEntscheidung,
  reservierungAktiv,
  reserviertBisAus,
  sucheStandStopp,
  VOR_DEM_ABSENDEN,
  vorAbsendenStopp,
} from "./stopRegeln.ts";
import { deutschStufe } from "./deutschStufe.ts";
import { testphaseUmleitung } from "./testphase.ts";
// Empfehlung fuer die Angebotsmail (Martin, 31.08.2026): echte gematchte
// Pflegekraft statt der Behauptung "im Portal warten Pflegekraefte".
// Reihenfolge + Trichter sind Kopien der Portal-Logik — siehe empfehlung.ts.
import {
  holeEmpfehlung,
  stufenWort,
  type EmpfehlungErgebnis, holeFuenf, fuenfListeHtml, fuenfListeText, fotoBudget,
  holeFuenfStreng, esc } from "./empfehlung.ts";
import {
  kraefteNochmalUm,
  vermittlerAngebotHtml, vermittlerAngebotText,
  vermittlerKraefteHtml, vermittlerKraefteText,
  VERMITTLER_ABSENDER,
  VERMITTLER_FUSSNOTE,
} from "./vermittler.ts";
import {
  BEWERTUNG_CAP,
  BEWERTUNG_CC,
  BEWERTUNG_STICHTAG,
  BEWERTUNG_TAGE,
  bewertungAusschlussgrund,
  getBewertungsanfrageTemplate,
  imBewertungsfenster,
  type BewertungsLead,
} from "./bewertung.ts";
import { kundenEmpfaenger, ccListe } from "./empfaenger.ts";
// Bewertungsstand für die Sterne in Martas Karte (Martin, 17.09.2026) — Kopie von
// lib/bewertungen-stand.ts, Stand wird einmal pro Aufruf geladen (siehe unten).
import {
  type BewertungsStand,
  BEWERTUNGS_STAND_ERSATZ,
  ladeBewertungsStand,
} from "./bewertungenStand.ts";
// Martas Signaturkarte — eine Vorlage für alle Mails (Kopie von lib/marta-karte.ts).
import { MARTA_KARTE_MOBIL_CSS, martaKarteHtml } from "./martaKarte.ts";
import {
  portalHerkunft,
  portalAngabenHinweisHtml,
  portalAngabenHinweisText,
  PORTAL_BETREFF,
} from "./herkunft.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};
 
interface ScheduledEmail {
  id: string;
  lead_id: string;
  email_type: string;
  recipient_email: string;
  scheduled_for: string;
  status: string;
  /** Zeilen-eigene Nutzlast (Reminder-Payload, Vermittler-Kopfdaten).
   *  Der Query liest select("*"), das Feld kam bisher nur per `as any`
   *  durch — hier steht es einmal richtig. */
  metadata?: Record<string, unknown> | null;
}
 
interface Lead {
  id: string;
  email: string;
  vorname: string;
  nachname: string;
  anrede_text: string;
  kalkulation: any;
  token: string;
  status: string;
  /** Zweite Empfängeradresse (CC) für alle Kundenmails — siehe empfaenger.ts. */
  email_cc?: string | null;
  /* Herkunft des Leads: "rechner" (Formular), "pria-chat" oder
     "portal:<domain>" fuer eingekaufte Leads (siehe portalHerkunft). */
  source?: string | null;
}
 
interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  fromName: string;
  siteUrl: string;
}
 
async function getSmtpConfig(
  supabase: any
): Promise<SmtpConfig> {
  const { data, error } = await supabase.rpc("get_smtp_config");
 
  if (error) {
    console.error("Error fetching SMTP config:", error.message);
    throw new Error(`Failed to get SMTP config: ${error.message}`);
  }
 
  return {
    host: data?.host || "smtp.ionos.de",
    port: parseInt(data?.port || "587"),
    user: data?.user || "",
    pass: data?.pass || "",
    from: data?.from || "",
    fromName: data?.fromName || "Primundus 24h-Pflege",
    siteUrl: data?.siteUrl || "https://kostenrechner.primundus.de",
  };
}
 
/* Absender der Vermittler-Mails: das Postfach, an das der Partner schreibt
 * (Ionos), nicht das SES-Konto der Kundenpost. Eigenes Vault-Profil.
 *
 * Faellt hart aus, wenn Zugang oder Absender fehlen — ein Rueckfall auf die
 * Kundenkonfiguration wuerde die Antwort mit einem fremden Absender
 * verschicken, und zwar unbemerkt. Lieber bleibt die Zeile `failed` stehen
 * und der Ops-Alarm meldet sich. */
async function getVermittlerSmtpConfig(
  // Wie getSmtpConfig: der Client ist hier untypisiert, weil die RPC-Namen
  // nicht im generierten Schema stehen.
  supabase: any,
  siteUrl: string,
): Promise<SmtpConfig> {
  const { data, error } = await supabase.rpc("get_vermittler_smtp_config");
  if (error) throw new Error(`Vermittler-SMTP nicht lesbar: ${error.message}`);
  const fehlend = ["user", "pass", "from"].filter((k) => !String(data?.[k] ?? "").trim());
  if (fehlend.length) {
    throw new Error(
      `Vermittler-SMTP unvollstaendig (${fehlend.join(", ")}) — Vault-Secrets `
      + "vermittler_smtp_user/_pass/_from setzen. KEIN Rueckfall auf das Kundenkonto.",
    );
  }
  return {
    host: data.host || "smtp.ionos.de",
    port: parseInt(data.port || "587"),
    user: data.user,
    pass: data.pass,
    from: data.from,
    fromName: data.fromName || "Primundus 24h-Pflege",
    siteUrl,
  };
}

const FEMALE_NAMES_SET = new Set(["aaliya","abby","ada","adela","adelheid","adeline","adriana","agata","agatha","agnes","aiko","aila","aileen","aimee","aisha","alana","alba","aleksandra","alexa","alexandra","alexia","alexis","alice","alicia","alina","alissa","aliyah","alke","allie","allison","alma","almut","alona","alva","alwine","amalia","amanda","amara","amaya","amelia","amelie","ami","amira","amy","ana","anastasia","andrea","andreja","angela","angelika","angelina","anita","anja","anna","annalena","anne","annegret","annelies","annelore","annette","anni","annika","antje","antonia","anuschka","aoife","arabell","ariadne","ariane","astrid","aurora","ava","babette","barbara","beatrice","beatrix","belen","bella","bente","berit","bernadette","bettina","bianca","birgit","birgitt","birgitta","birgitte","borbala","brigitta","brigitte","britt","brittany","bruna","brunhilde","camila","camilla","cara","carina","carla","carlotta","caro","carola","carolina","caroline","catharina","catharine","catrina","cecile","cecilia","charlotte","chiara","chloe","christel","christiane","christina","christine","claudia","claudine","constanze","corinna","cornelia","dagmar","dana","daniela","daria","deborah","diana","dina","dominique","dorothea","edda","edith","elena","eleonora","eliane","elisa","elisabeth","elizabeth","elke","ella","ellen","elsa","elsbeth","else","elvira","emilia","emma","erika","erna","ernestine","eva","eveline","evelyn","fatima","felicitas","filippa","fiona","franziska","frauke","frederike","frieda","gabriela","gabriele","gabi","gaby","gerda","gertrud","gisela","greta","gudrun","hanna","hannah","hannelore","heidemarie","heidi","heike","helene","helga","henriette","hildegard","hildegarde","hilke","hilde","ida","marta","ilona","ilse","imke","ines","ingeborg","ingrid","irina","iris","irmgard","irmtraud","isabel","isabelle","isadora","jacqueline","jana","janet","janna","jasmin","jennifer","jessica","jette","johanna","jolanta","josefine","josephine","julia","juliane","justine","karin","karla","katharina","katharine","kathrin","katja","katrin","katrina","katrine","klara","klaudia","klarissa","kordula","kristin","kristina","lara","larissa","laura","lea","leah","lena","leonie","leonora","lieselotte","lilli","lillian","lilly","lina","linda","lisa","lisbeth","lore","lori","lotte","lotta","louisa","louise","lucia","luisa","luise","luzie","lydia","magdalena","maja","malin","mara","margarita","margareta","margarethe","margit","margot","marianna","marie","marielle","marina","marita","marlene","marta","martina","mary","mathilde","maud","melanie","melinda","melissa","merle","mia","michelle","mira","miriam","mirja","monika","nadine","natalia","natalie","nathalie","nele","nicola","nicole","nina","nora","natascha","odette","olivia","ottilie","patrizia","paula","pauline","petra","pia","renate","ronja","rosa","rosalie","roswitha","ruth","sabrina","sandra","sara","sarah","silke","silvia","simona","simone","sina","sofia","sonja","sophie","stefanie","stella","stephanie","susanne","sybille","sylvia","tamara","tanja","tatjana","teresa","theresa","theres","tina","ulrike","ursula","uta","veronika","victoria","viola","virginia","walburga","waltraud","wanda","wiebke","wilhelmine","xenia","yvonne","zoe"]);
const MALE_NAMES_SET = new Set(["aaron","adam","alexander","alfred","alois","andre","andreas","axel","bastian","benedikt","benjamin","bernd","bo","burkhard","carsten","christian","christoph","claus","clemens","cornelius","damian","daniel","david","dieter","dietmar","dirk","dominik","edgar","elias","emilio","eric","erik","ernst","eugen","fabian","felix","finn","florian","frank","franz","frederik","gabriel","georg","gerhard","gottfried","guido","gunnar","hans","harry","hartmut","heinz","helge","helmut","henning","henrik","herbert","heiko","holger","horst","hubert","hugo","jakob","jan","jens","joachim","joe","joel","joerg","johannes","jonas","jonathan","jochen","kai","karl","kilian","Klaus","kevin","konrad","kristian","lars","leo","leon","leopold","lorenz","lothar","lucas","lukas","manfred","marco","markus","martin","matthias","max","maximilian","michael","mike","moritz","nikolaj","nikolaus","nils","norbert","oliver","oscar","oskar","otto","patrice","patrick","paul","peter","philipp","ralf","reinhard","richard","robert","rolf","sebastian","simon","stefan","steffen","stephan","steven","sven","thomas","thorsten","tillman","tim","tobias","tom","torsten","ulrich","uwe","valentin","victor","volker","werner","willi","will","wolf","wolfram","xaver"]);
 


function detectGenderFromName(vorname: string): "Frau" | "Herr" | "Familie" | null {
  if (!vorname?.trim()) return null;
  const v = vorname.trim();
  if (v.toLowerCase().includes(" und ") || v.includes(" & ") || v.includes("/")) return "Familie";
  const first = v.split(/[\s-]+/)[0].toLowerCase();
  if (FEMALE_NAMES_SET.has(first)) return "Frau";
  if (MALE_NAMES_SET.has(first)) return "Herr";
  return null;
}
 
function buildAnredeText(anrede: string | null, nachname: string, vorname: string): string {
  const effectiveAnrede = anrede || detectGenderFromName(vorname);
  const n = capitalize(cleanNamePart(nachname));
  if (effectiveAnrede === "Frau" && n) return `Sehr geehrte Frau ${n}`;
  if (effectiveAnrede === "Herr" && n) return `Sehr geehrter Herr ${n}`;
  if (effectiveAnrede === "Familie" && n) return `Sehr geehrte Familie ${n}`;
  // KEIN Vorname-Fallback (Martin 2026-08): immer formal + Nachname, sonst neutral.
  // Salutation unknown → neutraler, freundlicher Fallback (konsistent zu
  // den anderen Mails). Früher „Sehr geehrte Damen und Herren" — formell,
  // aber seit Name-optional auch häufig der gerenderte Default.
  return "Guten Tag";
}

/* „Guten Tag Frau Müller" in allen Kundenmails (Vorschau v2, Martin 26.09.2026) — vorher
   „Hallo Frau …" in den Folgemails und „Guten Tag" nur in der Angebotsmail. Name bleibt
   der Funktionsname, damit die übrigen Builder (Nachfrage, Wechsel) unverändert bleiben. */
function buildHalloAnrede(anrede: string | null, nachname: string, vorname: string): string {
  const effectiveAnrede = anrede || detectGenderFromName(vorname);
  const n = capitalize(cleanNamePart(nachname));
  if (effectiveAnrede === "Frau" && n) return `Guten Tag Frau ${n}`;
  if (effectiveAnrede === "Herr" && n) return `Guten Tag Herr ${n}`;
  if (effectiveAnrede === "Familie" && n) return `Guten Tag Familie ${n}`;
  // KEIN Vorname-Fallback (Martin 2026-08).
  return "Guten Tag";
}
 
/* `fussnote` ueberschreibt den letzten Satz der Fusszeile. Default ist der
   Kunden-Satz ("weil Sie eine Kalkulation ... angefordert haben") — fuer
   einen Vermittler waere er schlicht falsch, und der Abmelde-Link darunter
   truege seinen Portal-Token nach draussen. */
/* Absender im Fuss. Vorgabe ist die deutsche Marke — so bleibt jede
   Kundenmail unveraendert; abweichen tun nur die Vermittler-Mails, die von
   der polnischen Gesellschaft an einen Geschaeftspartner gehen. */
const ABSENDER_DE = {
  name: "Primundus Deutschland",
  zeilen: "24h-Pflege und Betreuung zu Hause",
  kurz: "Primundus Deutschland",
};

function buildEmailWrapper(
  lead: Lead,
  siteUrl: string,
  content: string,
  fussnote?: string,
  absender: { name: string; zeilen: string; kurz: string } = ABSENDER_DE,
): string {
  const logoUrl = `${siteUrl}/images/Primundus-Logo_V6.png`;
  const testUrl = `${siteUrl}/images/primundus_testsieger-2021.webp`;
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Primundus 24h-Pflege</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333333; background-color: #f4f4f4; }
    .email-wrapper { width: 100%; background-color: #f4f4f4; padding: 20px 0; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .email-header { background: #ffffff; padding: 24px 40px 20px 40px; border-bottom: 1px solid #f0ebe4; }
    .email-content { padding: 40px 40px 32px; text-align: left; }
    .email-footer { background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e0e0e0; }
    /* Mouseover fuer den "Zum Profil"-Hinweis an der Empfehlung. Greift in
       Apple Mail, iOS Mail und der Gmail-Weboberflaeche; Outlook Desktop
       kennt kein :hover — dort bleibt der Link statisch, das ist in Ordnung.
       Bewusst AUSSERHALB der Media-Query: Mauszeiger gibt es am Desktop. */
    a.profil-link:hover { color: #E76F63 !important; text-decoration: underline !important; }
    @media only screen and (max-width: 600px) {
      .email-content { padding: 30px 20px; }
      .price-stage-cell { display: block !important; width: 100% !important; padding: 18px 22px 16px !important; border-right: none !important; border-bottom: 1px solid #ebe2d2 !important; }
      .price-stage-cell:last-child { border-bottom: none !important; }
      /* Empfehlungs-Karte: Foto und Name bleiben AUCH auf dem Handy
         nebeneinander — genau wie die Karte im Portal (MatchCard). 64 px Foto
         plus Text passen bei 375 px bequem; ein Umbruch haette die Mail von
         der Ansicht entfernt, die der Kunde eine Sekunde spaeter sieht.
         Die Faktenzeile laeuft ohnehin ueber die volle Kartenbreite. */
      .empf-foto { padding-left: 0 !important; }
    }
    /* Handy (11.09.2026): Signatur-Karte (buildMartaSig) — "DIE WELT" in eine
       eigene Zeile, Siegelbild kleiner, sonst passt die Siegel-Spalte nicht
       neben Foto + Name; Anrufen/WhatsApp duerfen umbrechen (17.09.2026,
       Regeln aus martaKarte.ts). Kopfzeile mit 20 statt 40 px Rand wie in
       lib/email-template.ts (Logo 160 + Siegel-Block brauchten mit 40 px
       Rand 363 px). Eigene Grenze 480 statt 600 px: ein 600 px breites
       Fenster behaelt exakt die Desktop-Optik. */
    @media only screen and (max-width: 480px) {
      .email-header { padding: 20px 20px 16px 20px !important; }${MARTA_KARTE_MOBIL_CSS}
      /* Bestpreisgarantie-Zeile der Eingangsbestaetigung (Siegel 190 px +
         Linktext) war auf 360–390 px breiter als der Bildschirm: Siegel
         ueber den Link statt daneben (17.09.2026). */
      .bpg-bild { display: block !important; width: auto !important; padding: 0 0 10px 0 !important; }
      .bpg-text { display: block !important; }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr><td align="center">
        <div class="email-container">
          <div class="email-header">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="vertical-align:middle;">
                  <img src="${logoUrl}" alt="Primundus Logo" width="160" style="display:block;width:160px;max-width:160px;height:auto;" />
                </td>
                <td style="vertical-align:middle;text-align:right;">
                  <table cellpadding="0" cellspacing="0" role="presentation" style="margin-left:auto;">
                    <tr>
                      <td style="text-align:center;vertical-align:middle;padding-right:8px;border-right:1px solid #f0ebe4;">
                        <img src="${testUrl}" alt="Testsieger DIE WELT" width="36" style="display:block;width:36px;height:auto;" />
                      </td>
                      <td style="text-align:left;padding-left:8px;">
                        <!-- Siegel bewusst KOMPAKT: "6× Testsieger" statt "Testsieger" +
                             eigener Zeile "6× in Folge". Der Block sitzt neben dem Logo in
                             der Kopfzeile und hat wenig Platz — vier Zeilen wirkten
                             gedraengt und liessen "Testsieger" ohne die Zahl stehen
                             (Martin 28.08.2026). Im FLIESSTEXT, wo eine ganze Zeile zur
                             Verfuegung steht, bleibt "6× in Folge" erwuenscht. -->
                        <p style="margin:0 0 1px 0;font-size:10px;font-weight:700;color:#3D2B1F;white-space:nowrap;">6× Testsieger</p>
                        <p style="margin:0 0 1px 0;font-size:10px;color:#B5A184;white-space:nowrap;font-weight:600;">DIE WELT</p>
                        <p style="margin:0;font-size:9px;color:#aaa;white-space:nowrap;">Preis &amp; Qualit&auml;t</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </div>
          <div class="email-content">
            ${content}
          </div>
          <div class="email-footer">
            <div style="font-weight:600;font-size:15px;color:#3D2B1F;margin-bottom:6px;">${absender.name}</div>
            <div style="font-size:13px;color:#666;line-height:1.8;">
              ${absender.zeilen}<br>
              <a href="tel:+4989200000830" style="color:#0066CC;text-decoration:none;">+49 89 200 000 830</a> |
              <a href="mailto:info@primundus.de" style="color:#0066CC;text-decoration:none;">info@primundus.de</a><br>
              <a href="https://primundus.de" style="color:#0066CC;text-decoration:none;">www.primundus.de</a>
            </div>
            <div style="font-size:12px;color:#999;margin-top:16px;line-height:1.5;">
              Diese E-Mail wurde versendet an: ${lead.email}<br>
              ${absender.kurz}<br><br>
              ${fussnote ?? `Sie erhalten diese E-Mail, weil Sie eine Kalkulation auf primundus.de angefordert haben.${lead.token ? `<br><a href="${siteUrl.replace(/\/$/, "")}/abmelden?token=${encodeURIComponent(lead.token)}" style="color:#999;text-decoration:underline;">Keine E-Mails mehr erhalten</a>` : ""}`}
            </div>
          </div>
        </div>
      </td></tr>
    </table>
  </div>
</body>
</html>`;
}
 
/* Bewertungsstand fuer die Sterne in der Karte. Der Handler setzt ihn
   einmal pro Aufruf (Demo-Vorschau und Versand), bevor Mails gebaut werden —
   die ~15 Mail-Bauer bleiben so unveraendert synchron. Bis dahin (und wenn
   primundus.de nicht antwortet) gilt der Ersatzwert. */
let bewertungsStand: BewertungsStand = BEWERTUNGS_STAND_ERSATZ;

/* Grussformel + Martas Karte. Die Karte kommt aus martaKarte.ts (eine Vorlage
   fuer alle Mails, Handy-Regeln MARTA_KARTE_MOBIL_CSS in buildEmailWrapper).
   Martas Foto liegt auf primundus.de statt auf dem Kostenrechner (20.08.):
   nach dem Foto-Wechsel (#481) hing der Kostenrechner-Build >45 Min in
   Renders Warteschlange und JEDE Mail verlinkte ein 404 — primundus.de steht
   unabhaengig davon.
   Vermittler-Mails ("vermittler"): Karte ohne Sterne und ohne
   Kunden-Konditionen in der Faktenzeile (vermittler.ts). */
function buildMartaSig(siteUrl: string, fuer: "kunde" | "vermittler" = "kunde"): string {
  const karte = fuer === "kunde"
    ? martaKarteHtml({ fuer: "kunde", bewertung: bewertungsStand, siteUrl, presseLogos: true })
    : martaKarteHtml({ fuer: "vermittler", siteUrl, presseLogos: true });
  return `
    <p style="font-size:16px;line-height:1.7;color:#555;margin-top:24px;margin-bottom:16px;">Mit freundlichen Grüßen<br><strong style="color:#3D2B1F;">Marta Kapcio</strong></p>
    ${karte}`;
}
 
// ── Portal-Link + Lead-Meilenstein ────────────────────────────────────────
// Der kostenrechner-Lead erfährt vom CA-App-Portal über `lead_events`, die
// per /api/lead-event reingeschrieben werden (token-authentifiziert).
function buildPortalUrl(portalBase: string, token: string, goto?: string): string {
  // goto: Sprungziel im Portal (z. B. "bewerbungen") — der Kunde landet
  // direkt bei der Bewerbung statt oben auf der Portal-Startansicht.
  const base = `${portalBase.replace(/\/$/, "")}/?token=${encodeURIComponent(token)}`;
  return goto ? `${base}&goto=${encodeURIComponent(goto)}` : base;
}

/* Kontext der neuen Kundenmails (kundenMails.ts): Anrede, Links, Martas Karte. Die Karte
   liest den Bewertungsstand dieses Aufrufs, deshalb pro Mail frisch gebaut. */
function kundenKontext(lead: Lead, siteUrl: string, portalBase: string): Kontext {
  return {
    anrede: buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || ""),
    site: siteUrl,
    portal: (param) => portalLink(portalBase, lead.token, siteUrl, param),
    token: lead.token || null,
    marta: buildMartaSig(siteUrl),
  };
}

/** Fertige Kundenmail in die Hülle setzen. */
function inHuelle(lead: Lead, siteUrl: string, m: KundenMail): { subject: string; html: string; text: string } {
  return { subject: m.betreff, html: buildEmailWrapper(lead, siteUrl, m.html), text: m.text };
}

// Pause aus /rueckmeldung (Registry #72): letzte kunde_pausiert-Zeile + ob der
// Kunde seitdem selbst aktiv war (dann ist die Pause vorbei).
async function pauseStand(supabase: any, leadId: string): Promise<{ bis: string | null; aktivSeitPause: boolean } | null> {
  const { data: pausen } = await supabase
    .from("lead_events")
    .select("created_at, metadata")
    .eq("lead_id", leadId)
    .eq("event_type", "kunde_pausiert")
    .order("created_at", { ascending: false })
    .limit(1);
  const pause = Array.isArray(pausen) ? pausen[0] : null;
  if (!pause) return null;
  const { data: aktiv } = await supabase
    .from("lead_events")
    .select("id")
    .eq("lead_id", leadId)
    .in("event_type", [...AKTIVITAET_NACH_PAUSE])
    .gt("created_at", pause.created_at)
    .limit(1);
  return {
    bis: (pause.metadata as { bis?: string } | null)?.bis ?? null,
    aktivSeitPause: Array.isArray(aktiv) && aktiv.length > 0,
  };
}

async function getLeadMilestone(supabase: any, leadId: string): Promise<LeadMilestone> {
  const { data } = await supabase
    .from("lead_events")
    .select("event_type")
    .eq("lead_id", leadId)
    .in("event_type", [...MEILENSTEIN_EREIGNISSE]);
  return meilensteinAus((data ?? []).map((e: { event_type: string }) => e.event_type));
}

function buildAngebotsEmailHtml(lead: Lead, siteUrl: string): string {
  const kalkulationUrl = `${siteUrl}/kalkulation/${lead.id}`;
  const anredeText = buildAnredeText(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  const kalk = lead.kalkulation || {};
  const bruttopreis = kalk.bruttopreis || 0;
  const gesamteZuschuesse = kalk.zuschüsse?.gesamt || 0;
  const eigenanteil = kalk.eigenanteil || (bruttopreis - gesamteZuschuesse);
 
  const formatEuro = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
 
  const content = `
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${anredeText},</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">vielen Dank für Ihre Anfrage. Auf Grundlage Ihrer Angaben haben wir Ihr <strong style="color:#2D1F0F;">persönliches Angebot</strong> für die 24-Stunden-Betreuung zu Hause erstellt.</p>
 
    <div style="background:#FAF7F0;border:1.5px solid #B5A184;border-radius:8px;padding:12px 14px;margin:18px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td style="vertical-align:top;padding-right:8px;">
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#8B6914;margin-bottom:2px;">Monatssatz</div>
            <div style="font-size:17px;font-weight:700;color:#2D1F0F;">${formatEuro(bruttopreis)}</div>
            <div style="font-size:10px;color:#aaa;">inkl. Steuern &amp; Sozialabgaben</div>
          </td>
          <td style="vertical-align:top;text-align:right;border-left:1px solid #e8d9a0;padding-left:12px;">
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#8B6914;margin-bottom:2px;">Eigenanteil möglich</div>
            <div style="font-size:16px;font-weight:700;color:#1E5C3A;">${formatEuro(eigenanteil)}</div>
            <div style="font-size:10px;color:#aaa;">nach Pflegekasse</div>
          </td>
        </tr>
      </table>
    </div>
 
    <div style="font-size:12px;color:#888;line-height:1.8;margin:0 0 18px;text-align:center;">
      <span style="color:#2D6A4F;font-weight:600;">✓ Keine Vertragsbindung</span>&ensp;&middot;&ensp;
      <span style="color:#2D6A4F;font-weight:600;">✓ Tagesgenaue Abrechnung</span>&ensp;&middot;&ensp;
      <span style="color:#2D6A4F;font-weight:600;">✓ Kosten erst bei Anreise</span>
    </div>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">Im Angebot finden Sie alle Details zu Kosten, Konditionen und dem weiteren Ablauf.</p>
 
    ${bulletproofButton(kalkulationUrl, "Angebot jetzt ansehen →")}
 
    <div style="background:#EEF6F0;border-left:3px solid #4CAF50;padding:12px 14px;border-radius:0 6px 6px 0;font-size:14px;color:#555;line-height:1.6;">
      Für Sie bleibt alles <strong>unverbindlich</strong>, bis Sie sich für eine passende Betreuungskraft entscheiden und diese anreist.
    </div>
 
    ${buildMartaSig(siteUrl)}`;
 
  return buildEmailWrapper(lead, siteUrl, content);
}
 
function buildAngebotsEmailText(lead: Lead, siteUrl: string): string {
  const kalkulationUrl = `${siteUrl}/kalkulation/${lead.id}`;
  const anredeText = buildAnredeText(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  return `${anredeText},
 
vielen Dank für Ihre Anfrage. Auf Grundlage Ihrer Angaben haben wir Ihr persönliches Angebot für die 24-Stunden-Betreuung zu Hause erstellt.
 
Angebot jetzt ansehen:
${kalkulationUrl}
 
Für Sie bleibt alles unverbindlich, bis Sie sich für eine passende Betreuungskraft entscheiden und diese anreist.
 
Mit freundlichen Grüßen
Marta Kapcio
 
---
✓ Keine Vertragsbindung · ✓ Tagesgenaue Abrechnung · ✓ Kosten erst bei Anreise
Primundus Deutschland | 24h-Pflege und Betreuung
Telefon: +49 89 200 000 830 | info@primundus.de | www.primundus.de`;
}
 
// Nachfass-Inhalt je nach Lead-Meilenstein:
//   none             → war noch nicht im Portal
//   portal_opened    → war im Portal, aber Patientendaten fehlen (Hauptfall)
//   patient_data_saved → Daten vollständig (selbst gespeichert oder schon eine
//                        Bewerbung, Registry #69), aber noch keine Einladung
// (caregiver_invited wird vorher abgebrochen, erreicht den Builder nicht.)
function nachfassContent(milestone: LeadMilestone): { intro: string; body: string; cta: string } {
  if (milestone === "patient_data_saved") {
    return {
      intro: "Ihre Angaben zur Pflegesituation sind vollständig – perfekt.",
      body: "Jetzt fehlt nur noch der letzte Schritt: Laden Sie Ihre <strong>Wunsch-Pflegekräfte ein</strong>. Die Anfrage geht direkt an die Betreuungskraft, und Sie erhalten zeitnah eine Rückmeldung.",
      cta: "Pflegekräfte einladen →",
    };
  }
  if (milestone === "portal_opened") {
    return {
      intro: "wir haben gesehen, dass Sie schon in Ihrem Kundenportal waren – schön!",
      body: "Damit es weitergeht, fehlt nur noch <strong>ein Schritt: kurz die Pflegesituation beschreiben</strong>. Erst damit kennen die Pflegekräfte den konkreten Pflegebedarf – und Sie können Ihre Wunsch-Pflegekräfte einladen und Bewerbungen erhalten. Es dauert nur 2 Minuten.",
      cta: "Pflegesituation beschreiben →",
    };
  }
  return {
    intro: "ich wollte kurz nachfragen, ob bei Ihnen alles angekommen ist.",
    body: "In Ihrem Kundenportal liegen bereits <strong>passende Betreuungskräfte</strong> für Sie bereit – mit Profil, Erfahrung und Verfügbarkeit. Schauen Sie gern unverbindlich rein.",
    cta: "Angebot und Pflegekräfte anzeigen →",
  };
}

// Bulletproof CTA-Button. Funktioniert in Outlook (Word-Renderer), Gmail,
// Apple Mail, Thunderbird, Yahoo, Web-Clients. Schlüssel-Tricks:
//   - <table align="center"> statt <div text-align:center> — Outlook respektiert
//     die `align`-HTML-Attribute zuverlässig
//   - bgcolor-HTML-Attribut + CSS-Fallback auf <td> — Outlook nimmt das HTML-Attr
//   - Padding auf <td>, NICHT auf <a> — Outlook ignoriert Padding auf inline-Elementen
//   - Anker ohne display:inline-block (das hat Outlook unzuverlässig gerendert)
function bulletproofButton(url: string, label: string, bgColor: string = "#2A9D5C"): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto;border-collapse:separate;">
      <tr>
        <td align="center" bgcolor="${bgColor}" style="background-color:${bgColor};border-radius:8px;padding:13px 34px;">
          <a href="${url}" target="_blank" style="color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.4;">${label}</a>
        </td>
      </tr>
    </table>`;
}

function nachfassCtaButton(url: string, label: string): string {
  // Sand-Braun für Nachfass (passt zum Primundus-Farbschema)
  return bulletproofButton(url, label, "#9A8A73");
}

// Quell-Markierung (14.08.): &m=<kürzel> pro Nachfass-Mail — das Portal
// schreibt den Wert in die portal_opened-Metadata, damit die Wirkung der
// einzelnen Mails messbar wird (vorher Blindflug bei der Attribution).
function withMailMark(url: string, m: string): string {
  return url.includes("?") ? `${url}&m=${m}` : `${url}?m=${m}`;
}

// Portal-PS — kurzer Reinforcer für Nurture-Mails (Nachfass_1). Bewusst
// NICHT in Nachfass_2/_3, die als minimale persönliche Nachfrage gestaltet
// sind. (Die frühere Bestpreis-Garantie ist seit 14.08. überall entfernt.)
const PORTAL_PS_TEXT =
  "P.S. In Ihrem Kundenportal sehen Sie jederzeit Ihren Preis und passende Betreuungskräfte — Sie entscheiden in Ruhe, ohne weiteren Kontakt.";
function portalPsHtml(): string {
  return `<p style="font-size:13px;line-height:1.65;color:#777;margin:18px 0 0;border-top:1px solid #f0ebe4;padding-top:14px;"><strong style="color:#5C4A32;">P.S.</strong> In Ihrem <strong style="color:#2D1F0F;">Kundenportal</strong> sehen Sie jederzeit Ihren Preis und passende Betreuungskräfte — Sie entscheiden in Ruhe, ohne weiteren Kontakt.</p>`;
}

function buildNachfass1Html(lead: Lead, siteUrl: string, portalBase: string, milestone: LeadMilestone): string {
  const portalUrl = (portalBase && lead.token) ? buildPortalUrl(portalBase, lead.token) : siteUrl;
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  const v = nachfassContent(milestone);

  const content = `
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${halloAnrede},</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${v.intro}</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${v.body}</p>

    ${nachfassCtaButton(portalUrl, v.cta)}
    ${portalPsHtml()}
    ${buildMartaSig(siteUrl)}`;

  return buildEmailWrapper(lead, siteUrl, content);
}

function buildNachfass1Text(lead: Lead, siteUrl: string, portalBase: string, milestone: LeadMilestone): string {
  const portalUrl = (portalBase && lead.token) ? buildPortalUrl(portalBase, lead.token) : siteUrl;
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  const v = nachfassContent(milestone);
  const plain = (s: string) => s.replace(/<\/?strong>/g, "");
  return `${halloAnrede},

${plain(v.intro)}

${plain(v.body)}

${v.cta.replace(/ →$/, "")}: ${portalUrl}

${PORTAL_PS_TEXT}

Mit freundlichen Grüßen
Marta Kapcio

---
✓ Keine Vertragsbindung · ✓ Tagesgenaue Abrechnung · ✓ Kosten erst bei Anreise
Primundus Deutschland | +49 89 200 000 830 | www.primundus.de`;
}

// Tag-7: kurzer ehrlicher Einstieg + drei nuetzliche Infos, kein Druck.
function buildProfilNudge3Html(lead: Lead, siteUrl: string, portalBase: string): string {
  const portalUrl = (portalBase && lead.token) ? withMailMark(buildPortalUrl(portalBase, lead.token), "pn3") : siteUrl;
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  const li = 'p style="font-size:14.5px;line-height:1.7;color:#444;margin:0 0 10px;"';
  const content = `
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${halloAnrede},</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">vor einer Woche haben Sie Ihr Angebot erhalten &ndash; darf ich kurz nachfragen, wo Sie stehen? Gibt es offene Fragen, oder etwas, bei dem wir Sie unterstützen können?</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">Falls die Betreuung noch ansteht: Bisher haben Sie keine Bewerbungen von Pflegekräften erhalten, weil zur Pflegesituation noch einige Angaben fehlen. Kurz beschreiben &ndash; und Sie sehen kostenfrei und unverbindlich, wer die Betreuung übernehmen möchte.</p>
    ${bulletproofButton(portalUrl, "Angaben vervollständigen&nbsp;&nbsp;&rarr;", "#2A9D5C")}
    <p style="font-size:15px;line-height:1.75;color:#444;margin:16px 0 0;">Antworten Sie einfach auf diese E-Mail &ndash; oder rufen Sie mich an: <a href="tel:+4989200000830" style="color:#8B7355;text-decoration:none;font-weight:600;">089&nbsp;200&nbsp;000&nbsp;830</a>, gern auch per <a href="https://wa.me/4989200000830" style="color:#8B7355;text-decoration:none;font-weight:600;">WhatsApp</a>.</p>
    <p style="font-size:13px;line-height:1.6;color:#888;margin:18px 0 0;">PS: Klappt im Portal etwas nicht, oder möchten Sie das lieber persönlich klären? Sie erreichen mich unter <a href="tel:+4989200000830" style="color:#8B7355;text-decoration:none;">089&nbsp;200&nbsp;000&nbsp;830</a> oder per <a href="https://wa.me/4989200000830" style="color:#8B7355;text-decoration:none;">WhatsApp</a>.</p>
    ${buildMartaSig(siteUrl)}`;
  return buildEmailWrapper(lead, siteUrl, content);
}

function buildProfilNudge3Text(lead: Lead, siteUrl: string, portalBase: string): string {
  const portalUrl = (portalBase && lead.token) ? withMailMark(buildPortalUrl(portalBase, lead.token), "pn3") : siteUrl;
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  return `${halloAnrede},

vor einer Woche haben Sie Ihr Angebot erhalten — darf ich kurz nachfragen, wo Sie stehen? Gibt es offene Fragen, oder etwas, bei dem wir Sie unterstützen können?

Falls die Betreuung noch ansteht: Bisher haben Sie keine Bewerbungen von Pflegekräften erhalten, weil zur Pflegesituation noch einige Angaben fehlen. Kurz beschreiben — und Sie sehen kostenfrei und unverbindlich, wer die Betreuung übernehmen möchte.

Angaben vervollständigen: ${portalUrl}

Antworten Sie einfach auf diese E-Mail — oder rufen Sie mich an: 089 200 000 830, gern auch per WhatsApp (https://wa.me/4989200000830).

PS: Klappt im Portal etwas nicht, oder möchten Sie das lieber persönlich klären? Sie erreichen mich unter 089 200 000 830 oder per WhatsApp (https://wa.me/4989200000830).

Mit freundlichen Grüßen
Marta Kapcio

---
Primundus Deutschland | +49 89 200 000 830 | www.primundus.de`;
}

// Tag-49: Wechsel-Fenster (nach 6–8 Wochen erster Pflegekraft-Wechsel) — Info-Ton.
// Nachfrage zum Wunschtermin (Registry #72) — Wortlaut in wiedervorlage.ts.
export function buildWiedervorlageHtml(lead: Lead, siteUrl: string, portalBase: string, seit: string | null): string {
  const portalUrl = (portalBase && lead.token) ? buildPortalUrl(portalBase, lead.token) : siteUrl;
  const spaeterUrl = lead.token ? rueckmeldungLink(siteUrl, lead.token, "aktuell-nicht") : "tel:+4989200000830";
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  const content = `
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${halloAnrede},</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${wiedervorlageEinstieg(seit)}</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${WIEDERVORLAGE_KERN}</p>
    ${bulletproofButton(portalUrl, `${WIEDERVORLAGE_KNOPF}&nbsp;&nbsp;&rarr;`, "#2A9D5C")}
    <p style="font-size:14px;line-height:1.65;color:#666;margin:18px 0 0;">${WIEDERVORLAGE_SPAETER} <a href="${spaeterUrl}" style="color:#8B7355;">${WIEDERVORLAGE_SPAETER_LINK}</a></p>
    <p style="font-size:13px;line-height:1.6;color:#888;margin:18px 0 0;">PS: Klappt im Portal etwas nicht, oder möchten Sie das lieber persönlich klären? Sie erreichen mich unter <a href="tel:+4989200000830" style="color:#8B7355;text-decoration:none;">089&nbsp;200&nbsp;000&nbsp;830</a> oder per <a href="https://wa.me/4989200000830" style="color:#8B7355;text-decoration:none;">WhatsApp</a>.</p>
    ${buildMartaSig(siteUrl)}`;
  return buildEmailWrapper(lead, siteUrl, content);
}

export function buildWiedervorlageText(lead: Lead, siteUrl: string, portalBase: string, seit: string | null): string {
  const portalUrl = (portalBase && lead.token) ? buildPortalUrl(portalBase, lead.token) : siteUrl;
  const spaeterUrl = lead.token ? rueckmeldungLink(siteUrl, lead.token, "aktuell-nicht") : "089 200 000 830";
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  return `${halloAnrede},

${wiedervorlageEinstieg(seit)}

${WIEDERVORLAGE_KERN}

${WIEDERVORLAGE_KNOPF}: ${portalUrl}

${WIEDERVORLAGE_SPAETER} ${spaeterUrl}

PS: Klappt im Portal etwas nicht, oder möchten Sie das lieber persönlich klären? Sie erreichen mich unter 089 200 000 830 oder per WhatsApp (https://wa.me/4989200000830).

Mit freundlichen Grüßen
Marta Kapcio

---
Primundus Deutschland | +49 89 200 000 830 | www.primundus.de`;
}

function buildReaktivierungWechselHtml(lead: Lead, siteUrl: string, portalBase: string): string {
  const portalUrl = (portalBase && lead.token) ? buildPortalUrl(portalBase, lead.token) : siteUrl;
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  const content = `
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${halloAnrede},</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">vielleicht haben Sie längst eine Betreuung gefunden &ndash; dann wünsche ich Ihnen alles Gute damit. Ich melde mich, weil bei vielen Familien nach einiger Zeit ein <strong>Wechsel der Pflegekraft</strong> ansteht. Falls das auch bei Ihnen der Fall ist: Gerne zeigen wir Ihnen unverbindlich, welche Pflegekräfte gerade verfügbar wären &ndash; damit Sie besser vergleichen können und die beste Lösung für Ihre Betreuungssituation finden. Ein Vertrag entsteht erst, wenn Sie wirklich jemanden gefunden haben.</p>
    ${bulletproofButton(portalUrl, "Aktuelle Pflegekräfte ansehen&nbsp;&nbsp;&rarr;", "#2A9D5C")}
    <p style="font-size:13px;line-height:1.6;color:#888;margin:18px 0 0;">PS: Klappt im Portal etwas nicht, oder möchten Sie das lieber persönlich klären? Sie erreichen mich unter <a href="tel:+4989200000830" style="color:#8B7355;text-decoration:none;">089&nbsp;200&nbsp;000&nbsp;830</a> oder per <a href="https://wa.me/4989200000830" style="color:#8B7355;text-decoration:none;">WhatsApp</a>.</p>
    ${buildMartaSig(siteUrl)}`;
  return buildEmailWrapper(lead, siteUrl, content);
}

function buildReaktivierungWechselText(lead: Lead, siteUrl: string, portalBase: string): string {
  const portalUrl = (portalBase && lead.token) ? buildPortalUrl(portalBase, lead.token) : siteUrl;
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  return `${halloAnrede},

vielleicht haben Sie längst eine Betreuung gefunden — dann wünsche ich Ihnen alles Gute damit. Ich melde mich, weil bei vielen Familien nach einiger Zeit ein Wechsel der Pflegekraft ansteht. Falls das auch bei Ihnen der Fall ist: Gerne zeigen wir Ihnen unverbindlich, welche Pflegekräfte gerade verfügbar wären — damit Sie besser vergleichen können und die beste Lösung für Ihre Betreuungssituation finden. Ein Vertrag entsteht erst, wenn Sie wirklich jemanden gefunden haben.

Aktuelle Pflegekräfte ansehen: ${portalUrl}

PS: Klappt im Portal etwas nicht, oder möchten Sie das lieber persönlich klären? Sie erreichen mich unter 089 200 000 830 oder per WhatsApp (https://wa.me/4989200000830).

Mit freundlichen Grüßen
Marta Kapcio

---
Primundus Deutschland | +49 89 200 000 830 | www.primundus.de`;
}


function buildEingangsGreeting(lead: Lead): string {
  const detectedAnrede = lead.anrede_text || detectGenderFromName(lead.vorname || "");
  const n = capitalize(cleanNamePart(lead.nachname));
  if (detectedAnrede === "Frau" && n) return `Guten Tag Frau ${n}`;
  if (detectedAnrede === "Herr" && n) return `Guten Tag Herr ${n}`;
  if (detectedAnrede === "Familie" && n) return `Guten Tag Familie ${n}`;
  // KEIN Vorname-Fallback (Martin 2026-08).
  // Salutation unknown → neutral fallback (no name).
  return "Guten Tag";
}

// Re-Submit-Erkennung: wenn der Kunde das Wizard-Formular ein zweites Mal
// abschickt, bekommt er die "Eingangsbestätigung" nochmal — angebot-anfordern
// hat keinen Dedupe-Check und schedult immer. Statt die zweite Mail zu
// unterdrücken (würde Kunden verwirren falls sie wirklich was geändert haben),
// passen wir Subject + Intro an, damit er versteht: "Sie haben uns das nochmal
// geschickt, hier Ihre aktualisierten Angaben".
async function hasPreviousEingangsbestaetigungSent(supabase: any, leadId: string): Promise<boolean> {
  const { data } = await supabase
    .from("lead_events")
    .select("event_type")
    .eq("lead_id", leadId)
    .eq("event_type", "email_eingangsbestaetigung_sent")
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}


// ---------------------------------------------------------------------------
// Domain-Tippfehler-Schutz
// ---------------------------------------------------------------------------
// Kunden vertippen sich in ihrer eigenen E-Mail-Domain (z. B. "t-onlne.de"
// statt "t-online.de"). Solche Mails bouncen still — der Kunde wartet, wir
// merken nichts. Vor dem Versand prüfen wir die Empfänger-Domain gegen gängige
// Provider und flaggen offensichtliche Tippfehler statt blind zu senden.
//
// WICHTIG: Unbekannte, aber valide Firmen-/Uni-Domains (cavacom.biz,
// hsx-stahl.de, alumni.uni-heidelberg.de) dürfen NICHT geflaggt werden. Darum
// flaggen wir nur, wenn die Domain genau 1 Zeichen neben einem gängigen
// Provider liegt ODER in der bekannten-Tippfehler-Liste steht. Firmen-Domains
// sind von allen Providern weit entfernt → bleiben unangetastet.
const COMMON_EMAIL_DOMAINS = [
  "t-online.de", "gmail.com", "googlemail.com", "web.de", "gmx.de", "gmx.net",
  "gmx.at", "gmx.ch", "yahoo.de", "yahoo.com", "hotmail.de", "hotmail.com",
  "outlook.de", "outlook.com", "live.de", "live.com", "freenet.de", "aol.com",
  "icloud.com", "me.com", "mail.de", "arcor.de",
];

// Eindeutige Tippfehler, die die Distanz-1-Heuristik nicht erwischt
// (v. a. Buchstabendreher = Levenshtein-Distanz 2).
const KNOWN_DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gnail.com": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "yahho.de": "yahoo.de",
  "freent.de": "freenet.de",
  "t-onine.de": "t-online.de",
  // .ed/.de-Buchstabendreher (Levenshtein-Distanz 2, daher explizit):
  "gmx.ed": "gmx.de",
  "web.ed": "web.de",
  "t-online.ed": "t-online.de",
  "freenet.ed": "freenet.de",
};

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function detectEmailDomainTypo(
  email: string,
): { suspicious: boolean; suggestion?: string; reason?: string } {
  const at = (email ?? "").lastIndexOf("@");
  if (at < 0) return { suspicious: true, reason: "keine gültige Adresse (kein @)" };
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain || !domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
    return { suspicious: true, reason: "ungültige Domain" };
  }
  // Exakt gängig → in Ordnung.
  if (COMMON_EMAIL_DOMAINS.includes(domain)) return { suspicious: false };
  // Bekannter Tippfehler?
  const known = KNOWN_DOMAIN_TYPOS[domain];
  if (known) return { suspicious: true, suggestion: known, reason: "bekannter Tippfehler" };
  // Genau 1 Zeichen neben einem gängigen Provider → sehr wahrscheinlich Tippfehler.
  for (const good of COMMON_EMAIL_DOMAINS) {
    if (levenshtein(domain, good) === 1) {
      return { suspicious: true, suggestion: good, reason: "1 Zeichen daneben" };
    }
  }
  return { suspicious: false };
}

async function sendEmailSmtp(
  smtpConfig: SmtpConfig,
  to: string,
  subject: string,
  html: string,
  text: string,
  attachments?: { filename: string; content: Uint8Array; contentType: string; cid?: string }[],
  skipBcc: boolean = false,
  cc?: string,
  /* Threading. BEWUSST als neunter POSITIONS-Parameter statt eines
     Options-Objekts: `cc` ist heute der letzte Parameter und wird an einer
     Stelle positionsweise durchgereicht (`undefined, false, ccListe(...)`)
     — ein Umbau auf ein Objekt haette genau dort das CC verloren. */
  opts?: { inReplyTo?: string | null; references?: string | string[] | null },
): Promise<{ success: boolean; error?: string }> {
  try {
    const transport = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: false,
      // Mandate the STARTTLS upgrade on the submission port. Amazon SES
      // rejects any plaintext session, and we never want to silently send
      // credentials in the clear — requireTLS makes a failed upgrade error
      // out instead. Harmless for Ionos (its 587 speaks STARTTLS too).
      requireTLS: true,
      tls: { minVersion: "TLSv1.2" },
      // Bound the handshake/send so a choking provider fails fast and
      // visibly instead of hanging the cron run.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
      },
    });

    // Optional BCC for ops visibility — mirrors project 3/lib/email.ts.
    // Default info@primundus.de + info@mamamia.app; disable by setting
    // SMTP_BCC= (empty). Comma-separated for multiple.
    const bccRaw = Deno.env.get("SMTP_BCC") ?? "info@primundus.de,info@mamamia.app";
    const bccAddr = bccRaw.trim();

    const mailOptions: any = {
      from: `"${smtpConfig.fromName}" <${smtpConfig.from}>`,
      to,
      subject,
      // Reply-To auf ein überwachtes Team-Postfach — die Reminder bitten den
      // Kunden ausdrücklich, "einfach auf diese E-Mail zu antworten". Ohne
      // Reply-To gingen Antworten an die (ggf. unüberwachte) Absenderadresse.
      replyTo: "info@primundus.de",
      text,
      html,
      ...(!skipBcc && bccAddr ? { bcc: bccAddr } : {}),
      ...(cc ? { cc } : {}),
      /* nodemailer setzt daraus In-Reply-To und References — damit die
         Antwort im Postfach des Vermittlers in SEINEM Faden landet. */
      ...(opts?.inReplyTo ? { inReplyTo: opts.inReplyTo } : {}),
      ...(opts?.references ? { references: opts.references } : {}),
    };

    if (attachments && attachments.length > 0) {
      // `cid` mitschicken — nodemailer rendert das Attachment dann als
      // Inline-Bild für <img src="cid:xxx"> im HTML (siehe Reminder-Foto).
      mailOptions.attachments = attachments.map((att) => ({
        filename: att.filename,
        content: Buffer.from(att.content),
        contentType: att.contentType,
        ...(att.cid ? { cid: att.cid } : {}),
      }));
    }

    await new Promise<void>((resolve, reject) => {
      transport.sendMail(mailOptions, (error: any) => {
        if (error) return reject(error);
        resolve();
      });
    });

    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
}

// Sammel-Alarm ans Team, wenn in einem Lauf Mails fehlschlugen. Bewusst EINE
// Mail pro Lauf (nicht pro Fehlschlag) — bei einem systemischen Fehler (z. B.
// "Buffer is not defined" über alle Reminder) sonst hunderte Alarme. Ohne
// Anhang (kann den Attachment-/Buffer-Pfad nicht selbst auslösen) und in
// try/catch gekapselt: ein fehlschlagender Alarm darf den Cron nie umwerfen
// und löst keinen weiteren Alarm aus. Ziel via OPS_ALERT_TO überschreibbar.
async function notifyOpsOfFailures(
  smtpConfig: SmtpConfig,
  failures: { emailType: string; recipient: string; leadId: string; error: string }[],
): Promise<void> {
  if (failures.length === 0) return;
  try {
    const to = Deno.env.get("OPS_ALERT_TO") ?? "info@primundus.de";
    // Nach Fehlertyp aggregieren — Massenfehler auf einen Blick.
    const byError = new Map<string, number>();
    for (const f of failures) byError.set(f.error, (byError.get(f.error) ?? 0) + 1);
    const errorSummary = [...byError.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([e, n]) => `${n}× ${e}`)
      .join("\n");

    const MAX = 50;
    const shown = failures.slice(0, MAX);
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rowsHtml = shown.map((f) =>
      `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;">${esc(f.emailType)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;">${esc(f.recipient)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;color:#b00;">${esc(f.error)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:11px;color:#888;">${esc(f.leadId)}</td>
      </tr>`).join("");
    const moreHtml = failures.length > MAX
      ? `<p style="font-size:12px;color:#888;">… und ${failures.length - MAX} weitere.</p>` : "";

    const subject = `⚠️ ${failures.length} Mail(s) fehlgeschlagen — Primundus Portal`;
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#222;">
      <p style="font-size:15px;">Beim automatischen Mailversand sind <strong>${failures.length}</strong> Mail(s) fehlgeschlagen (letzter Lauf).</p>
      <p style="font-size:13px;color:#555;white-space:pre-line;background:#faf6f6;border:1px solid #f0d9d9;border-radius:8px;padding:10px 12px;">${esc(errorSummary)}</p>
      <table style="border-collapse:collapse;width:100%;margin-top:8px;">
        <tr style="text-align:left;background:#f6f6f6;">
          <th style="padding:6px 10px;font-size:12px;">Typ</th>
          <th style="padding:6px 10px;font-size:12px;">Empfänger</th>
          <th style="padding:6px 10px;font-size:12px;">Fehler</th>
          <th style="padding:6px 10px;font-size:12px;">Lead-ID</th>
        </tr>
        ${rowsHtml}
      </table>
      ${moreHtml}
      <p style="font-size:11px;color:#999;margin-top:14px;">Automatische Meldung aus send-scheduled-emails. Betroffene Zeilen stehen in scheduled_emails auf status=failed.</p>
    </div>`;
    const text = `${failures.length} Mail(s) fehlgeschlagen (letzter Lauf).\n\nNach Fehlertyp:\n${errorSummary}\n\nDetails:\n` +
      shown.map((f) => `- ${f.emailType} -> ${f.recipient}: ${f.error} (lead ${f.leadId})`).join("\n") +
      (failures.length > MAX ? `\n… und ${failures.length - MAX} weitere.` : "");

    await sendEmailSmtp(smtpConfig, to, subject, html, text);
  } catch (e) {
    console.error("[ops-alert] Fehler-Benachrichtigung konnte nicht gesendet werden:", e instanceof Error ? e.message : String(e));
  }
}

// Reaktions-Reminder-Helpers (für interest_reminder / application_reminder).
// Logik: nach 1h kontrollieren ob der Kunde auf den ursprünglichen
// caregiver_interest_shown / application_received reagiert hat (Reaktion =
// invite/decline für Interesse, accept/reject für Bewerbung). Wenn ja →
// Reminder cancelt sich selbst. Wenn nein → Mail raus.

async function hasReactionForCaregiver(
  supabase: any,
  leadId: string,
  reminderType: "interest_reminder" | "application_reminder",
  caregiverId: number | string,
): Promise<boolean> {
  const positiveEvent = reminderType === "interest_reminder"
    ? "caregiver_invited"
    : "application_accepted_internal";
  const negativeEvent = reminderType === "interest_reminder"
    ? "caregiver_declined"
    : "application_rejected";
  // PostgREST kann jsonb-Felder mit ->> filtern. caregiver_id ist als Number
  // im Metadata gespeichert; Vergleich als String passt.
  const cgIdStr = String(caregiverId);
  const { data, error } = await supabase
    .from("lead_events")
    .select("id, event_type")
    .eq("lead_id", leadId)
    .in("event_type", [positiveEvent, negativeEvent])
    .filter("metadata->>caregiver_id", "eq", cgIdStr)
    .limit(1);
  if (error) {
    console.error(`hasReactionForCaregiver query failed (${reminderType}, lead ${leadId}, cg ${cgIdStr}):`, error.message);
    // Im Zweifel skip senden — Reminder nicht doppelt rauspusten.
    return true;
  }
  return Array.isArray(data) && data.length > 0;
}

/** Fünf-Liste für die Nudge-Mail — von Versand UND Testversand benutzt.
 *  Ohne diesen gemeinsamen Weg rendert der Demo-Pfad etwas anderes als der
 *  Kunde bekommt; genau das passierte am 03.09.2026 beim ersten Testversand
 *  (alter Betreff in der Testmail, neue Mail beim Kunden). Schreibt NICHTS —
 *  der lead_events-Eintrag bleibt beim Versand. */
async function fuenfFuerNudge(
  lead: Lead, portalBase: string, supabaseUrl: string, key: string, darfOnboarden: boolean,
): Promise<{
  html: string; text: string; anzahl: number; vornamen: string[];
  anhaenge: { filename: string; content: Uint8Array; contentType: string; cid: string }[];
  caregiverIds: number[];
} | null> {
  const tok = lead.token;
  if (!tok) return null;
  const erg = await holeFuenf({
    supabaseUrl, key, token: tok,
    jobOfferId: (lead as unknown as Record<string, unknown>).mamamia_job_offer_id as number ?? null,
    formularDaten: (lead as unknown as Record<string, { formularDaten?: unknown }>).kalkulation?.formularDaten as never ?? {},
    darfOnboarden,
  });
  if (!erg || erg.fuenf.length === 0) return null;
  const basisUrl = buildPortalUrl(portalBase, tok);
  // Fotos mit Budget: die oberen zuerst, was nicht passt → Initialen.
  const roh = await Promise.all(erg.fuenf.map((e) => fetchInlinePhotoDeno(e.fotoUrl)));
  const darf = fotoBudget(roh.map((r) => r?.content.length ?? null));
  const inlines = roh.map((r, i) => (r && darf[i]) ? r : null);
  const profilUrls = erg.fuenf.map((e) => withMailMark(`${basisUrl}&cg=${e.caregiverId}`, "pn1"));
  const alleUrl = withMailMark(buildPortalUrl(portalBase, tok, "matches"), "pn1");
  return {
    html: fuenfListeHtml(erg.fuenf, inlines.map((r) => r?.cid ?? null), profilUrls, alleUrl, "Passend zu Ihrer Anfrage"),
    text: fuenfListeText(erg.fuenf, profilUrls, alleUrl).replace("FÜR SIE VORBEREITET", "PASSEND ZU IHRER ANFRAGE"),
    anzahl: erg.fuenf.length,
    vornamen: erg.fuenf.map((e) => e.vorname),
    anhaenge: inlines.filter((r): r is NonNullable<typeof r> => r !== null),
    caregiverIds: erg.fuenf.map((e) => e.caregiverId),
  };
}

/** Zeile abbrechen + Grund loggen (email_<typ>_cancelled). */
async function zeileAbbrechen(
  supabase: any, row: ScheduledEmail, grund: string, extra: Record<string, unknown> = {},
): Promise<void> {
  await supabase
    .from("scheduled_emails")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", row.id);
  await supabase.from("lead_events").insert({
    lead_id: row.lead_id,
    event_type: `email_${row.email_type}_cancelled`,
    metadata: { reason: grund, ...extra },
  });
}

type InlineFoto = { filename: string; content: Uint8Array; contentType: string; cid: string };

/** Empfehlung für die Angebotsmail — Versand UND Testversand gehen denselben Weg (wie
 *  fuenfFuerNudge). Schreibt nichts; der lead_events-Eintrag bleibt beim Versand. */
async function empfehlungFuerAngebot(
  lead: Lead, supabaseUrl: string, key: string, darfOnboarden: boolean,
): Promise<{ erg: EmpfehlungErgebnis; inline: InlineFoto | null } | null> {
  if (!lead.token) return null;
  const erg = await holeEmpfehlung({
    supabaseUrl, key, token: lead.token,
    jobOfferId: ((lead as unknown as Record<string, unknown>).mamamia_job_offer_id as number | null) ?? null,
    formularDaten: (lead.kalkulation?.formularDaten ?? {}) as never,
    darfOnboarden,
  });
  if (!erg) return null;
  return { erg, inline: await fetchInlinePhotoDeno(erg.empfehlung.fotoUrl) };
}

/** Eingaben der Angebotsmail aus dem Lead. */
function angebotEingabe(
  lead: Lead, resubmit: boolean, empf: { erg: EmpfehlungErgebnis; inline: InlineFoto | null } | null,
): AngebotEingabe {
  const herkunft = portalHerkunft(lead.source);
  /* Welche Felder WIR gesetzt haben, legt api/portal-lead in der Kalkulation ab. Fehlt die
     Liste (Altbestand), gilt der vorsichtigere Text. */
  const felder = (lead.kalkulation as Record<string, unknown> | null)?.angenommene_felder;
  const angenommen = !Array.isArray(felder) || felder.length > 0;
  return {
    kalkulation: lead.kalkulation,
    careStartTiming: ((lead as unknown as Record<string, unknown>).care_start_timing as string | null) ?? null,
    herkunft,
    portalBetreff: PORTAL_BETREFF,
    angabenHinweis: herkunft
      ? { html: portalAngabenHinweisHtml(herkunft, angenommen), text: portalAngabenHinweisText(herkunft, angenommen) }
      : null,
    resubmit,
    empfehlung: empf ? { e: empf.erg.empfehlung, cid: empf.inline?.cid ?? null, sichtbar: empf.erg.sichtbarGesamt } : null,
  };
}

/** „15.10.2026" aus einem mamamia-Datum („2026-10-15" / „2026-10-15 00:00:00"); sonst null. */
function datumDe(wert: unknown): string | null {
  const m = typeof wert === "string" ? wert.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : null;
}

/** Konditionen einer Bewerbung wie die Portal-Karte (AppCard): Tagessatz = Monat / 30. */
function angebotAus(m: Record<string, unknown> | null | undefined): BewerbungsAngebot {
  const monat = Number(m?.offer_salary);
  const an = datumDe(m?.offer_arrival_at);
  const ab = datumDe(m?.offer_departure_at);
  const fahrt = m?.offer_arrival_fee == null ? NaN : Number(m.offer_arrival_fee);
  return {
    tagessatz: Number.isFinite(monat) && monat > 0 ? Math.round(monat / 30) : null,
    zeitraum: an && ab ? `${an} – ${ab}` : an ? `ab ${an}` : null,
    reisekosten: Number.isFinite(fahrt) ? fahrt : null,
  };
}

/** Lage einer Bewerbung für die Erinnerung: Eingänge (Anker der Reservierung, ohne `seeded`,
 *  Job wie src/lib/reservierung.ts), Konditionen aus dem neuesten Eingang, letzte Mail dazu
 *  (Eingang = Mail B, oder gesendete Erinnerung) und ob die letzte Erinnerung schon raus ist. */
async function bewerbungsLage(
  supabase: any, leadId: string, caregiverId: number | string, jobId: number | null, standardJobId: number | null,
): Promise<{ eingaengeMs: number[]; angebot: BewerbungsAngebot; letzteMailMs: number | null; letzteGesendet: boolean }> {
  const cg = String(caregiverId);
  const { data: evts } = await supabase
    .from("lead_events")
    .select("created_at, metadata")
    .eq("lead_id", leadId)
    .eq("event_type", "application_received")
    .filter("metadata->>caregiver_id", "eq", cg);
  const zumPaar = ((evts ?? []) as { created_at: string; metadata?: Record<string, unknown> | null }[])
    .filter((e) => {
      const m = e.metadata ?? {};
      if (m.seeded === true) return false;
      const job = (m.mamamia_job_offer_id as number | null | undefined) ?? standardJobId;
      return jobId == null || job == null || Number(job) === Number(jobId);
    })
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const eingaengeMs = zumPaar.map((e) => Date.parse(e.created_at)).filter((ms) => Number.isFinite(ms));
  const { data: gesendet } = await supabase
    .from("scheduled_emails")
    .select("email_type, sent_at")
    .eq("lead_id", leadId)
    .eq("status", "sent")
    .in("email_type", [...ERINNERUNG_TYPEN])
    .filter("metadata->>caregiver_id", "eq", cg);
  const zeilen = (gesendet ?? []) as { email_type: string; sent_at: string | null }[];
  const alle = [...eingaengeMs, ...zeilen.map((z) => Date.parse(z.sent_at ?? "")).filter((ms) => Number.isFinite(ms))];
  return {
    eingaengeMs,
    angebot: angebotAus(zumPaar[zumPaar.length - 1]?.metadata),
    letzteMailMs: alle.length ? Math.max(...alle) : null,
    letzteGesendet: zeilen.some((z) => erinnerungStufe(z.email_type) === "letzte"),
  };
}

async function fetchInlinePhotoDeno(
  url: string | null | undefined,
): Promise<{ filename: string; content: Uint8Array; contentType: string; cid: string } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.warn(`fetchInlinePhotoDeno: HTTP ${res.status} for ${url.slice(0, 80)}…`);
      return null;
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("image/")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 5 * 1024 * 1024) return null;
    const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
    const cid = `caregiver-photo-${Math.random().toString(36).slice(2, 10)}@primundus.de`;
    return { filename: `caregiver.${ext}`, content: buf, contentType: ct, cid };
  } catch (e) {
    console.warn("fetchInlinePhotoDeno error:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

interface ReminderMeta {
  caregiver_id?: number | string;
  caregiver_name?: string;
  caregiver_badge_level?: string | null;
  caregiver_years_experience?: number | null;
  caregiver_einsatz_count?: number | null;
  caregiver_age?: number | null;
  // Rohwert aus mamamia (level_0…level_4) — QUELLE, hat Vorrang.
  caregiver_germany_skill?: string | null;
  // Vom Erzeuger abgeleitetes Wort — Rückfall für Altzeilen ohne Rohwert.
  caregiver_german_level?: string | null;
  caregiver_photo_url?: string | null;
  caregiver_about_text?: string | null;
  // Multi-Job (Bug #25): Job, zu dem dieser Reminder gehört. Reminder eines
  // AKTUELL geplanten Jobs überleben den lead-weiten "beauftragt"-Cancel
  // (die alte Buchung betraf einen ANDEREN Einsatz).
  mamamia_job_offer_id?: number | null;
}

function reminderCaregiverInitials(name: string): string {
  const parts = (name || "?").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Erfahrungsstufe — WORTGLEICH zu Portal/SA-Portal und zu lib/email.ts
// (caregiverTierLabel). Basis: nur UNSERE Einsätze (caregiver_einsatz_count =
// hp_total_jobs). Elite ≥12 / Stammkraft ≥6 / Bewährt ≥2 / Bekannt ≥1 / sonst
// Berufserfahren (Jahre>0) bzw. Neu bei Primundus. Kein Medaillen-Badge mehr — die
// Stufe steht als fettes Wort vor der Faktenzeile.
function reminderTierLabel(einsatzCount?: number | null, yearsExperience?: number | null): string {
  // Eine einzige Definition der Stufen-Woerter fuer die ganze Datei — die
  // Schwellen leben in empfehlung.ts (stufenWort), damit Empfehlung und
  // Reminder nicht auseinanderlaufen koennen.
  return stufenWort(einsatzCount, yearsExperience);
}

// Faktenzeile wie im Portal/in lib/email.ts (caregiverFactsLine): Jahre
// Erfahrung · Einsätze. Ist nichts da, ehrlicher Ersatzsatz.
function reminderFactsLine(meta: ReminderMeta): string {
  const teile: string[] = [];
  if (meta.caregiver_years_experience && meta.caregiver_years_experience > 0) {
    teile.push(`${meta.caregiver_years_experience} ${meta.caregiver_years_experience === 1 ? "Jahr" : "Jahre"} Erfahrung`);
  }
  if (meta.caregiver_einsatz_count && meta.caregiver_einsatz_count > 0) {
    teile.push(`${meta.caregiver_einsatz_count} ${meta.caregiver_einsatz_count === 1 ? "Einsatz" : "Einsätze"}`);
  }
  return teile.length > 0 ? teile.join(" &middot; ") : "bereit für den ersten Einsatz";
}

// Reminder-Tier — application-Reminder eskalieren in 3 Stufen (1h/4h/12h),
// interest bleibt 1-stufig. Tier steuert Intro-Wording, CTA-Text und ob
// ein prominenter "Schnell Bescheid geben"-Block (WhatsApp + Phone)
// eingeblendet wird.
type ReminderTier = "1h" | "4h" | "12h" | "70h";

// Reminder-Mail-HTML. Beide Varianten (interest / application) teilen sich
// dasselbe Layout — nur Subject, Intro, Action-Satz + CTA-Text unterscheiden
// sich. Ab Tier "4h" kommt ein prominenter Quick-Action-Block oben drauf
// damit der Kunde auch ohne Portal-Besuch per WhatsApp/Anruf "passt nicht"
// signalisieren kann (reduziert Entscheidungs-Paralyse).
// Visual matched mit Mail A/B (buildCaregiverEventEmail), damit die Reihe
// optisch zusammengehört.
function buildReminderHtml(
  lead: Lead,
  meta: ReminderMeta,
  portalUrl: string,
  siteUrl: string,
  variant: "interest" | "application",
  photoCid: string | null,
  tier: ReminderTier = "1h",
): string {
  const greeting = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  const cgName = meta.caregiver_name || "Ihre Pflegekraft";
  const firstName = cgName.split(/\s+/)[0] || cgName;

  // Einheitliche Pflegekraft-Box — identisch zu Mail A/B/C
  // (lib/email.ts caregiverKachelHtml): abgerundetes Quadrat-Foto, Name +
  // Alter, Deutsch-Level, Stufe als fettes Wort + Faktenzeile, „Profil
  // ansehen". BEIDE Varianten (application/interest) zeigen jetzt dieselbe
  // Karte, damit die ganze Mail-Reihe optisch UND inhaltlich zusammenpasst
  // (Martin, 18.08.: „alle mails gleiche infos und optik mit bild").
  const stufe = reminderTierLabel(meta.caregiver_einsatz_count, meta.caregiver_years_experience);
  const factsHtml = `<p style="margin:16px 0 0;font-size:15px;line-height:1.5;color:#71717A;"><span style="font-weight:700;color:#18181B;">${stufe}:</span> ${reminderFactsLine(meta)}</p>`;
  const ageSuffix = meta.caregiver_age && meta.caregiver_age > 0
    ? `<span style="font-weight:400;color:#71717A;">, ${meta.caregiver_age}</span>`
    : "";
  const deutschWort = deutschStufe(meta.caregiver_germany_skill, meta.caregiver_german_level);
  const deutschLine = deutschWort
    ? `<p style="margin:0;font-size:15px;color:#71717A;">Deutsch ${deutschWort}</p>`
    : "";

  // Nur Inline-CID nutzen — der presigned S3-URL ist nach 30 Min meist tot,
  // daher bei fehlgeschlagenem Inline-Fetch direkt auf Initialen-Avatar
  // ausweichen statt eine kaputte Bild-Ref im HTML zu lassen.
  const photoHtml = photoCid
    ? `<img src="cid:${photoCid}" alt="${cgName}" width="76" style="display:block;width:76px;height:76px;border-radius:12px;object-fit:cover;" />`
    : `<div style="width:76px;height:76px;border-radius:12px;background-color:#B5A184;color:#fff;font-size:26px;font-weight:700;line-height:76px;text-align:center;">${reminderCaregiverInitials(cgName)}</div>`;

  const profilFooter = `<div style="border-top:1px solid #ECE7DF;margin:14px 0 0;padding-top:14px;"><a href="${portalUrl}" target="_blank" style="color:#8B7355;text-decoration:none;font-weight:700;font-size:15px;">${firstName}s Profil ansehen &rarr;</a></div>`;

  // Abstand Foto→Text als EIGENE Spalte, nicht als padding-right an der
  // Foto-Zelle: mehrere Mail-Renderer verwerfen padding an einer <td>, die
  // zugleich eine feste width traegt — dann klebt der Name am Bild (Martin
  // 18.08. mit Screenshot: "viel zu eng name und bild", gemessener Abstand
  // ~1 px statt 16). In Chrome war das NICHT reproduzierbar, das Padding
  // greift dort; die leere Spalte kommt ganz ohne padding-Unterstuetzung aus
  // und ist damit unabhaengig vom Client. Text mittig statt oben, sonst
  // haengen zwei kurze Zeilen an der Oberkante eines 76-px-Fotos.
  const kachel = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 22px 0;border:1px solid #ECE7DF;border-radius:14px;background:#ffffff;overflow:hidden;">
      <tr><td style="padding:18px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td width="76" style="vertical-align:middle;width:76px;">${photoHtml}</td>
            <td width="18" style="width:18px;font-size:0;line-height:0;">&nbsp;</td>
            <td style="vertical-align:middle;">
              <p style="margin:0 0 3px;font-size:18px;font-weight:700;color:#18181B;line-height:1.3;">${cgName}${ageSuffix}</p>
              ${deutschLine}
            </td>
          </tr>
        </table>
        ${factsHtml}
        ${profilFooter}
      </td></tr>
    </table>`;

  // Persönlicher, positiver Ton — eine echte Frage statt Füllsatz, kein
  // "Kundenportal"-Wording (der CTA-Button führt direkt hin), keine
  // Drohkulisse. Application eskaliert sanft über die Stufen.
  let introHtml: string;
  let middleHtml: string;
  let ctaText: string;
  if (variant === "interest") {
    introHtml = `<p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:18px;">vorhin haben wir Ihnen geschrieben, dass <strong style="color:#2D1F0F;">${cgName}</strong> gern für Sie da wäre.</p>`;
    middleHtml = `<p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:20px;">Schauen Sie sich ihr Profil in Ruhe im Portal an — wenn ${firstName} Ihnen zusagt, laden Sie sie mit einem Klick ein, sich bei Ihnen zu bewerben. Und wenn nicht, ist das auch völlig okay: Ein kurzes Nein hilft ${firstName} mehr als Warten.</p>`;
    ctaText = "Profil ansehen und einladen →";
  } else if (tier === "1h") {
    introHtml = `<p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:18px;">konnten Sie sich schon mit <strong style="color:#2D1F0F;">${firstName}s Bewerbung</strong> beschäftigen?</p>`;
    middleHtml = `<p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:20px;">Im Portal können Sie ${firstName} mit einem Klick zu- oder absagen — und falls sie nicht passt, schlage ich Ihnen gern jemand anderen vor.</p>`;
    ctaText = `${firstName}s Bewerbung ansehen →`;
  } else if (tier === "4h") {
    introHtml = `<p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:18px;">falls Sie noch unsicher sind: Im Portal finden Sie <strong style="color:#2D1F0F;">${firstName}s vollständiges Profil</strong> mit allen Konditionen — von den Kosten bis zum Anreisetermin.</p>`;
    middleHtml = `<p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:20px;">Ein Klick auf Zusagen oder Absagen genügt.</p>`;
    ctaText = `${firstName}s Bewerbung ansehen →`;
  } else if (tier === "12h") {
    introHtml = `<p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:18px;">ich wollte einmal nachhören, wie Ihnen <strong style="color:#2D1F0F;">${firstName}s Bewerbung</strong> gefällt.</p>`;
    middleHtml = `<p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:20px;">Vielleicht hatten Sie noch keine ruhige Minute — das ist völlig in Ordnung. Ein Klick im Portal genügt, Ja oder Nein — alles Weitere übernehme ich.</p>`;
    ctaText = `${firstName}s Bewerbung ansehen →`;
  } else {
    // tier === "70h" — letzte Erinnerung vor dem automatischen Freigeben
    // (~2h später durch den Auto-Reject). Positiv gerahmt: Barbara nicht
    // unnötig warten lassen; weitere Vorschläge nur auf Wunsch.
    introHtml = `<p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:18px;">passt <strong style="color:#2D1F0F;">${firstName}</strong> zu Ihnen?</p>`;
    middleHtml = `<p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:20px;">Sagen Sie ihr im Portal kurz zu oder ab. Wenn ich nichts von Ihnen höre, gebe ich ${firstName} in den nächsten Stunden wieder frei, damit sie nicht unnötig wartet. Und wenn Sie lieber andere Vorschläge möchten, melden Sie sich einfach kurz — ich kümmere mich.</p>`;
    ctaText = `${firstName}s Bewerbung ansehen →`;
  }

  // Interest behält den dezenten Soft-Out unter dem CTA. Application
  // braucht ihn nicht mehr — der "passt nicht?"-Hinweis steckt jetzt
  // direkt in middleHtml ("an- oder ablehnen / auf diese Mail antworten").
  // Marta als Rettungsanker in ALLEN Mails (Martin, 20.07.): Portal ist der
  // Hauptweg, der PS-Hinweis der persönliche Fallback.
  const softOut = `<p style="font-size:13px;line-height:1.6;color:#888;margin:18px 0 0;">PS: Klappt im Portal etwas nicht, oder möchten Sie das lieber persönlich klären? Sie erreichen mich unter <a href="tel:+4989200000830" style="color:#8B7355;text-decoration:none;">089&nbsp;200&nbsp;000&nbsp;830</a> oder per <a href="https://wa.me/4989200000830" style="color:#8B7355;text-decoration:none;">WhatsApp</a>.</p>`;

  // Aufbau wie eine persönliche Nachricht: Begrüßung → kurze Situation →
  // kompakte Pflegekraft-Box (mit "Profil ansehen"-Button) → freundliche
  // Bitte → Marta-Signatur (enthält WhatsApp + Telefon).
  // application: kein extra CTA-Button (der Button steckt in der Box).
  // interest: behält seinen CTA-Button + Soft-Out.
  const ctaButton = variant === "application" ? "" : bulletproofButton(portalUrl, ctaText);
  const content = `
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${greeting},</p>
    ${introHtml}
    ${kachel}
    ${middleHtml}
    ${ctaButton}
    ${softOut}
    ${buildMartaSig(siteUrl)}`;

  return buildEmailWrapper(lead, siteUrl, content);
}

function buildReminderText(
  lead: Lead,
  meta: ReminderMeta,
  portalUrl: string,
  variant: "interest" | "application",
  tier: ReminderTier = "1h",
): string {
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  const cgName = meta.caregiver_name || "Ihre Pflegekraft";
  const firstName = cgName.split(/\s+/)[0] || cgName;

  if (variant === "interest") {
    return `${halloAnrede},

vorhin haben wir Ihnen geschrieben, dass ${cgName} gern für Sie da wäre.

Schauen Sie sich ihr Profil in Ruhe im Portal an — wenn ${firstName} Ihnen zusagt, laden Sie sie mit einem Klick ein, sich bei Ihnen zu bewerben. Und wenn nicht, ist das auch völlig okay: Ein kurzes Nein hilft ${firstName} mehr als Warten.

Profil ansehen und einladen: ${portalUrl}

PS: Klappt im Portal etwas nicht, oder möchten Sie das lieber persönlich klären? Sie erreichen mich unter 089 200 000 830 oder per WhatsApp (https://wa.me/4989200000830).

Mit freundlichen Grüßen
Marta Kapcio — Pflegeberaterin
Tel: 089 200 000 830  ·  WhatsApp: https://wa.me/4989200000830

Primundus Deutschland | www.primundus.de
`;
  }

  // Application-Variante in 4 Tiers — persönlicher, positiver Ton, kein
  // "Kundenportal"-Wording (der Link führt direkt hin), keine Drohkulisse.
  let intro: string;
  let body: string;
  if (tier === "1h") {
    intro = `konnten Sie sich schon mit ${firstName}s Bewerbung beschäftigen?`;
    body = `Im Portal können Sie ${firstName} mit einem Klick zu- oder absagen — und falls sie nicht passt, schlage ich Ihnen gern jemand anderen vor.`;
  } else if (tier === "4h") {
    intro = `falls Sie noch unsicher sind: Im Portal finden Sie ${firstName}s vollständiges Profil mit allen Konditionen — von den Kosten bis zum Anreisetermin.`;
    body = `Ein Klick auf Zusagen oder Absagen genügt.`;
  } else if (tier === "12h") {
    intro = `ich wollte einmal nachhören, wie Ihnen ${firstName}s Bewerbung gefällt.`;
    body = `Vielleicht hatten Sie noch keine ruhige Minute — das ist völlig in Ordnung. Ein Klick im Portal genügt, Ja oder Nein — alles Weitere übernehme ich.`;
  } else {
    // tier === "70h" — letzte Erinnerung; weitere Vorschläge nur auf Wunsch.
    intro = `passt ${firstName} zu Ihnen?`;
    body = `Sagen Sie ihr im Portal kurz zu oder ab. Wenn ich nichts von Ihnen höre, gebe ich ${firstName} in den nächsten Stunden wieder frei, damit sie nicht unnötig wartet. Und wenn Sie lieber andere Vorschläge möchten, melden Sie sich einfach kurz — ich kümmere mich.`;
  }

  const agePart = meta.caregiver_age && meta.caregiver_age > 0 ? `, ${meta.caregiver_age}` : "";
  const deutschStufeText = deutschStufe(meta.caregiver_germany_skill, meta.caregiver_german_level);
  const deutschPart = deutschStufeText ? ` · Deutsch ${deutschStufeText}` : "";
  const stufe = reminderTierLabel(meta.caregiver_einsatz_count, meta.caregiver_years_experience);
  const factsParts: string[] = [];
  if (meta.caregiver_years_experience && meta.caregiver_years_experience > 0) {
    factsParts.push(`${meta.caregiver_years_experience} ${meta.caregiver_years_experience === 1 ? "Jahr" : "Jahre"} Erfahrung`);
  }
  if (meta.caregiver_einsatz_count && meta.caregiver_einsatz_count > 0) {
    factsParts.push(`${meta.caregiver_einsatz_count} ${meta.caregiver_einsatz_count === 1 ? "Einsatz" : "Einsätze"}`);
  }
  const factsPlain = factsParts.length > 0 ? factsParts.join(" · ") : "bereit für den ersten Einsatz";

  return `${halloAnrede},

${intro}

${body}

${cgName}${agePart}${deutschPart}
${stufe}: ${factsPlain}
${firstName}s Profil ansehen: ${portalUrl}

PS: Klappt im Portal etwas nicht, oder möchten Sie das lieber persönlich klären? Sie erreichen mich unter 089 200 000 830 oder per WhatsApp (https://wa.me/4989200000830).

Mit freundlichen Grüßen
Marta Kapcio — Pflegeberaterin
Tel: 089 200 000 830  ·  WhatsApp: https://wa.me/4989200000830

Primundus Deutschland | www.primundus.de
`;
}

async function fetchPDFAttachment(
  siteUrl: string,
  leadId: string,
  vorname?: string
): Promise<{ filename: string; content: Uint8Array; contentType: string } | null> {
  try {
    const pdfUrl = `${siteUrl}/api/pdf/kalkulation/${leadId}`;
    const response = await fetch(pdfUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      console.warn(`PDF-Abruf fehlgeschlagen: ${response.status}`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const name = vorname ? `_${vorname}` : '';
    // Note: full name passed as `vorname` param from caller (Vorname_Nachname)
    return {
      filename: `Primundus_Angebot${name}.pdf`,
      content: new Uint8Array(arrayBuffer),
      contentType: 'application/pdf',
    };
  } catch (err) {
    console.warn('PDF fetch error (Mail wird trotzdem gesendet):', err);
    return null;
  }
}
 
async function scheduleFollowUp(
  supabase: any,
  lead: Lead,
  emailType: string,
  delayMinutes: number
): Promise<void> {
  // Nachtruhe (Martin, 19.08.): Nudges/Nachfaesse rechnen relativ (+4 h,
  // +28 h, +48 h ...) und landeten dadurch regelmaessig mitten in der Nacht.
  // Faellig zwischen 21:00 und 08:00 Berliner Zeit ⇒ 8:00 morgens.
  const scheduledFor = sendezeitIso(new Date(Date.now() + delayMinutes * 60 * 1000));
 
  await supabase
    .from("scheduled_emails")
    .update({ status: "cancelled" })
    .eq("lead_id", lead.id)
    .eq("email_type", emailType)
    .eq("status", "pending");
 
  await supabase.from("scheduled_emails").insert({
    lead_id: lead.id,
    email_type: emailType,
    recipient_email: lead.email,
    scheduled_for: scheduledFor,
    status: "pending",
  });
}
 

// ── Bewertungsanfrage-Runde (Tag 7 nach Anfrage) ─────────────────────────────
// Läuft in jedem Cron-Durchgang im Vormittagsfenster; wählt dynamisch statt
// über eingeplante Zeilen (kein Backfill nötig, Stichtag begrenzt den Start).
// Dedupe über die nach dem Versand eingefügte scheduled_emails-Zeile.
async function runBewertungsRunde(
  supabase: any,
  smtpConfig: SmtpConfig,
): Promise<Record<string, unknown>> {
  const jetzt = new Date();
  if (!imBewertungsfenster(jetzt)) return { skipped: "fenster" };

  const cutoff = new Date(jetzt.getTime() - BEWERTUNG_TAGE * 86400000).toISOString();
  const { data: kandidaten, error } = await supabase
    .from("leads")
    .select("id, vorname, nachname, anrede_text, token, email, email_cc, status, created_at, source, vermittler")
    .gte("created_at", BEWERTUNG_STICHTAG)
    .lte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return { error: String(error.message ?? error) };
  if (!kandidaten || kandidaten.length === 0) return { gesendet: 0 };

  const ids = kandidaten.map((k: BewertungsLead) => k.id);
  const { data: schon } = await supabase
    .from("scheduled_emails")
    .select("lead_id")
    .eq("email_type", "bewertungsanfrage")
    .in("lead_id", ids);
  const schonSet = new Set((schon ?? []).map((r: { lead_id: string }) => r.lead_id));

  const { data: pend } = await supabase
    .from("scheduled_emails")
    .select("lead_id, email_type")
    .eq("status", "pending")
    .in("lead_id", ids);
  const pendMap = new Map<string, string[]>();
  for (const r of pend ?? []) {
    const a = pendMap.get(r.lead_id) ?? [];
    a.push(r.email_type);
    pendMap.set(r.lead_id, a);
  }

  let gesendet = 0;
  const uebersprungen: Record<string, number> = {};
  const zaehle = (g: string) => { uebersprungen[g] = (uebersprungen[g] ?? 0) + 1; };

  for (const lead of kandidaten as BewertungsLead[]) {
    if (schonSet.has(lead.id)) continue;
    if (gesendet >= BEWERTUNG_CAP) { zaehle("cap_naechster_lauf"); continue; }
    const grund = bewertungAusschlussgrund(lead, pendMap.get(lead.id) ?? [], jetzt);
    if (grund) { zaehle(grund); continue; }

    const tpl = getBewertungsanfrageTemplate(lead, smtpConfig.siteUrl.replace(/\/$/, ""));
    // Testphase: Portal-Leads ans Team (Umleitung nur beim Versand).
    const umleitungBew = testphaseUmleitung(lead, Deno.env.get("PORTAL_TESTPHASE"), Deno.env.get("PORTAL_TESTPHASE_EMPFAENGER"));
    const bewEmpfaenger = umleitungBew?.empfaenger ?? lead.email!;
    const r = await sendEmailSmtp(
      smtpConfig, bewEmpfaenger,
      umleitungBew ? umleitungBew.betreffPraefix + tpl.subject : tpl.subject,
      tpl.html, tpl.text,
      // Martins Kopie (BEWERTUNG_CC) plus die Kopie-Adresse des Kunden.
      undefined, false, ccListe(BEWERTUNG_CC, umleitungBew ? null : kundenEmpfaenger(lead, bewEmpfaenger).cc),
    );
    if (r.success) {
      gesendet++;
      const nowIso = new Date().toISOString();
      await supabase.from("scheduled_emails").insert({
        lead_id: lead.id,
        email_type: "bewertungsanfrage",
        recipient_email: bewEmpfaenger,
        scheduled_for: nowIso,
        status: "sent",
        sent_at: nowIso,
      });
      await supabase.from("lead_events").insert({
        lead_id: lead.id,
        event_type: "email_bewertungsanfrage_sent",
        metadata: { to: bewEmpfaenger, cc: BEWERTUNG_CC, ausloeser: "tag7" },
      });
    } else {
      zaehle("versand_fehler");
    }
  }
  return { gesendet, uebersprungen };
}

/* Die fuenf Kraefte fuer die Vermittler-Mail: dieselben Daten wie beim
 * Nudge, aber ohne Profil-Links (es gibt fuer den Partner kein Portal) und
 * ohne Mail-Marker. Das Laden der Fotos bleibt hier, weil vermittler.ts
 * keine Deno-Abhaengigkeit haben soll. Wirft, wenn mamamia nicht
 * (rechtzeitig) antwortet; `null` heisst: geantwortet, niemand passt. */
async function kraefteFuerVermittler(lead: Lead, supabaseUrl: string, key: string) {
  const tok = lead.token;
  if (!tok) throw new Error("Lead ohne Token");
  const fuenf = await holeFuenfStreng({
    supabaseUrl, key, token: tok,
    jobOfferId: (lead as any).mamamia_job_offer_id ?? null,
    formularDaten: (lead as any).kalkulation?.formularDaten ?? {},
    darfOnboarden: Deno.env.get("EMPFEHLUNG_ONBOARD") !== "0",
  });
  if (fuenf.length === 0) return null;
  const roh = await Promise.all(fuenf.map((e) => fetchInlinePhotoDeno(e.fotoUrl)));
  const erlaubt = fotoBudget(roh.map((r) => r?.content.byteLength ?? 0));
  const inlines = roh.map((r, i) => (r && erlaubt[i] ? r : null));
  return {
    fuenf,
    cids: inlines.map((r) => r?.cid ?? null),
    anhaenge: inlines.filter(Boolean) as NonNullable<typeof inlines[number]>[],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
 
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
 
    const smtpConfig = await getSmtpConfig(supabase);
 
    if (!smtpConfig.user || !smtpConfig.pass) {
      throw new Error("SMTP credentials not found in vault");
    }
 
    const now = new Date().toISOString();
 
    // ── DEMO-MODUS ────────────────────────────────────────────────────────────
    // Vorschau der KOMPLETTEN Kette an eine beliebige Adresse, damit ein (künftiger)
    // Partner die Automatik nachvollziehen kann. Body:
    //   { demo:true, lead_id, recipient, items:[{email_type, banner}], milestone? }
    // Rendert jede Mail für den echten Lead, setzt oben einen Klammer-Hinweis ein.
    // Fasst scheduled_emails/lead_events NICHT an — die echte (ggf. gestoppte) Kette
    // des Leads bleibt unberührt (Lehre aus dem Fülbrandt-Vorfall 30.07.).
    let demoBody: any = null;
    try { demoBody = await req.clone().json(); } catch { demoBody = null; }
    if (demoBody && demoBody.demo === true) {
      const jsonH = { ...corsHeaders, "Content-Type": "application/json" };
      const { data: lead } = await supabase.from("leads").select("*").eq("id", demoBody.lead_id).single();
      if (!lead) return new Response(JSON.stringify({ error: "lead not found" }), { status: 404, headers: jsonH });
      const portalBase = Deno.env.get("PORTAL_URL") || "https://kundenportal.primundus.de";
      const site = smtpConfig.siteUrl;
      const to = demoBody.recipient;
      // Die Vorschau zeigt dieselbe Bewertungszeile wie der Versand.
      bewertungsStand = await ladeBewertungsStand(fetch);
      const dk = kundenKontext(lead as Lead, site, portalBase);
      const demoTypen: string[] = (demoBody.items || []).map((i: any) => i?.email_type);

      /* Der Testversand muss GENAU das rendern, was der Kunde bekommt.
         Beim ersten Lauf am 03.09.2026 zeigte er die alte Mail 2, weil die
         Fünf-Liste hier fehlte. Kein Onboarding aus einer Vorschau:
         `onboard:true` im Body nur bewusst, sonst braucht der Test-Lead eine
         bestehende job_offer (sonst kommt die Mail ohne Liste). */
      let demoFuenf: Awaited<ReturnType<typeof fuenfFuerNudge>> = null;
      if (demoTypen.includes("profil_nudge_1")) {
        demoFuenf = await fuenfFuerNudge(
          lead as Lead, portalBase, supabaseUrl, supabaseServiceKey, demoBody.onboard === true,
        );
      }
      /* Empfehlung auch in der Vorschau, derselbe Weg wie im Versand (für einen Lead mit
         job_offer ein Cache-Treffer, in mamamia entsteht nichts Neues). */
      let demoInline: InlineFoto | null = null;
      let demoEmpf: Awaited<ReturnType<typeof empfehlungFuerAngebot>> = null;
      if (demoTypen.includes("eingangsbestaetigung")) {
        demoEmpf = await empfehlungFuerAngebot(lead as Lead, supabaseUrl, supabaseServiceKey, Deno.env.get("EMPFEHLUNG_ONBOARD") !== "0");
        demoInline = demoEmpf?.inline ?? null;
      }
      /* Erinnerungen und „Reservierung abgelaufen" mit der letzten echten Bewerbung des Leads.
         Hat der Test-Lead keine, nimmt die Vorschau eine Beispiel-Pflegekraft und sagt das in der
         Antwort (beispiel_pflegekraft). Der Countdown zeigt den geplanten Stand der Stufe. */
      let demoBewerbung: { meta: ReminderMeta; angebot: BewerbungsAngebot; beispiel: boolean } | null = null;
      let demoErinnerungInline: InlineFoto | null = null;
      if (demoTypen.some((t) => ERINNERUNG_TYPEN.has(t) || t === "reservierung_beendet")) {
        const { data: evts } = await supabase
          .from("lead_events")
          .select("metadata")
          .eq("lead_id", (lead as Lead).id)
          .eq("event_type", "application_received")
          .order("created_at", { ascending: false })
          .limit(1);
        const m = ((evts ?? [])[0]?.metadata ?? null) as Record<string, unknown> | null;
        demoBewerbung = m && typeof m.caregiver_name === "string"
          ? { meta: m as ReminderMeta, angebot: angebotAus(m), beispiel: false }
          : {
            meta: { caregiver_id: 0, caregiver_name: "Maria K.", caregiver_age: 62, caregiver_german_level: "Gut", caregiver_years_experience: 6, caregiver_einsatz_count: 14 },
            angebot: { tagessatz: 102, zeitraum: "15.10.2026 – 10.12.2026", reisekosten: 125 },
            beispiel: true,
          };
        demoErinnerungInline = await fetchInlinePhotoDeno(demoBewerbung.meta.caregiver_photo_url);
      }
      const demoRestStunden: Record<string, number> = { "1": 52, "2": 24, "letzte": 8 };

      /* Vermittler-Vorschau: dieselben Bausteine wie in der Warteschlange,
         nur die Kopfdaten sind gesetzt (die Demo-Items tragen keine
         metadata). So sieht man Provisionsblock und Liste, ohne eine
         Anfrage anlegen zu muessen. */
      const demoMeta = { kunde_label: "Familie Muster", provision_pro_tag: 10, betreff_antwort: "Re: Ihre Anfrage" };
      let demoVermittlerEmpf: EmpfehlungErgebnis | null = null;
      let demoVermittlerFuenf: Awaited<ReturnType<typeof kraefteFuerVermittler>> = null;
      if (demoTypen.includes("vermittler_angebot") && (lead as Lead).token) {
        demoVermittlerEmpf = await holeEmpfehlung({
          supabaseUrl, key: supabaseServiceKey, token: (lead as Lead).token as string,
          jobOfferId: (lead as any).mamamia_job_offer_id ?? null,
          formularDaten: (lead as any).kalkulation?.formularDaten ?? {},
          darfOnboarden: Deno.env.get("EMPFEHLUNG_ONBOARD") !== "0",
        });
        if (demoVermittlerEmpf) demoInline = await fetchInlinePhotoDeno(demoVermittlerEmpf.empfehlung.fotoUrl);
      }
      if (demoTypen.includes("vermittler_kraefte")) {
        demoVermittlerFuenf = await kraefteFuerVermittler(lead as Lead, supabaseUrl, supabaseServiceKey).catch(() => null);
      }
      const demoAnrede = `${buildEingangsGreeting(lead as Lead)},`;

      const R = (m: KundenMail) => inHuelle(lead as Lead, site, m);
      const render = (t: string): { subject: string; html: string; text: string } => {
        if (ERINNERUNG_TYPEN.has(t) && demoBewerbung) {
          const stufe = erinnerungStufe(t) ?? "1";
          const mm = demoBewerbung.meta;
          return R(erinnerungMail(dk, {
            stufe,
            pk: {
              name: mm.caregiver_name || "Ihre Pflegekraft",
              alter: mm.caregiver_age ?? null,
              deutsch: deutschStufe(mm.caregiver_germany_skill, mm.caregiver_german_level),
              jahre: mm.caregiver_years_experience ?? null,
              einsaetze: mm.caregiver_einsatz_count ?? null,
              foto: demoErinnerungInline ? `cid:${demoErinnerungInline.cid}` : null,
            },
            angebot: demoBewerbung.angebot,
            url: dk.portal({ view: "application", m: stufe === "letzte" ? "er3" : `er${stufe}` }),
            restMs: demoRestStunden[stufe] * 60 * 60 * 1000,
          }));
        }
        switch (t) {
          case "eingangsbestaetigung": return R(angebotMail(dk, angebotEingabe(lead as Lead, false, demoEmpf)));
          case "profil_nudge_1": return R(nudge1Mail(dk, demoFuenf ? { html: demoFuenf.html, text: demoFuenf.text, vornamen: demoFuenf.vornamen } : null));
          case "profil_nudge_2": return R(nudge2Mail(dk));
          case "warum_primundus": return R(vierDingeMail(dk, (lead as Lead).kalkulation));
          case "nachfass_2": return R(nachfass2Mail(dk));
          case "nachfass_3": return R(nachfass3Mail(dk, buildLeadRef(lead as Lead)));
          case "neue_pflegekraefte_verfuegbar": return R(neuePflegekraefteMail(dk));
          case "suche_stand_2tage": return R(sucheStandMail(dk));
          case "reservierung_beendet": return R(reservierungBeendetMail(dk, [String(demoBewerbung?.meta.caregiver_name ?? "").split(/\s+/)[0]]));
          case "profil_nudge_3": return { subject: "Können wir Sie bei etwas unterstützen?", html: buildProfilNudge3Html(lead as Lead, site, portalBase), text: buildProfilNudge3Text(lead as Lead, site, portalBase) };
          case "reaktivierung_wechsel": return { subject: "Steht bei Ihnen ein Pflegekraft-Wechsel an?", html: buildReaktivierungWechselHtml(lead as Lead, site, portalBase), text: buildReaktivierungWechselText(lead as Lead, site, portalBase) };
          case "vermittler_angebot": {
            const d = {
              anrede: demoAnrede, kundeLabel: demoMeta.kunde_label,
              signatur: buildMartaSig(site, "vermittler"),
              bruttopreis: Number((lead as any).kalkulation?.bruttopreis ?? 0),
              provisionProTag: demoMeta.provision_pro_tag,
              empfehlung: demoVermittlerEmpf?.empfehlung ?? null,
              sichtbarGesamt: demoVermittlerEmpf?.sichtbarGesamt ?? 0,
              fotoCid: demoInline?.cid ?? null,
            };
            return { subject: demoMeta.betreff_antwort, html: buildEmailWrapper(lead as Lead, site, vermittlerAngebotHtml(d), VERMITTLER_FUSSNOTE, VERMITTLER_ABSENDER), text: vermittlerAngebotText(d) };
          }
          case "vermittler_kraefte": {
            const d = {
              anrede: demoAnrede, kundeLabel: demoMeta.kunde_label,
              signatur: buildMartaSig(site, "vermittler"),
              fuenf: demoVermittlerFuenf?.fuenf ?? [], cids: demoVermittlerFuenf?.cids ?? [],
            };
            return { subject: demoMeta.betreff_antwort, html: buildEmailWrapper(lead as Lead, site, vermittlerKraefteHtml(d), VERMITTLER_FUSSNOTE, VERMITTLER_ABSENDER), text: vermittlerKraefteText(d) };
          }
          default: return { subject: `Unbekannt: ${t}`, html: `<p>Unbekannter Typ ${t}</p>`, text: `Unbekannter Typ ${t}` };
        }
      };
      const bannerHtml = (b: string) => `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;margin:12px auto 0;"><tr><td style="background:#FFF7E6;border:1px solid #F0D68A;border-radius:8px;padding:11px 16px;font-family:sans-serif;font-size:13px;color:#8A6D00;line-height:1.5;">(${b})</td></tr></table>`;

      const results: any[] = [];
      for (const item of (demoBody.items || [])) {
        try {
          const m = render(item.email_type);
          const b = item.banner || "";
          // subjectPrefix wird VORNE an den Original-Betreff gehängt (z. B. "Test - Mail 2: ").
          const subject = item.subjectPrefix ? `${item.subjectPrefix}${m.subject}` : m.subject;
          const html = b ? m.html.replace('<div class="email-content">', `${bannerHtml(b)}<div class="email-content">`) : m.html;
          const text = b ? `(${b})\n\n${m.text}` : m.text;
          const anhang = (item.email_type === "eingangsbestaetigung" || item.email_type === "vermittler_angebot") && demoInline
            ? [demoInline]
            : item.email_type === "profil_nudge_1" && demoFuenf?.anhaenge.length
            ? demoFuenf.anhaenge
            : ERINNERUNG_TYPEN.has(item.email_type) && demoErinnerungInline
            ? [demoErinnerungInline]
            : item.email_type === "vermittler_kraefte" && demoVermittlerFuenf?.anhaenge.length
            ? demoVermittlerFuenf.anhaenge
            : undefined;
          /* Vermittler-Vorschau nimmt dasselbe Postfach wie die echte Mail —
             so prueft der Testversand nebenbei den Ionos-Zugang, statt ihn
             erst beim ersten echten Partner zu entdecken. */
          const demoConfig = item.email_type?.startsWith("vermittler_")
            ? await getVermittlerSmtpConfig(supabase, smtpConfig.siteUrl)
            : smtpConfig;
          const r = await sendEmailSmtp(demoConfig, to, subject, html, text, anhang, demoBody.skipBcc === true);
          results.push({
            email_type: item.email_type, to, subject, ...r,
            // Damit man an der Antwort sieht, ob die Liste drin war.
            ...(item.email_type === "profil_nudge_1"
              ? { fuenf: demoFuenf ? { anzahl: demoFuenf.anzahl, caregiver_ids: demoFuenf.caregiverIds, fotos_inline: demoFuenf.anhaenge.length } : null }
              : {}),
            ...(ERINNERUNG_TYPEN.has(item.email_type) || item.email_type === "reservierung_beendet"
              ? { beispiel_pflegekraft: demoBewerbung?.beispiel ?? null }
              : {}),
          });
        } catch (e) {
          results.push({ email_type: item.email_type, success: false, error: String(e) });
        }
      }
      return new Response(JSON.stringify({ demo: true, recipient: to, results }), { status: 200, headers: jsonH });
    }
    // ── Ende DEMO-MODUS ───────────────────────────────────────────────────────

    // Bewertungsanfragen (Tag 7) — unabhängig von der pending-Queue, damit
    // die Runde auch bei leerer Queue läuft.
    const bewertungen = await runBewertungsRunde(supabase, smtpConfig);

    const { data: pendingEmails, error: fetchError } = await supabase
      .from("scheduled_emails")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      // Älteste zuerst: sonst konnte eine überfällige Zeile hinter neueren hängen bleiben.
      .order("scheduled_for", { ascending: true })
      .limit(10);
 
    if (fetchError) {
      throw new Error(`Error fetching scheduled emails: ${fetchError.message}`);
    }
 
    if (!pendingEmails || pendingEmails.length === 0) {
      return new Response(
        JSON.stringify({ message: "No pending emails to send", processed: 0, bewertungen }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
 
    // Bewertungszeile unter Martas Karte: einmal pro Aufruf laden (≤ 2 s,
    // sonst Ersatzwert) — erst hier, damit leere Takte primundus.de nicht fragen.
    bewertungsStand = await ladeBewertungsStand(fetch);

    const results: { id: string; success: boolean; error?: string; flagged?: boolean }[] = [];
    // Echte Versand-Fehlschläge dieses Laufs sammeln → EINE Sammel-Alarm-Mail
    // ans Team am Ende (siehe notifyOpsOfFailures). Geflaggte Domains zählen
    // hier NICHT rein (das ist kein Versandfehler, sondern bewusst geblockt).
    const failures: { emailType: string; recipient: string; leadId: string; error: string }[] = [];
 
    for (const scheduledEmail of pendingEmails as ScheduledEmail[]) {
      try {
        const { data: claimed, error: claimError } = await supabase
          .from("scheduled_emails")
          .update({ status: "processing", updated_at: new Date().toISOString() })
          .eq("id", scheduledEmail.id)
          .eq("status", "pending")
          .select("id")
          .maybeSingle();
 
        if (claimError || !claimed) {
          continue;
        }
        const { data: lead, error: leadError } = await supabase
          .from("leads")
          .select("*")
          .eq("id", scheduledEmail.lead_id)
          .maybeSingle();
 
        if (leadError || !lead) {
          await supabase
            .from("scheduled_emails")
            .update({
              status: "failed",
              error_message: leadError?.message || "Lead not found",
              updated_at: new Date().toISOString(),
            })
            .eq("id", scheduledEmail.id);
 
          results.push({ id: scheduledEmail.id, success: false, error: "Lead not found" });
          failures.push({ emailType: scheduledEmail.email_type, recipient: scheduledEmail.recipient_email, leadId: scheduledEmail.lead_id, error: leadError?.message || "Lead not found" });
          continue;
        }
 
        // Abmeldung (Abmelde-Link): gilt für ALLE Mail-Typen — der Kunde hat
        // dem weiteren E-Mail-Versand widersprochen (Art. 21 DSGVO). Mail
        // canceln, NICHT senden.
        const { data: unsubEvt } = await supabase
          .from("lead_events")
          .select("id")
          .eq("lead_id", scheduledEmail.lead_id)
          .eq("event_type", "email_unsubscribed")
          .limit(1);
        if (Array.isArray(unsubEvt) && unsubEvt.length > 0) {
          await supabase
            .from("scheduled_emails")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("id", scheduledEmail.id);
          await supabase.from("lead_events").insert({
            lead_id: scheduledEmail.lead_id,
            event_type: `email_${scheduledEmail.email_type}_cancelled`,
            metadata: { reason: "unsubscribed" },
          });
          results.push({ id: scheduledEmail.id, success: true });
          continue;
        }

        // Pause (Kunde hat auf /rueckmeldung einen Wunschtermin gewählt, Registry #72):
        // bis dahin keine Mails aus der Warteschlange, außer der Nachfrage selbst
        // und Mails, die der Kunde durch eine neue Anfrage selbst auslöst.
        // Meldet sich der Kunde vorher selbst (AKTIVITAET_NACH_PAUSE), ist die Pause vorbei.
        if (!["wiedervorlage", "eingangsbestaetigung", "angebot"].includes(scheduledEmail.email_type)) {
          const pause = await pauseStand(supabase, scheduledEmail.lead_id);
          if (pause && pauseAktiv(pause.bis, new Date(), pause.aktivSeitPause)) {
            await supabase
              .from("scheduled_emails")
              .update({ status: "cancelled", updated_at: new Date().toISOString() })
              .eq("id", scheduledEmail.id);
            await supabase.from("lead_events").insert({
              lead_id: scheduledEmail.lead_id,
              event_type: `email_${scheduledEmail.email_type}_cancelled`,
              metadata: { reason: "pausiert", bis: pause.bis },
            });
            results.push({ id: scheduledEmail.id, success: true });
            continue;
          }
        }

        // Empfänger IMMER frisch aus dem Lead. scheduled_emails.recipient_email
        // ist nur eine Kopie vom Zeitpunkt der Einplanung — korrigiert jemand die
        // Adresse (Admin-Kontaktformular), würde die geplante Mail sonst weiter
        // an die alte Adresse gehen. Der Snapshot bleibt Fallback für Alt-Zeilen
        // ohne lead.email. Alle Queue-Typen sind Kundenmails — Team-Mails laufen
        // an der Warteschlange vorbei (direkter SMTP-Versand), daher ist der Lead
        // hier ausnahmslos der richtige Adressat.
        const recipient = (lead.email ?? "").trim() || scheduledEmail.recipient_email;
        // Kopie-Adresse (leads.email_cc): jede Kundenmail geht zusätzlich als
        // CC an sie — beide sehen einander (Martin, 03.09.2026). Sie ist
        // KEIN Pflicht-Empfänger: sieht ihre Domain nach Tippfehler aus,
        // fällt nur die Kopie weg, die Mail an den Kunden geht trotzdem.
        let ccEmpfaenger = kundenEmpfaenger(lead as Lead, recipient).cc;
        if (ccEmpfaenger) {
          const ccCheck = detectEmailDomainTypo(ccEmpfaenger);
          if (ccCheck.suspicious) {
            await supabase.from("lead_events").insert({
              lead_id: scheduledEmail.lead_id,
              event_type: "email_cc_domain_flagged",
              metadata: { cc: ccEmpfaenger, email_type: scheduledEmail.email_type,
                suggestion: ccCheck.suggestion ?? null, reason: ccCheck.reason ?? null },
            });
            console.warn(`[cc-flag] Kopie-Adresse verworfen: ${ccEmpfaenger} (${ccCheck.reason})`);
            ccEmpfaenger = undefined;
          }
        }
        /* Testphase (PORTAL_TESTPHASE=1): Kundenmails der Portal-Leads gehen
           ans Team statt an den Kunden — Umleitung erst beim Versand, der
           Lead behaelt die echte Adresse. Kopie-Logik: testphase.ts. */
        const umleitung = testphaseUmleitung(
          { source: (lead as Record<string, unknown>).source as string | null, email: recipient },
          Deno.env.get("PORTAL_TESTPHASE"),
          Deno.env.get("PORTAL_TESTPHASE_EMPFAENGER"),
        );

        let isBeauftragt = lead.status === "vertrag_abgeschlossen" || lead.status === "betreuung_beauftragt" || lead.order_confirmed === true;
        // Buchung erkennen: die MVP-Annahme (Kunde akzeptiert eine Pflegekraft
        // im Portal) setzt lead.status NICHT auf "beauftragt", loggt aber ein
        // application_accepted_internal-Event. Ohne diesen Check blieb
        // isBeauftragt false → ALLE Nurture-/Reminder-Mails (v. a.
        // warum_primundus) liefen nach der Buchung weiter. Als beauftragt
        // werten → alle bestehenden Skip-Branches greifen automatisch.
        if (!isBeauftragt) {
          const { data: acceptedEvt } = await supabase
            .from("lead_events")
            .select("id")
            .eq("lead_id", scheduledEmail.lead_id)
            .eq("event_type", "application_accepted_internal")
            .limit(1);
          if (Array.isArray(acceptedEvt) && acceptedEvt.length > 0) isBeauftragt = true;
        }
        const isNichtInteressiert = lead.status === "nicht_interessiert";

        const isNachfass =
          scheduledEmail.email_type === "nachfass_1" ||
          scheduledEmail.email_type === "nachfass_2" ||
          scheduledEmail.email_type === "nachfass_3";

        // Gestrichene Mail-Typen (kette.ts, Registry #70): nicht mehr
        // eingeplant; was schon in der Warteschlange steht, verfaellt hier.
        if (GESTRICHENE_MAILS.has(scheduledEmail.email_type)) {
          await supabase
            .from("scheduled_emails")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("id", scheduledEmail.id);
          await supabase.from("lead_events").insert({
            lead_id: scheduledEmail.lead_id,
            event_type: `email_${scheduledEmail.email_type}_cancelled`,
            metadata: { reason: "gestrichen" },
          });
          results.push({ id: scheduledEmail.id, success: true });
          continue;
        }

        // Profil-Nudges (gegen Profil-Abbruch). Feuern nur solange das
        // Patientenprofil offen ist \u2014 bei patient_data_saved/eingeladen
        // ist das Ziel erreicht und der Nudge cancelt sich selbst. Eine
        // Bewerbung z\u00e4hlt als fertiges Profil (Team-Profil aus dem
        // SA-Portal, Registry #69, siehe meilenstein.ts).
        const isProfilNudge =
          scheduledEmail.email_type === "profil_nudge_1" ||
          scheduledEmail.email_type === "profil_nudge_2" ||
          scheduledEmail.email_type === "profil_nudge_3" ||
          scheduledEmail.email_type === "reaktivierung_wechsel";

        // Lead-Meilenstein aus den CA-App-Events (portal_opened, patient_data_saved,
        // caregiver_invited) \u2014 steuert die Nachfass-Variante + den Abbruch.
        const milestone = (isNachfass || isProfilNudge || VOR_DEM_ABSENDEN.has(scheduledEmail.email_type))
          ? await getLeadMilestone(supabase, scheduledEmail.lead_id)
          : "none" as LeadMilestone;

        // Abbruch: Lead ist beauftragt / nicht interessiert ODER hat bereits
        // eine Pflegekraft eingeladen (Ziel erreicht \u2014 kein Nachfass mehr n\u00f6tig).
        if (isNachfass && (isBeauftragt || isNichtInteressiert || milestone === "caregiver_invited")) {
          await supabase
            .from("scheduled_emails")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("id", scheduledEmail.id);

          await supabase.from("lead_events").insert({
            lead_id: scheduledEmail.lead_id,
            event_type: `email_${scheduledEmail.email_type}_cancelled`,
            metadata: {
              reason: milestone === "caregiver_invited"
                ? "caregiver_invited"
                : isNichtInteressiert ? "nicht_interessiert" : "betreuung_beauftragt",
            },
          });

          results.push({ id: scheduledEmail.id, success: true });
          continue;
        }

        // „Vier Dinge", Nachfass 2 und 3 bitten um die Pflegesituation. Steht sie (oder ist schon
        // eine Bewerbung / Einladung da), sind sie erledigt (Vorschau v2, 26.09.2026). Vorher
        // liefen sie weiter und fragten Kunden, die längst abgesendet hatten, nach den Angaben.
        if (VOR_DEM_ABSENDEN.has(scheduledEmail.email_type)) {
          const grund = vorAbsendenStopp({ beauftragt: isBeauftragt, nichtInteressiert: isNichtInteressiert, meilenstein: milestone });
          if (grund) {
            await zeileAbbrechen(supabase, scheduledEmail, grund);
            results.push({ id: scheduledEmail.id, success: true });
            continue;
          }
        }

        // „Noch keine Bewerbung? So geht es schneller" (+48 h nach dem Absenden): nur ohne
        // Bewerbung und ohne neues Interesse seit dem Einplanen.
        if (scheduledEmail.email_type === "suche_stand_2tage") {
          const seit = (scheduledEmail as any).created_at ?? "1970-01-01";
          const { data: evts } = await supabase
            .from("lead_events")
            .select("event_type, created_at")
            .eq("lead_id", scheduledEmail.lead_id)
            .in("event_type", ["application_received", "caregiver_interest_shown"]);
          const liste = (evts ?? []) as { event_type: string; created_at: string }[];
          const grund = sucheStandStopp({
            beauftragt: isBeauftragt,
            nichtInteressiert: isNichtInteressiert,
            bewerbungDa: liste.some((e) => e.event_type === "application_received"),
            interesseSeitAnlage: liste.some((e) => e.event_type === "caregiver_interest_shown" && e.created_at >= seit),
          });
          if (grund) {
            await zeileAbbrechen(supabase, scheduledEmail, grund);
            results.push({ id: scheduledEmail.id, success: true });
            continue;
          }
        }

        // „Reservierung abgelaufen": entfällt, wenn inzwischen gebucht oder abgemeldet.
        if (scheduledEmail.email_type === "reservierung_beendet" && (isBeauftragt || isNichtInteressiert)) {
          await zeileAbbrechen(supabase, scheduledEmail, isNichtInteressiert ? "nicht_interessiert" : "betreuung_beauftragt");
          results.push({ id: scheduledEmail.id, success: true });
          continue;
        }

        // Profil-Nudge-Abbruch: sobald das Profil steht (patient_data_saved)
        // ODER der Kunde schon eingeladen / gebucht hat / nicht interessiert
        // ist, ist der Nudge gegenstandslos.
        if (isProfilNudge && (isBeauftragt || isNichtInteressiert
            || milestone === "patient_data_saved" || milestone === "caregiver_invited")) {
          await supabase
            .from("scheduled_emails")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("id", scheduledEmail.id);

          await supabase.from("lead_events").insert({
            lead_id: scheduledEmail.lead_id,
            event_type: `email_${scheduledEmail.email_type}_cancelled`,
            metadata: {
              reason: milestone === "patient_data_saved"
                ? "patient_data_saved"
                : milestone === "caregiver_invited"
                ? "caregiver_invited"
                : isNichtInteressiert ? "nicht_interessiert" : "betreuung_beauftragt",
            },
          });

          results.push({ id: scheduledEmail.id, success: true });
          continue;
        }

        // "Neue Pflegekräfte verfügbar" (+24h nach der letzten Einladung):
        // nur senden, wenn der Kunde NICHT reagiert hat (Bewerbung / Interesse seit dem
        // Einplanen), nicht während eine Bewerbung reserviert ist (dann soll er über DIESE
        // entscheiden) und nie nachts — die Zeile rutscht dann auf 08:00 (26.09.2026).
        if (scheduledEmail.email_type === "neue_pflegekraefte_verfuegbar") {
          const { data: evts } = await supabase
            .from("lead_events")
            .select("event_type, created_at, metadata")
            .eq("lead_id", scheduledEmail.lead_id)
            .in("event_type", ["application_received", "caregiver_interest_shown", "application_accepted_internal", "application_rejected"]);
          const liste = (evts ?? []) as { event_type: string; created_at: string; metadata?: Record<string, unknown> | null }[];
          const seit = (scheduledEmail as any).created_at ?? "1970-01-01";
          const jetzt = new Date();
          const e = neuePflegekraefteEntscheidung({
            jetzt,
            beauftragt: isBeauftragt,
            nichtInteressiert: isNichtInteressiert,
            reagiertSeitAnlage: liste.some((x) =>
              (x.event_type === "application_received" || x.event_type === "caregiver_interest_shown") && x.created_at >= seit),
            reservierungAktiv: reservierungAktiv(liste, jetzt),
          });
          if (e.aktion === "abbrechen") {
            await zeileAbbrechen(supabase, scheduledEmail, e.grund);
            results.push({ id: scheduledEmail.id, success: true });
            continue;
          }
          if (e.aktion === "verschieben") {
            await supabase
              .from("scheduled_emails")
              .update({ status: "pending", scheduled_for: e.bis.toISOString(), updated_at: new Date().toISOString() })
              .eq("id", scheduledEmail.id);
            results.push({ id: scheduledEmail.id, success: true });
            continue;
          }
        }

        let subject = "";
        let html = "";
        let text = "";
        let eventTypeSent = "";
        let eventTypeFailed = "";

        const portalBase = Deno.env.get("PORTAL_URL") || "https://kundenportal.primundus.de";
        // Neue Kundenmails (kundenMails.ts): Kontext einmal, dann in die Hülle.
        const k = kundenKontext(lead as Lead, smtpConfig.siteUrl, portalBase);
        const neu = (m: KundenMail) => {
          const fertig = inHuelle(lead as Lead, smtpConfig.siteUrl, m);
          subject = fertig.subject;
          html = fertig.html;
          text = fertig.text;
        };

        if (scheduledEmail.email_type === "angebot") {
          // Legacy: wird seit dem neuen Flow nicht mehr neu eingeplant, der
          // Handler bleibt nur f\u00fcr evtl. noch eingeplante Alt-Rows.
          subject = "Ihr pers\u00f6nliches Angebot zur 24-Stunden-Betreuung";
          html = buildAngebotsEmailHtml(lead as Lead, smtpConfig.siteUrl);
          text = buildAngebotsEmailText(lead as Lead, smtpConfig.siteUrl);
          eventTypeSent = "email_angebot_sent";
          eventTypeFailed = "email_angebot_failed";
        } else if (scheduledEmail.email_type === "eingangsbestaetigung") {
          // Mail 1: Angebot + „Passt Ihnen das Angebot?" (Vorschau v2, Martin 26.09.2026).
          // Re-Submit: angepasster Betreff und Einstieg (Kunde hat das Formular nochmal
          // abgeschickt). Eingekaufter Lead: eigener Betreff, Portalname im Einstieg, Hinweis
          // über den Angaben — Herkunft schlägt Resubmit.
          const isResubmit = await hasPreviousEingangsbestaetigungSent(supabase, scheduledEmail.lead_id);
          /* Empfehlung: echte gematchte Pflegekraft (Martin 31.08.2026). Best-effort — fällt sie
             aus, fehlt nur der Abschnitt, der Versand hängt nie davon ab. */
          const empf = await empfehlungFuerAngebot(
            lead as Lead, supabaseUrl, supabaseServiceKey, Deno.env.get("EMPFEHLUNG_ONBOARD") !== "0",
          );
          if (empf) {
            if (empf.inline) (scheduledEmail as any).__reminderInline = empf.inline;
            await supabase.from("lead_events").insert({
              lead_id: scheduledEmail.lead_id,
              event_type: "empfehlung_in_angebotsmail",
              metadata: {
                caregiver_id: empf.erg.empfehlung.caregiverId,
                sichtbar_gesamt: empf.erg.sichtbarGesamt,
                gruende: empf.erg.empfehlung.gruende,
                foto: empf.inline ? "inline" : "initialen",
              },
            });
          }
          neu(angebotMail(k, angebotEingabe(lead as Lead, isResubmit, empf)));
          eventTypeSent = "email_eingangsbestaetigung_sent";
          eventTypeFailed = "email_eingangsbestaetigung_failed";
        } else if (scheduledEmail.email_type === "nachfass_1") {
          subject = "AW: Kurze R\u00fcckfrage zu Ihrem Angebot";
          html = buildNachfass1Html(lead as Lead, smtpConfig.siteUrl, portalBase, milestone);
          text = buildNachfass1Text(lead as Lead, smtpConfig.siteUrl, portalBase, milestone);
          eventTypeSent = "email_nachfass_1_sent";
          eventTypeFailed = "email_nachfass_1_failed";
        } else if (scheduledEmail.email_type === "nachfass_2") {
          // Nur noch vor dem Absenden (Stopp oben): eine Variante, Knopf „Bewerbungen erhalten".
          neu(nachfass2Mail(k));
          eventTypeSent = "email_nachfass_2_sent";
          eventTypeFailed = "email_nachfass_2_failed";
        } else if (scheduledEmail.email_type === "nachfass_3") {
          neu(nachfass3Mail(k, buildLeadRef(lead as Lead)));
          eventTypeSent = "email_nachfass_3_sent";
          eventTypeFailed = "email_nachfass_3_failed";
        } else if (scheduledEmail.email_type === "vermittler_angebot") {
          /* Mail 1 an den Vermittler: Preis, Provision, eine passende Kraft.
             Kein Portal-Link, kein Abmelde-Link — der Token des Leads oeffnet
             das Kundenportal und darf diese Mail nicht verlassen. */
          const meta = (scheduledEmail.metadata ?? {}) as Record<string, any>;
          const kalk = (lead as any).kalkulation ?? {};
          let empfehlung = null as EmpfehlungErgebnis["empfehlung"] | null;
          let sichtbarGesamt = 0;
          let fotoCid: string | null = null;
          const tokV = (lead as Lead).token;
          if (tokV) {
            const erg = await holeEmpfehlung({
              supabaseUrl, key: supabaseServiceKey, token: tokV,
              jobOfferId: (lead as any).mamamia_job_offer_id ?? null,
              formularDaten: kalk.formularDaten ?? {},
              darfOnboarden: Deno.env.get("EMPFEHLUNG_ONBOARD") !== "0",
            });
            if (erg) {
              empfehlung = erg.empfehlung;
              sichtbarGesamt = erg.sichtbarGesamt;
              const inline = await fetchInlinePhotoDeno(erg.empfehlung.fotoUrl);
              if (inline) { fotoCid = inline.cid; (scheduledEmail as any).__reminderInline = inline; }
            }
          }
          const daten = {
            anrede: `${buildEingangsGreeting(lead as Lead)},`,
            /* Dieselbe Grussformel, Beraterinnen-Karte und Vertrauensleiste wie
               in jeder Kundenmail — ohne sie stand die Vermittler-Mail ohne
               Absenderin, ohne Telefonnummer und ohne Siegel da. */
            signatur: buildMartaSig(smtpConfig.siteUrl, "vermittler"),
            kundeLabel: (meta.kunde_label as string) || null,
            bruttopreis: Number(kalk.bruttopreis ?? 0),
            provisionProTag: Number(meta.provision_pro_tag ?? 0),
            empfehlung, sichtbarGesamt, fotoCid,
          };
          subject = (meta.betreff_antwort as string) || "Re: Ihre Anfrage";
          html = buildEmailWrapper(lead as Lead, smtpConfig.siteUrl, vermittlerAngebotHtml(daten), VERMITTLER_FUSSNOTE, VERMITTLER_ABSENDER);
          text = vermittlerAngebotText(daten);
          eventTypeSent = "email_vermittler_angebot_sent";
          eventTypeFailed = "email_vermittler_angebot_failed";
        } else if (scheduledEmail.email_type === "vermittler_kraefte") {
          /* Mail 2: die Liste. Sie wird JETZT neu berechnet — zwei Stunden
             nach Mail 1 kann eine Kraft gebucht sein. Ohne Kraefte gaebe es
             nur eine leere Rahmung: dann lieber nicht senden (unten). */
          const meta = (scheduledEmail.metadata ?? {}) as Record<string, any>;
          /* Sichtbar statt still: der Partner wartet auf die angekuendigte
             Liste, also muss ein Mensch davon erfahren — mit dem ECHTEN Grund
             und dem Namen, sonst sucht das Team erst den Lead. */
          const absagen = async (grund: string) => {
            await supabase.from("scheduled_emails").update({
              status: "cancelled", updated_at: new Date().toISOString(), error_message: grund,
            }).eq("id", scheduledEmail.id);
            await supabase.from("lead_events").insert({
              lead_id: scheduledEmail.lead_id,
              event_type: "vermittler_kraefte_entfallen",
              metadata: { grund },
            });
            const kunde = (meta.kunde_label as string) || scheduledEmail.lead_id;
            const satz = `Die angekündigte Liste an ${scheduledEmail.recipient_email} (${meta.betreff_antwort ?? "Re: Ihre Anfrage"}) wurde nicht verschickt: ${grund}. Bitte die Liste von Hand schicken.`;
            await sendEmailSmtp(
              smtpConfig, Deno.env.get("OPS_ALERT_TO") ?? "info@primundus.de",
              `Vermittler: Liste für ${kunde} nicht verschickt`,
              `<p>${esc(satz)}</p><p>Lead ${scheduledEmail.lead_id}</p>`,
              `${satz}\n\nLead ${scheduledEmail.lead_id}`,
              undefined, true,
            ).catch(() => {});
            console.warn(`[vermittler] Lead ${scheduledEmail.lead_id}: Mail 2 entfaellt — ${grund}`);
          };
          let teile: Awaited<ReturnType<typeof kraefteFuerVermittler>>;
          try {
            teile = await kraefteFuerVermittler(lead as Lead, supabaseUrl, supabaseServiceKey);
          } catch (e) {
            const grund = e instanceof Error ? e.message : String(e);
            const fehlschlaege = Number(meta.fehlschlaege ?? 0) + 1;
            const nochmal = kraefteNochmalUm(fehlschlaege, new Date());
            if (nochmal) {
              await supabase.from("scheduled_emails").update({
                status: "pending", scheduled_for: nochmal, updated_at: new Date().toISOString(),
                metadata: { ...meta, fehlschlaege }, error_message: `Versuch ${fehlschlaege}: ${grund}`,
              }).eq("id", scheduledEmail.id);
              console.warn(`[vermittler] Lead ${scheduledEmail.lead_id}: Liste nicht geladen (${grund}), neuer Versuch ${nochmal}`);
            } else {
              await absagen(`mamamia hat nach ${fehlschlaege} Versuchen nicht geantwortet (zuletzt: ${grund})`);
            }
            continue;
          }
          if (!teile) {
            await absagen("mamamia hat keine passenden Betreuungskräfte geliefert");
            continue;
          }
          if (teile.anhaenge.length) (scheduledEmail as any).__inlineAttachments = teile.anhaenge;
          const daten = {
            anrede: `${buildEingangsGreeting(lead as Lead)},`,
            /* Dieselbe Grussformel, Beraterinnen-Karte und Vertrauensleiste wie
               in jeder Kundenmail — ohne sie stand die Vermittler-Mail ohne
               Absenderin, ohne Telefonnummer und ohne Siegel da. */
            signatur: buildMartaSig(smtpConfig.siteUrl, "vermittler"),
            kundeLabel: (meta.kunde_label as string) || null,
            fuenf: teile.fuenf, cids: teile.cids,
          };
          subject = (meta.betreff_antwort as string) || "Re: Ihre Anfrage";
          html = buildEmailWrapper(lead as Lead, smtpConfig.siteUrl, vermittlerKraefteHtml(daten), VERMITTLER_FUSSNOTE, VERMITTLER_ABSENDER);
          text = vermittlerKraefteText(daten);
          eventTypeSent = "email_vermittler_kraefte_sent";
          eventTypeFailed = "email_vermittler_kraefte_failed";
        } else if (scheduledEmail.email_type === "profil_nudge_1") {
          /* Alle fünf Kräfte in die Mail (Martin, 03.09.2026). Vorbereitung
             im gemeinsamen Helfer, damit der Testversand exakt dasselbe
             rendert. Best-effort: fällt es aus, kommt die Mail ohne Liste. */
          const teile = await fuenfFuerNudge(
            lead as Lead, portalBase, supabaseUrl, supabaseServiceKey,
            Deno.env.get("EMPFEHLUNG_ONBOARD") !== "0",
          );
          if (teile) {
            if (teile.anhaenge.length) (scheduledEmail as any).__inlineAttachments = teile.anhaenge;
            await supabase.from("lead_events").insert({
              lead_id: scheduledEmail.lead_id,
              event_type: "fuenf_in_nudge_mail",
              metadata: { caregiver_ids: teile.caregiverIds, fotos_inline: teile.anhaenge.length },
            });
          }
          neu(nudge1Mail(k, teile ? { html: teile.html, text: teile.text, vornamen: teile.vornamen } : null));
          eventTypeSent = "email_profil_nudge_1_sent";
          eventTypeFailed = "email_profil_nudge_1_failed";
        } else if (scheduledEmail.email_type === "profil_nudge_2") {
          neu(nudge2Mail(k));
          eventTypeSent = "email_profil_nudge_2_sent";
          eventTypeFailed = "email_profil_nudge_2_failed";
        } else if (scheduledEmail.email_type === "profil_nudge_3") {
          subject = "Können wir Sie bei etwas unterstützen?";
          html = buildProfilNudge3Html(lead as Lead, smtpConfig.siteUrl, portalBase);
          text = buildProfilNudge3Text(lead as Lead, smtpConfig.siteUrl, portalBase);
          eventTypeSent = "email_profil_nudge_3_sent";
          eventTypeFailed = "email_profil_nudge_3_failed";
        } else if (scheduledEmail.email_type === "wiedervorlage") {
          // Nachfrage zum Wunschtermin (Registry #72). Entfällt, wenn der Lead
          // nicht mehr offen ist (gebucht, abgemeldet, vom Team geschlossen),
          // wenn der Kunde neu angefragt hat oder sich seit der Pause selbst
          // gemeldet hat.
          let entfaellt: string | null = OFFENE_STATUS.has(String(lead.status ?? "")) ? null : "status";
          if (!entfaellt && lead.email) {
            const { data: neuere } = await supabase
              .from("leads")
              .select("id")
              .eq("email", lead.email)
              .gt("created_at", lead.created_at)
              .neq("id", lead.id)
              .limit(1);
            if (Array.isArray(neuere) && neuere.length > 0) entfaellt = "neue_anfrage";
          }
          if (!entfaellt) {
            const pause = await pauseStand(supabase, scheduledEmail.lead_id);
            if (pause?.aktivSeitPause) entfaellt = "kunde_aktiv";
          }
          if (entfaellt) {
            await supabase
              .from("scheduled_emails")
              .update({ status: "cancelled", updated_at: new Date().toISOString() })
              .eq("id", scheduledEmail.id);
            await supabase.from("lead_events").insert({
              lead_id: scheduledEmail.lead_id,
              event_type: "email_wiedervorlage_cancelled",
              metadata: { reason: entfaellt },
            });
            results.push({ id: scheduledEmail.id, success: true });
            continue;
          }
          const seit = ((scheduledEmail.metadata ?? {}) as { seit?: string }).seit ?? null;
          subject = WIEDERVORLAGE_BETREFF;
          html = buildWiedervorlageHtml(lead as Lead, smtpConfig.siteUrl, portalBase, seit);
          text = buildWiedervorlageText(lead as Lead, smtpConfig.siteUrl, portalBase, seit);
          eventTypeSent = "email_wiedervorlage_sent";
          eventTypeFailed = "email_wiedervorlage_failed";
        } else if (scheduledEmail.email_type === "reaktivierung_wechsel") {
          subject = "Steht bei Ihnen ein Pflegekraft-Wechsel an?";
          html = buildReaktivierungWechselHtml(lead as Lead, smtpConfig.siteUrl, portalBase);
          text = buildReaktivierungWechselText(lead as Lead, smtpConfig.siteUrl, portalBase);
          eventTypeSent = "email_reaktivierung_wechsel_sent";
          eventTypeFailed = "email_reaktivierung_wechsel_failed";
        } else if (scheduledEmail.email_type === "neue_pflegekraefte_verfuegbar") {
          neu(neuePflegekraefteMail(k));
          eventTypeSent = "email_neue_pflegekraefte_verfuegbar_sent";
          eventTypeFailed = "email_neue_pflegekraefte_verfuegbar_failed";
        } else if (
          scheduledEmail.email_type === "interest_reminder" ||
          ERINNERUNG_TYPEN.has(scheduledEmail.email_type)
        ) {
          // Reaktions-Reminder. 1h / 4h / 12h nach dem ursprünglichen
          // caregiver_interest_shown / application_received-Event. Vor
          // Versand: checken ob der Kunde inzwischen reagiert hat (positiv
          // ODER negativ für diese Pflegekraft). Wenn ja, cancelt sich der
          // Reminder selbst — gilt für alle 3 application-Tiers gleich.
          const meta = ((scheduledEmail as any).metadata ?? {}) as ReminderMeta;
          const cgId = meta.caregiver_id;
          if (cgId == null) {
            await supabase
              .from("scheduled_emails")
              .update({ status: "failed", error_message: "reminder missing caregiver_id in metadata", updated_at: new Date().toISOString() })
              .eq("id", scheduledEmail.id);
            results.push({ id: scheduledEmail.id, success: false, error: "no caregiver_id" });
            failures.push({ emailType: scheduledEmail.email_type, recipient, leadId: scheduledEmail.lead_id, error: "reminder missing caregiver_id in metadata" });
            continue;
          }

          // Lead schon "fertig"? Status-Abbruch greift wie bei Nachfass.
          // Multi-Job-Ausnahme (Bug #25): "beauftragt" ist lead-weit (alter
          // Accept-Event existiert bei JEDEM Folge-Einsatz-Kunden) — Reminder,
          // deren Job AKTUELL 'geplant' ist, gehören zum NEUEN Einsatz und
          // überleben. Entscheidung: followupJobs.ts (reminderBookedCancel).
          let reminderJobStatus: string | null = null;
          if (isBeauftragt && !isNichtInteressiert && meta.mamamia_job_offer_id != null) {
            const { data: jobRow } = await supabase
              .from("lead_jobs")
              .select("status")
              .eq("lead_id", scheduledEmail.lead_id)
              .eq("mamamia_job_offer_id", meta.mamamia_job_offer_id)
              .maybeSingle();
            reminderJobStatus = typeof jobRow?.status === "string" ? jobRow.status : null;
          }
          if (reminderBookedCancel({ isBeauftragt, isNichtInteressiert, reminderJobStatus })) {
            await supabase
              .from("scheduled_emails")
              .update({ status: "cancelled", updated_at: new Date().toISOString() })
              .eq("id", scheduledEmail.id);
            await supabase.from("lead_events").insert({
              lead_id: scheduledEmail.lead_id,
              event_type: `email_${scheduledEmail.email_type}_cancelled`,
              metadata: { caregiver_id: cgId, reason: isNichtInteressiert ? "nicht_interessiert" : "betreuung_beauftragt" },
            });
            results.push({ id: scheduledEmail.id, success: true });
            continue;
          }

          // Reminder-Variant (interest / application) für Reaktions-Check
          // und Mail-Build. Alle 3 application-Tiers teilen sich die
          // Reaktions-Definition (accept/reject).
          const reminderVariant: "interest_reminder" | "application_reminder" =
            scheduledEmail.email_type === "interest_reminder"
              ? "interest_reminder"
              : "application_reminder";

          // Hat der Kunde reagiert (invite/decline bzw. accept/reject)?
          const reacted = await hasReactionForCaregiver(
            supabase,
            scheduledEmail.lead_id,
            reminderVariant,
            cgId,
          );
          if (reacted) {
            await supabase
              .from("scheduled_emails")
              .update({ status: "cancelled", updated_at: new Date().toISOString() })
              .eq("id", scheduledEmail.id);
            await supabase.from("lead_events").insert({
              lead_id: scheduledEmail.lead_id,
              event_type: `email_${scheduledEmail.email_type}_cancelled`,
              metadata: { caregiver_id: cgId, reason: "customer_reacted" },
            });
            results.push({ id: scheduledEmail.id, success: true });
            continue;
          }

          // Reaktion fehlt → Reminder bauen + senden. Foto inline einbetten
          // (CID), die S3-URL ist nach 30 Min eh meist abgelaufen.
          const variant: "interest" | "application" =
            reminderVariant === "interest_reminder" ? "interest" : "application";

          // Multi-Job (Bug #25): Reminder eines konkreten Jobs verlinkt das
          // Portal MIT &job=<lead_jobs.id> — der Kunde landet auf DEM Einsatz,
          // um den es geht (nicht auf dem Default-/neuesten Job). Fail-soft:
          // kein Mirror-Wiersz ⇒ plain Link.
          let leadJobUuid: string | null = null;
          if ((lead as Lead).token && meta.mamamia_job_offer_id != null) {
            try {
              const { data: jobRow } = await supabase
                .from("lead_jobs")
                .select("id")
                .eq("lead_id", scheduledEmail.lead_id)
                .eq("mamamia_job_offer_id", meta.mamamia_job_offer_id)
                .maybeSingle();
              leadJobUuid = typeof jobRow?.id === "string" ? jobRow.id : null;
            } catch (e) {
              console.warn(`reminder job-deeplink lookup failed (lead ${scheduledEmail.lead_id}):`, e instanceof Error ? e.message : String(e));
            }
          }

          if (variant === "interest") {
            // Interesse-Erinnerung (+1 h nach „interessiert sich"): unverändert.
            const cgName = meta.caregiver_name || "Ihre Pflegekraft";
            const firstName = cgName.split(/\s+/)[0] || cgName;
            subject = `${firstName} würde sich gern bei Ihnen vorstellen`;
            const portalUrl = (portalBase && (lead as Lead).token)
              ? appendJobParam(buildPortalUrl(portalBase, (lead as Lead).token), leadJobUuid)
              : smtpConfig.siteUrl;
            const inline = await fetchInlinePhotoDeno(meta.caregiver_photo_url);
            html = buildReminderHtml(lead as Lead, meta, portalUrl, smtpConfig.siteUrl, variant, inline?.cid ?? null, "1h");
            text = buildReminderText(lead as Lead, meta, portalUrl, variant, "1h");
            (scheduledEmail as any).__reminderInline = inline;
          } else {
            // Erinnerung an eine Bewerbung (Vorschau v2, 26.09.2026): Countdown aus der
            // Reservierung, Karte „Neue Bewerbung", Knopf „Angebot prüfen" öffnet sie.
            // Alte Typen (+1 h/+4 h/+12 h/+70 h) laufen durch denselben Baustein; zu dichte
            // oder zu späte fallen weg (stopRegeln.ts).
            const stufe = erinnerungStufe(scheduledEmail.email_type) ?? "1";
            const lage = await bewerbungsLage(
              supabase, scheduledEmail.lead_id, cgId, meta.mamamia_job_offer_id ?? null,
              ((lead as any).mamamia_job_offer_id ?? null) as number | null,
            );
            const jetzt = Date.now();
            const bis = reserviertBisAus((scheduledEmail.metadata ?? {}).reserviert_bis, lage.eingaengeMs);
            const restMs = bis ? bis.getTime() - jetzt : null;
            const stopp = erinnerungStopp({
              stufe,
              restMs,
              seitLetzterMailMs: lage.letzteMailMs != null ? jetzt - lage.letzteMailMs : null,
              letzteSchonGesendet: lage.letzteGesendet,
            });
            if (stopp) {
              await zeileAbbrechen(supabase, scheduledEmail, stopp, { caregiver_id: cgId });
              results.push({ id: scheduledEmail.id, success: true });
              continue;
            }
            const inline = await fetchInlinePhotoDeno(meta.caregiver_photo_url);
            const url = k.portal({ job: leadJobUuid, view: "application", m: stufe === "letzte" ? "er3" : `er${stufe}` });
            neu(erinnerungMail(k, {
              stufe,
              pk: {
                name: meta.caregiver_name || "Ihre Pflegekraft",
                alter: meta.caregiver_age ?? null,
                deutsch: deutschStufe(meta.caregiver_germany_skill, meta.caregiver_german_level),
                jahre: meta.caregiver_years_experience ?? null,
                einsaetze: meta.caregiver_einsatz_count ?? null,
                foto: inline ? `cid:${inline.cid}` : null,
              },
              angebot: lage.angebot,
              url,
              restMs,
            }));
            (scheduledEmail as any).__reminderInline = inline;
          }
          eventTypeSent = `email_${scheduledEmail.email_type}_sent`;
          eventTypeFailed = `email_${scheduledEmail.email_type}_failed`;
        } else if (scheduledEmail.email_type === "warum_primundus") {
          // „Vier Dinge" (~48 h nach Mail 1), nur solange die Pflegesituation fehlt (Stopp oben).
          neu(vierDingeMail(k, (lead as Lead).kalkulation));
          eventTypeSent = "email_warum_primundus_sent";
          eventTypeFailed = "email_warum_primundus_failed";
        } else if (scheduledEmail.email_type === "suche_stand_2tage") {
          // Neu (26.09.2026): 48 h nach dem Absenden, nur ohne Bewerbung (Stopp oben).
          neu(sucheStandMail(k));
          eventTypeSent = "email_suche_stand_2tage_sent";
          eventTypeFailed = "email_suche_stand_2tage_failed";
        } else if (scheduledEmail.email_type === "reservierung_beendet") {
          // Neu (26.09.2026): nach der automatischen Absage (72 h ohne Antwort). Weitere fällige
          // Zeilen desselben Leads kommen in DIESE Mail, statt zwei Mails kurz hintereinander.
          const { data: weitere } = await supabase
            .from("scheduled_emails")
            .select("id, metadata")
            .eq("lead_id", scheduledEmail.lead_id)
            .eq("email_type", "reservierung_beendet")
            .eq("status", "pending")
            .lte("scheduled_for", new Date().toISOString())
            .neq("id", scheduledEmail.id);
          const namen = [scheduledEmail.metadata, ...((weitere ?? []) as { metadata?: Record<string, unknown> | null }[]).map((w) => w.metadata)]
            .map((m) => String((m ?? {}).caregiver_name ?? "").trim().split(/\s+/)[0])
            .filter((v, i, alle) => v && alle.indexOf(v) === i);
          if (Array.isArray(weitere) && weitere.length > 0) {
            await supabase
              .from("scheduled_emails")
              .update({ status: "cancelled", error_message: `zusammengefasst in ${scheduledEmail.id}`, updated_at: new Date().toISOString() })
              .in("id", weitere.map((w: { id: string }) => w.id))
              .eq("status", "pending");
          }
          neu(reservierungBeendetMail(k, namen));
          eventTypeSent = "email_reservierung_beendet_sent";
          eventTypeFailed = "email_reservierung_beendet_failed";
        } else {
          await supabase
            .from("scheduled_emails")
            .update({
              status: "failed",
              error_message: `Unknown email type: ${scheduledEmail.email_type}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", scheduledEmail.id);

          results.push({ id: scheduledEmail.id, success: false, error: `Unknown email type: ${scheduledEmail.email_type}` });
          failures.push({ emailType: scheduledEmail.email_type, recipient, leadId: scheduledEmail.lead_id, error: `Unknown email type: ${scheduledEmail.email_type}` });
          continue;
        }
 
        // Attachments — je nach email_type unterschiedlich:
        // - "angebot" (legacy): PDF
        // - "interest_reminder"/"application_reminder": Inline-Foto via CID
        let attachments: { filename: string; content: Uint8Array; contentType: string; cid?: string }[] | undefined;
        if (scheduledEmail.email_type === "angebot") {
          const fullName = [(lead as Lead).vorname, (lead as any).nachname].filter(Boolean).join('_');
          const pdfAttachment = await fetchPDFAttachment(smtpConfig.siteUrl, lead.id, fullName || undefined);
          if (pdfAttachment) attachments = [pdfAttachment];
        } else {
          const reminderInline = (scheduledEmail as any).__reminderInline as
            | { filename: string; content: Uint8Array; contentType: string; cid: string }
            | null
            | undefined;
          if (reminderInline) attachments = [reminderInline];
          // Fünf-Liste (profil_nudge_1): mehrere Inline-Fotos auf einmal.
          const inlineListe = (scheduledEmail as any).__inlineAttachments as
            | { filename: string; content: Uint8Array; contentType: string; cid: string }[]
            | undefined;
          if (inlineListe?.length) attachments = [...(attachments ?? []), ...inlineListe];
        }

        // Domain-Tippfehler-Schutz: offensichtlich vertippte Empfänger-Domains
        // (z. B. t-onlne.de statt t-online.de) NICHT blind versenden — sonst
        // stiller Bounce. Stattdessen als needs_review flaggen + Event loggen,
        // damit jemand die Adresse beim Kunden korrigieren kann.
        // Geprüft wird die AUFGELÖSTE Adresse: nach einer Korrektur im Admin
        // darf der Snapshot die Zeile nicht erneut auf den alten Tippfehler
        // flaggen.
        const domainCheck = detectEmailDomainTypo(recipient);
        if (domainCheck.suspicious) {
          const note = domainCheck.suggestion
            ? `Verdächtige Empfänger-Domain (${domainCheck.reason}): ${recipient} → vermutlich gemeint: …@${domainCheck.suggestion}`
            : `Verdächtige Empfänger-Domain (${domainCheck.reason}): ${recipient}`;
          await supabase
            .from("scheduled_emails")
            .update({ status: "needs_review", error_message: note, updated_at: new Date().toISOString() })
            .eq("id", scheduledEmail.id);
          await supabase.from("lead_events").insert({
            lead_id: scheduledEmail.lead_id,
            event_type: "email_domain_flagged",
            metadata: {
              to: recipient,
              email_type: scheduledEmail.email_type,
              suggestion: domainCheck.suggestion ?? null,
              reason: domainCheck.reason ?? null,
            },
          });
          console.warn(`[domain-flag] ${note} (lead ${scheduledEmail.lead_id}, type ${scheduledEmail.email_type})`);
          results.push({ id: scheduledEmail.id, success: false, flagged: true, error: note });
          continue;
        }

        const effektiverEmpfaenger = umleitung?.empfaenger ?? recipient;
        const effektiverBetreff = umleitung ? umleitung.betreffPraefix + subject : subject;
        // Testphase-Umleitung ans Team: dann KEINE Kopie an die zweite
        // Kundenadresse — sonst bekäme sie, was der Kunde selbst nicht bekommt.
        /* Threading nur fuer die Vermittler-Mails: sie sind Antworten auf
           eine konkrete Mail des Partners und sollen in seinem Faden landen. */
        const threadId = scheduledEmail.email_type.startsWith("vermittler_")
          ? ((scheduledEmail.metadata ?? {}) as Record<string, any>).message_id ?? null
          : null;
        /* Vermittler-Mails gehen ueber das Ionos-Postfach info@primundus.de,
           alles andere ueber das SES-Konto. Erst hier geladen, damit ein
           Takt ohne Vermittler-Mail keinen zusaetzlichen RPC kostet. */
        const versandConfig = scheduledEmail.email_type.startsWith("vermittler_")
          ? await getVermittlerSmtpConfig(supabase, smtpConfig.siteUrl)
          : smtpConfig;
        const emailResult = await sendEmailSmtp(
          versandConfig, effektiverEmpfaenger, effektiverBetreff, html, text, attachments,
          false, umleitung ? undefined : ccEmpfaenger,
          threadId ? { inReplyTo: threadId, references: threadId } : undefined,
        );

        if (emailResult.success) {
          await supabase
            .from("scheduled_emails")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              // Verlauf ehrlich halten: die Zeile soll die Adresse zeigen, an
              // die tatsächlich versendet wurde, nicht den Snapshot von damals.
              recipient_email: effektiverEmpfaenger,
            })
            .eq("id", scheduledEmail.id);

          await supabase.from("lead_events").insert({
            lead_id: scheduledEmail.lead_id,
            event_type: eventTypeSent,
            metadata: { to: recipient, triggered_by: "scheduled_email",
              ...(ccEmpfaenger && !umleitung ? { cc: ccEmpfaenger } : {}) },
          });
 
          // Nachfass-Kette: startet jetzt nach der (gemergten) Eingangsbestätigung.
          // `angebot` bleibt für evtl. eingeplante Alt-Rows ebenfalls als Anker.
          // Sequenz und Begründungen: kette.ts (profil_nudge_3 gestrichen,
          // Registry #70). nachfass_1 wurde durch die zwei dedizierten
          // Profil-Nudges ersetzt; der Handler bleibt für Alt-Rows.
          // Alle Profil-Nudges + Nachfässe canceln sich selbst, sobald das
          // Profil steht / gebucht / nicht interessiert (Skip-Logik oben).
          if (scheduledEmail.email_type === "eingangsbestaetigung" || scheduledEmail.email_type === "angebot") {
            for (const [typ, minuten] of KETTE_NACH_MAIL1) {
              await scheduleFollowUp(supabase, lead as Lead, typ, minuten);
            }
          } else if (scheduledEmail.email_type === "nachfass_2") {
            await scheduleFollowUp(supabase, lead as Lead, "nachfass_3", 48 * 60);
          }
 
          results.push({ id: scheduledEmail.id, success: true });
        } else {
          await supabase
            .from("scheduled_emails")
            .update({
              status: "failed",
              error_message: emailResult.error,
              updated_at: new Date().toISOString(),
            })
            .eq("id", scheduledEmail.id);
 
          await supabase.from("lead_events").insert({
            lead_id: scheduledEmail.lead_id,
            event_type: eventTypeFailed,
            metadata: { to: recipient, error: emailResult.error, triggered_by: "scheduled_email" },
          });

          results.push({ id: scheduledEmail.id, success: false, error: emailResult.error });
          failures.push({ emailType: scheduledEmail.email_type, recipient, leadId: scheduledEmail.lead_id, error: emailResult.error ?? "unbekannt" });
        }
      } catch (emailError) {
        const errorMsg = emailError instanceof Error ? emailError.message : String(emailError);

        await supabase
          .from("scheduled_emails")
          .update({
            status: "failed",
            error_message: errorMsg,
            updated_at: new Date().toISOString(),
          })
          .eq("id", scheduledEmail.id);

        results.push({ id: scheduledEmail.id, success: false, error: errorMsg });
        failures.push({ emailType: scheduledEmail.email_type, recipient: scheduledEmail.recipient_email, leadId: scheduledEmail.lead_id, error: errorMsg });
      }
    }

    // Sammel-Alarm ans Team, falls dieser Lauf Versand-Fehlschläge hatte.
    // Bewusst NACH der Schleife (eine Mail statt einer pro Fehlschlag) und
    // gekapselt — darf den Lauf nie umwerfen.
    await notifyOpsOfFailures(smtpConfig, failures);
 
    const successCount = results.filter((r) => r.success).length;
    const flaggedCount = results.filter((r) => r.flagged).length;
    const failCount = results.filter((r) => !r.success && !r.flagged).length;

    return new Response(
      JSON.stringify({
        message: `Processed ${results.length} emails`,
        processed: results.length,
        bewertungen,
        success: successCount,
        failed: failCount,
        flagged: flaggedCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error in send-scheduled-emails:", errorMessage);
 
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});