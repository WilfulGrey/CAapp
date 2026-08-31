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
// Anrede-Namen sauber schreiben (Versalien → „Ruppert") — Kopie aus lib/email.ts,
// weil Edge Functions nicht aus lib/ importieren können. Siehe names.ts.
import { capitalizeName as capitalize } from "./names.ts";
// Nachtruhe-Fenster — Kopie von lib/quiet-hours.ts (Edge Fns koennen nicht aus
// lib/ importieren); Aenderungen immer in BEIDEN Dateien.
import { sendezeitIso } from "./quietHours.ts";
import { deutschStufe } from "./deutschStufe.ts";
// Empfehlung fuer die Angebotsmail (Martin, 31.08.2026): echte gematchte
// Pflegekraft statt der Behauptung "im Portal warten Pflegekraefte".
// Reihenfolge + Trichter sind Kopien der Portal-Logik — siehe empfehlung.ts.
import {
  empfehlungHtml,
  empfehlungText,
  holeEmpfehlung,
  keineEmpfehlungHtml,
  keineEmpfehlungText,
  stufenWort,
  type EmpfehlungErgebnis,
} from "./empfehlung.ts";
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
import {
  portalHerkunft,
  portalIntroHtml,
  portalIntroText,
  portalAngabenHinweisHtml,
  portalAngabenHinweisText,
  portalVorschauHtml,
  portalVorschauText,
  portalCtaButtonHtml,
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
 
const FEMALE_NAMES_SET = new Set(["aaliya","abby","ada","adela","adelheid","adeline","adriana","agata","agatha","agnes","aiko","aila","aileen","aimee","aisha","alana","alba","aleksandra","alexa","alexandra","alexia","alexis","alice","alicia","alina","alissa","aliyah","alke","allie","allison","alma","almut","alona","alva","alwine","amalia","amanda","amara","amaya","amelia","amelie","ami","amira","amy","ana","anastasia","andrea","andreja","angela","angelika","angelina","anita","anja","anna","annalena","anne","annegret","annelies","annelore","annette","anni","annika","antje","antonia","anuschka","aoife","arabell","ariadne","ariane","astrid","aurora","ava","babette","barbara","beatrice","beatrix","belen","bella","bente","berit","bernadette","bettina","bianca","birgit","birgitt","birgitta","birgitte","borbala","brigitta","brigitte","britt","brittany","bruna","brunhilde","camila","camilla","cara","carina","carla","carlotta","caro","carola","carolina","caroline","catharina","catharine","catrina","cecile","cecilia","charlotte","chiara","chloe","christel","christiane","christina","christine","claudia","claudine","constanze","corinna","cornelia","dagmar","dana","daniela","daria","deborah","diana","dina","dominique","dorothea","edda","edith","elena","eleonora","eliane","elisa","elisabeth","elizabeth","elke","ella","ellen","elsa","elsbeth","else","elvira","emilia","emma","erika","erna","ernestine","eva","eveline","evelyn","fatima","felicitas","filippa","fiona","franziska","frauke","frederike","frieda","gabriela","gabriele","gabi","gaby","gerda","gertrud","gisela","greta","gudrun","hanna","hannah","hannelore","heidemarie","heidi","heike","helene","helga","henriette","hildegard","hildegarde","hilke","hilde","ida","marta","ilona","ilse","imke","ines","ingeborg","ingrid","irina","iris","irmgard","irmtraud","isabel","isabelle","isadora","jacqueline","jana","janet","janna","jasmin","jennifer","jessica","jette","johanna","jolanta","josefine","josephine","julia","juliane","justine","karin","karla","katharina","katharine","kathrin","katja","katrin","katrina","katrine","klara","klaudia","klarissa","kordula","kristin","kristina","lara","larissa","laura","lea","leah","lena","leonie","leonora","lieselotte","lilli","lillian","lilly","lina","linda","lisa","lisbeth","lore","lori","lotte","lotta","louisa","louise","lucia","luisa","luise","luzie","lydia","magdalena","maja","malin","mara","margarita","margareta","margarethe","margit","margot","marianna","marie","marielle","marina","marita","marlene","marta","martina","mary","mathilde","maud","melanie","melinda","melissa","merle","mia","michelle","mira","miriam","mirja","monika","nadine","natalia","natalie","nathalie","nele","nicola","nicole","nina","nora","natascha","odette","olivia","ottilie","patrizia","paula","pauline","petra","pia","renate","ronja","rosa","rosalie","roswitha","ruth","sabrina","sandra","sara","sarah","silke","silvia","simona","simone","sina","sofia","sonja","sophie","stefanie","stella","stephanie","susanne","sybille","sylvia","tamara","tanja","tatjana","teresa","theresa","theres","tina","ulrike","ursula","uta","veronika","victoria","viola","virginia","walburga","waltraud","wanda","wiebke","wilhelmine","xenia","yvonne","zoe"]);
const MALE_NAMES_SET = new Set(["aaron","adam","alexander","alfred","alois","andre","andreas","axel","bastian","benedikt","benjamin","bernd","bo","burkhard","carsten","christian","christoph","claus","clemens","cornelius","damian","daniel","david","dieter","dietmar","dirk","dominik","edgar","elias","emilio","eric","erik","ernst","eugen","fabian","felix","finn","florian","frank","franz","frederik","gabriel","georg","gerhard","gottfried","guido","gunnar","hans","harry","hartmut","heinz","helge","helmut","henning","henrik","herbert","heiko","holger","horst","hubert","hugo","jakob","jan","jens","joachim","joe","joel","joerg","johannes","jonas","jonathan","jochen","kai","karl","kilian","Klaus","kevin","konrad","kristian","lars","leo","leon","leopold","lorenz","lothar","lucas","lukas","manfred","marco","markus","martin","matthias","max","maximilian","michael","mike","moritz","nikolaj","nikolaus","nils","norbert","oliver","oscar","oskar","otto","patrice","patrick","paul","peter","philipp","ralf","reinhard","richard","robert","rolf","sebastian","simon","stefan","steffen","stephan","steven","sven","thomas","thorsten","tillman","tim","tobias","tom","torsten","ulrich","uwe","valentin","victor","volker","werner","willi","will","wolf","wolfram","xaver"]);
 


// A name part is only usable in a greeting if it looks like a real name:
// at least one letter and no leftover bracketed notes like "(Sohn)". Guards
// against legacy/garbage data so we never greet "Hallo Herr (Sohn),".
function cleanNamePart(part?: string | null): string {
  if (!part) return "";
  const trimmed = part.trim();
  if (/[([{)\]}]/.test(trimmed)) return "";            // bracketed note, e.g. "(Sohn)"
  if (!/[A-Za-zÀ-ÿ]/.test(trimmed)) return "";          // no letters at all
  if (trimmed.replace(/\.$/, "").length < 2) return ""; // bare initial, e.g. "M" / "M."
  return trimmed;
}

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

function buildHalloAnrede(anrede: string | null, nachname: string, vorname: string): string {
  const effectiveAnrede = anrede || detectGenderFromName(vorname);
  const n = capitalize(cleanNamePart(nachname));
  if (effectiveAnrede === "Frau" && n) return `Hallo Frau ${n}`;
  if (effectiveAnrede === "Herr" && n) return `Hallo Herr ${n}`;
  if (effectiveAnrede === "Familie" && n) return `Hallo Familie ${n}`;
  // KEIN Vorname-Fallback (Martin 2026-08).
  // Salutation unknown → neutral, warm fallback (no name).
  return "Guten Tag";
}
 
function buildEmailWrapper(lead: Lead, siteUrl: string, content: string): string {
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
    @media only screen and (max-width: 600px) {
      .email-content { padding: 30px 20px; }
      .price-stage-cell { display: block !important; width: 100% !important; padding: 18px 22px 16px !important; border-right: none !important; border-bottom: 1px solid #ebe2d2 !important; }
      .price-stage-cell:last-child { border-bottom: none !important; }
      /* Empfehlungs-Karte: auf schmalen Schirmen Foto ueber den Text statt
         einer gequetschten Zweispalter. Outlook ignoriert Media-Queries und
         rendert weiter zweispaltig — dort sind 600 px fest, das passt. */
      .empf-foto { display: block !important; width: 100% !important; padding: 22px 24px 0 24px !important; }
      .empf-luecke { display: none !important; }
      .empf-text { display: block !important; width: 100% !important; padding: 14px 24px 18px 24px !important; }
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
            <div style="font-weight:600;font-size:15px;color:#3D2B1F;margin-bottom:6px;">Primundus Deutschland</div>
            <div style="font-size:13px;color:#666;line-height:1.8;">
              24h-Pflege und Betreuung zu Hause<br>
              <a href="tel:+4989200000830" style="color:#0066CC;text-decoration:none;">+49 89 200 000 830</a> |
              <a href="mailto:info@primundus.de" style="color:#0066CC;text-decoration:none;">info@primundus.de</a><br>
              <a href="https://primundus.de" style="color:#0066CC;text-decoration:none;">www.primundus.de</a>
            </div>
            <div style="font-size:12px;color:#999;margin-top:16px;line-height:1.5;">
              Diese E-Mail wurde versendet an: ${lead.email}<br>
              Primundus Deutschland<br><br>
              Sie erhalten diese E-Mail, weil Sie eine Kalkulation auf primundus.de angefordert haben.${lead.token ? `<br><a href="${siteUrl.replace(/\/$/, "")}/abmelden?token=${encodeURIComponent(lead.token)}" style="color:#999;text-decoration:underline;">Keine E-Mails mehr erhalten</a>` : ""}
            </div>
          </div>
        </div>
      </td></tr>
    </table>
  </div>
</body>
</html>`;
}
 
function buildMartaSig(siteUrl: string): string {
  // Martas Foto kommt aus primundus.de statt vom Kostenrechner (20.08.):
  // Beide Dienste deployen unabhaengig voneinander. Nach dem Foto-Wechsel
  // (#481) war die neue Datei auf primundus.de sofort da, der
  // Kostenrechner-Build haing >45 Min in Renders Warteschlange — in dieser
  // Zeit verlinkte JEDE Mail ein 404 (eine Kundenmail um 07:50 war
  // betroffen). Die Mail-Funktion deployt manuell und ist damit IMMER
  // schneller als der Kostenrechner; Bilder gehoeren deshalb an die
  // Adresse, die unabhaengig davon steht.
  const martaUrl = "https://primundus.de/images/marta-kapcio.jpg";
  const testUrl = `${siteUrl}/images/primundus_testsieger-2021.webp`;
  const mediaBase = `${siteUrl}/images/media`;
  return `
    <p style="font-size:16px;line-height:1.7;color:#555;margin-top:24px;margin-bottom:16px;">Mit freundlichen Grüßen<br><strong style="color:#3D2B1F;">Marta Kapcio</strong></p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px 0;border:1px solid #e8ddd0;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:18px 20px 16px;background:#ffffff;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="vertical-align:top;">
                <table cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td style="padding-right:12px;vertical-align:top;">
                      <img src="${martaUrl}" alt="Marta Kapcio" width="60" style="display:block;width:60px;height:auto;border-radius:8px;" />
                    </td>
                    <td style="vertical-align:middle;">
                      <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#3D2B1F;white-space:nowrap;">Marta Kapcio</p>
                      <p style="margin:0 0 2px;font-size:13px;color:#555;white-space:nowrap;">Pflegeberaterin</p>
                      <p style="margin:0;font-size:12px;color:#9a8a73;white-space:nowrap;">Mo – So, 8 – 20 Uhr</p>
                    </td>
                  </tr>
                </table>
                <table cellpadding="0" cellspacing="0" role="presentation" style="margin-top:12px;">
                  <tr><td style="padding-bottom:6px;">
                    <a href="tel:+4989200000830" style="display:inline-block;background-color:#f0ebe4;border-radius:20px;padding:8px 16px;text-decoration:none;font-size:13px;font-weight:500;color:#3D2B1F;white-space:nowrap;">&#9990; 089 200 000 830</a>
                  </td></tr>
                  <tr><td>
                    <a href="https://wa.me/4989200000830" style="display:inline-block;background-color:#25D366;border-radius:20px;padding:8px 16px;text-decoration:none;font-size:13px;font-weight:600;color:#ffffff;white-space:nowrap;">WhatsApp schreiben</a>
                  </td></tr>
                </table>
              </td>
              <td style="vertical-align:top;text-align:right;">
                <table cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e8ddd0;border-radius:8px;overflow:hidden;margin-left:auto;">
                  <tr>
                    <td style="padding:8px 10px;background:#ffffff;text-align:center;vertical-align:top;">
                      <img src="${testUrl}" alt="Testsieger DIE WELT" width="64" style="display:block;width:64px;height:auto;margin:0 auto 5px;" />
                      <p style="margin:0 0 1px;font-size:11px;font-weight:700;color:#3D2B1F;white-space:nowrap;">6× Testsieger <span style="color:#B5A184;">DIE WELT</span></p>
                      <p style="margin:0;font-size:10px;color:#888;line-height:1.4;">Preis, Qualität &amp;<br>Kundenservice</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="background:#f9f6f2;border-top:1px solid #e8ddd0;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="padding:12px 0;text-align:center;width:33%;border-right:1px solid #e8ddd0;">
                <p style="margin:0;font-size:12px;color:#555;line-height:1.4;">Über 20 Jahre<br>Erfahrung</p>
              </td>
              <td style="padding:12px 0;text-align:center;width:33%;border-right:1px solid #e8ddd0;">
                <p style="margin:0;font-size:12px;color:#555;line-height:1.4;">60.000+<br>betreute Einsätze</p>
              </td>
              <td style="padding:12px 0;text-align:center;width:33%;">
                <p style="margin:0;font-size:12px;color:#555;line-height:1.4;">Persönlicher<br>Ansprechpartner,<br>7&nbsp;Tage/Woche</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="background:#ffffff;border-top:1px solid #e8ddd0;padding:12px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
            <td style="text-align:center;vertical-align:middle;padding:0 4px;"><img src="${mediaBase}/die-welt.webp" alt="DIE WELT" height="14" style="display:inline-block;height:14px;width:auto;opacity:0.4;filter:grayscale(100%);" /></td>
            <td style="text-align:center;vertical-align:middle;padding:0 4px;"><img src="${mediaBase}/frankfurter-allgemeine.webp" alt="FAZ" height="14" style="display:inline-block;height:14px;width:auto;opacity:0.4;filter:grayscale(100%);" /></td>
            <td style="text-align:center;vertical-align:middle;padding:0 4px;"><img src="${mediaBase}/ard.webp" alt="ARD" height="14" style="display:inline-block;height:14px;width:auto;opacity:0.4;filter:grayscale(100%);" /></td>
            <td style="text-align:center;vertical-align:middle;padding:0 4px;"><img src="${mediaBase}/ndr.webp" alt="NDR" height="14" style="display:inline-block;height:14px;width:auto;opacity:0.4;filter:grayscale(100%);" /></td>
            <td style="text-align:center;vertical-align:middle;padding:0 4px;"><img src="${mediaBase}/sat1.webp" alt="SAT.1" height="14" style="display:inline-block;height:14px;width:auto;opacity:0.4;filter:grayscale(100%);" /></td>
            <td style="text-align:center;vertical-align:middle;padding:0 4px;"><img src="${mediaBase}/bild-der-frau.webp" alt="Bild der Frau" height="14" style="display:inline-block;height:14px;width:auto;opacity:0.4;filter:grayscale(100%);" /></td>
          </tr></table>
        </td>
      </tr>
    </table>`;
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

type LeadMilestone = "none" | "portal_opened" | "patient_data_saved" | "caregiver_invited";

async function getLeadMilestone(supabase: any, leadId: string): Promise<LeadMilestone> {
  const { data } = await supabase
    .from("lead_events")
    .select("event_type")
    .eq("lead_id", leadId)
    .in("event_type", ["portal_opened", "patient_data_saved", "caregiver_invited"]);
  if (!data || data.length === 0) return "none";
  const types = new Set(data.map((e: { event_type: string }) => e.event_type));
  if (types.has("caregiver_invited")) return "caregiver_invited";
  if (types.has("patient_data_saved")) return "patient_data_saved";
  if (types.has("portal_opened")) return "portal_opened";
  return "none";
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
//   patient_data_saved → Daten vollständig, aber noch keine Einladung
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

// Nachfass-2: kürzer + persönlicher als Nachfass-1. Statt Re-Marketing
// ("hier sind unsere Konditionen") direkt fragen "brauchen Sie noch
// Hilfe?". Je nach Milestone leichte Variation in der Hilfe-Frage.
function nachfass2Content(milestone: LeadMilestone): { intro: string; cta: string } {
  if (milestone === "patient_data_saved") {
    return {
      intro: "gute Nachricht: Wir haben passende Pflegekräfte für Ihre Betreuung gefunden. Möchten Sie sie selbst im Portal ansehen und Ihre Favoriten zur Bewerbung einladen — oder soll ich das für Sie übernehmen? Ein kurzer Anruf oder eine Antwort auf diese Mail genügt, ich kümmere mich gern.",
      cta: "Pflegekräfte ansehen →",
    };
  }
  if (milestone === "portal_opened") {
    return {
      intro: "brauchen Sie Hilfe beim Beschreiben der Pflegesituation? Antworten Sie einfach kurz oder rufen Sie mich an — ich helfe Ihnen gern.",
      cta: "Pflegesituation beschreiben →",
    };
  }
  return {
    intro: "für Sie stehen Pflegekräfte bereit, die Ihre Betreuung übernehmen würden. Damit sie sich bei Ihnen bewerben können, fehlen im Portal noch ein paar Angaben zu Ihrer Pflegesituation. Das müssen Sie nicht allein machen — rufen Sie mich an oder antworten Sie kurz auf diese Mail, wir gehen es gemeinsam durch. Danach kommen die Bewerbungen ganz unverbindlich zu Ihnen.",
    cta: "Angaben vervollständigen →",
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

// Pflegeheim-Vergleich (Martin, 14.08.): das emotionalste Argument des
// Angebots (Portal-Block „Was bleibt für Sie übrig") — die Zahl pro Kunde
// kommt aus SEINER Kalkulation (Pflegegeld nach Pflegegrad, Entlastungs-
// budget, Steuervorteil), NIE pauschal. Fehlt die Kalkulation oder liegt
// der Eigenanteil über dem Heim-Schnitt, erscheint der Kasten NICHT —
// wir rechnen niemandem etwas schön. Quelle Heim-Wert: vdek-Bundes-
// durchschnitt, Stand 01.07.2026 — bei neuen Werten (01.01./01.07.) hier
// UND im Portal (CustomerPortalPage, HEIM_EIGENANTEIL) aktualisieren.
const HEIM_EIGENANTEIL = 3364;
export function heimVergleichDaten(lead: Lead): { eigen: number; diff: number; pgText: string } | null {
  const k = lead.kalkulation || {};
  const eigen = typeof k.eigenanteil === "number" ? Math.round(k.eigenanteil) : NaN;
  if (!Number.isFinite(eigen) || eigen <= 0 || eigen >= HEIM_EIGENANTEIL) return null;
  const pg = k.formularDaten?.pflegegrad;
  const pgText = typeof pg === "number" && pg >= 1 ? ` (Pflegegrad ${pg})` : "";
  return { eigen, diff: HEIM_EIGENANTEIL - eigen, pgText };
}
const fmtEuro0 = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " €";
export function buildHeimVergleichBoxHtml(lead: Lead): string {
  const d = heimVergleichDaten(lead);
  if (!d) return "";
  return `
    <div style="margin:18px 0;padding:16px 18px;background:#F3F8F4;border:1px solid #cfe3d4;border-radius:12px;">
      <p style="margin:0;font-size:14px;line-height:1.7;color:#444;"><strong style="color:#2D1F0F;">Und im Vergleich zum Pflegeheim?</strong> Im Pflegeheim zahlen Familien im Bundesdurchschnitt <strong style="color:#2D1F0F;">${fmtEuro0(HEIM_EIGENANTEIL)} Eigenanteil im Monat</strong> (vdek, Stand 07/2026). Bei Ihrer Betreuung zu Hause liegt der rechnerische Eigenanteil auf Basis Ihrer Angaben${d.pgText} bei <strong style="color:#2D1F0F;">ca. ${fmtEuro0(d.eigen)}</strong> &ndash; rund <strong style="color:#1F7A46;">${fmtEuro0(d.diff)} weniger, Monat für Monat</strong>. Die genaue Rechnung sehen Sie in Ihrem Angebot unter &bdquo;Alle Kosten im Überblick&ldquo;.</p>
    </div>`;
}
export function buildHeimVergleichText(lead: Lead): string {
  const d = heimVergleichDaten(lead);
  if (!d) return "";
  return `Und im Vergleich zum Pflegeheim? Im Pflegeheim zahlen Familien im Bundesdurchschnitt ${fmtEuro0(HEIM_EIGENANTEIL)} Eigenanteil im Monat (vdek, Stand 07/2026). Bei Ihrer Betreuung zu Hause liegt der rechnerische Eigenanteil auf Basis Ihrer Angaben${d.pgText} bei ca. ${fmtEuro0(d.eigen)} — rund ${fmtEuro0(d.diff)} weniger, Monat für Monat. Die genaue Rechnung sehen Sie in Ihrem Angebot unter „Alle Kosten im Überblick".

`;
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

// ─── Profil-Nudges (gegen den 58%-Abbruch Portal-geöffnet → Profil) ──────
// Zwei dedizierte Mails, die NUR feuern solange das Patientenprofil offen
// ist (Skip-Logik im Handler: patient_data_saved / gebucht / nicht-int. /
// eingeladen → cancel). Anker: "5 vorbereitete Pflegekräfte".

// Profil-Nudges v3 (Texte wortwoertlich von Martin freigegeben, 20.07. abends):
// Einstieg = Dank + „Ihr Angebot haben Sie erhalten" (Kunde weiss, wo er steht),
// dann der Schwenk auf die Pflegekraefte (passen + gerade verfuegbar, unverbindlich).
// Kein „schwierig auszufuellen", kein „es eilt nicht", keine Verknappung.
export function buildProfilNudge1Html(lead: Lead, siteUrl: string, portalBase: string): string {
  const portalUrl = (portalBase && lead.token) ? withMailMark(buildPortalUrl(portalBase, lead.token), "pn1") : siteUrl;
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  const content = `
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${halloAnrede},</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">Ihr Angebot haben Sie bereits &ndash; doch wichtiger als jedes Angebot ist die Frage: Wer wird Ihren Angehörigen betreuen? Bei uns sehen Sie genau das vorab. Sie lernen die Pflegekräfte mit Foto, Erfahrung und Anreisedatum kennen und entscheiden erst dann &ndash; bevor irgendein Vertrag geschlossen wird. Keine Katze im Sack.</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">Im Moment geht das noch nicht: Ohne ein paar Angaben zur Pflegesituation können sich keine Pflegekräfte bei Ihnen bewerben. Ein Teil ist aus dem Kostenrechner schon übernommen &ndash; danach sehen Sie sofort, welche Pflegekräfte passen und verfügbar sind. Ihre Wunsch-Pflegekraft könnte die Betreuung <strong>bereits in 4&ndash;7 Werktagen</strong> übernehmen.</p>
    ${buildHeimVergleichBoxHtml(lead)}
    ${bulletproofButton(portalUrl, "Pflegesituation beschreiben&nbsp;&nbsp;&rarr;", "#2A9D5C")}
    <p style="font-size:13px;line-height:1.6;color:#888;margin:18px 0 0;">PS: Klappt im Portal etwas nicht, oder möchten Sie das lieber persönlich klären? Sie erreichen mich unter <a href="tel:+4989200000830" style="color:#8B7355;text-decoration:none;">089&nbsp;200&nbsp;000&nbsp;830</a> oder per <a href="https://wa.me/4989200000830" style="color:#8B7355;text-decoration:none;">WhatsApp</a>.</p>
    ${buildMartaSig(siteUrl)}`;
  return buildEmailWrapper(lead, siteUrl, content);
}

export function buildProfilNudge1Text(lead: Lead, siteUrl: string, portalBase: string): string {
  const portalUrl = (portalBase && lead.token) ? withMailMark(buildPortalUrl(portalBase, lead.token), "pn1") : siteUrl;
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  return `${halloAnrede},

Ihr Angebot haben Sie bereits — doch wichtiger als jedes Angebot ist die Frage: Wer wird Ihren Angehörigen betreuen? Bei uns sehen Sie genau das vorab. Sie lernen die Pflegekräfte mit Foto, Erfahrung und Anreisedatum kennen und entscheiden erst dann — bevor irgendein Vertrag geschlossen wird. Keine Katze im Sack.

Im Moment geht das noch nicht: Ohne ein paar Angaben zur Pflegesituation können sich keine Pflegekräfte bei Ihnen bewerben. Ein Teil ist aus dem Kostenrechner schon übernommen — danach sehen Sie sofort, welche Pflegekräfte passen und verfügbar sind. Ihre Wunsch-Pflegekraft könnte die Betreuung bereits in 4–7 Werktagen übernehmen.

${buildHeimVergleichText(lead)}

Pflegesituation beschreiben: ${portalUrl}

PS: Klappt im Portal etwas nicht, oder möchten Sie das lieber persönlich klären? Sie erreichen mich unter 089 200 000 830 oder per WhatsApp (https://wa.me/4989200000830).

Mit freundlichen Grüßen
Marta Kapcio

---
Primundus Deutschland | +49 89 200 000 830 | www.primundus.de`;
}

function buildProfilNudge2Html(lead: Lead, siteUrl: string, portalBase: string): string {
  const portalUrl = (portalBase && lead.token) ? withMailMark(buildPortalUrl(portalBase, lead.token), "pn2") : siteUrl;
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  const content = `
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${halloAnrede},</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">Sie haben bisher keine unverbindlichen Bewerbungen erhalten &ndash; und können deshalb nicht sehen, welche Pflegekräfte die Betreuung übernehmen möchten. Dazu fehlen nur einige Angaben zur Pflegesituation.</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">Soll ich das gemeinsam mit Ihnen ausfüllen? Rufen Sie mich einfach an &ndash; <a href="tel:+4989200000830" style="color:#8B7355;text-decoration:none;font-weight:600;">089&nbsp;200&nbsp;000&nbsp;830</a> &ndash; oder schreiben Sie mir per <a href="https://wa.me/4989200000830" style="color:#8B7355;text-decoration:none;font-weight:600;">WhatsApp</a>, wann es Ihnen passt.</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">Oder Sie erledigen es direkt selbst: einmal klicken, Angaben vervollständigen, Bewerbungen erhalten. Kostenfrei und unverbindlich.</p>
    ${bulletproofButton(portalUrl, "Angaben vervollständigen&nbsp;&nbsp;&rarr;", "#2A9D5C")}
    <p style="font-size:13px;line-height:1.6;color:#888;margin:18px 0 0;">PS: Klappt im Portal etwas nicht, oder möchten Sie das lieber persönlich klären? Sie erreichen mich unter <a href="tel:+4989200000830" style="color:#8B7355;text-decoration:none;">089&nbsp;200&nbsp;000&nbsp;830</a> oder per <a href="https://wa.me/4989200000830" style="color:#8B7355;text-decoration:none;">WhatsApp</a>.</p>
    ${buildMartaSig(siteUrl)}`;
  return buildEmailWrapper(lead, siteUrl, content);
}

function buildProfilNudge2Text(lead: Lead, siteUrl: string, portalBase: string): string {
  const portalUrl = (portalBase && lead.token) ? withMailMark(buildPortalUrl(portalBase, lead.token), "pn2") : siteUrl;
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  return `${halloAnrede},

Sie haben bisher keine unverbindlichen Bewerbungen erhalten — und können deshalb nicht sehen, welche Pflegekräfte die Betreuung übernehmen möchten. Dazu fehlen nur einige Angaben zur Pflegesituation.

Soll ich das gemeinsam mit Ihnen ausfüllen? Rufen Sie mich einfach an — 089 200 000 830 — oder schreiben Sie mir per WhatsApp (https://wa.me/4989200000830), wann es Ihnen passt.

Oder Sie erledigen es direkt selbst: einmal klicken, Angaben vervollständigen, Bewerbungen erhalten. Kostenfrei und unverbindlich.

Angaben vervollständigen: ${portalUrl}

PS: Klappt im Portal etwas nicht, oder möchten Sie das lieber persönlich klären? Sie erreichen mich unter 089 200 000 830 oder per WhatsApp (https://wa.me/4989200000830).

Mit freundlichen Grüßen
Marta Kapcio

---
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

// "Neue Pflegekräfte verfügbar" — feuert +24h nach der letzten Einladung,
// wenn der Kunde keine Reaktion erhalten hat (Batch-Nachlade-Hinweis, passend
// zur Portal-Reveal-Logik). Bewusst kurz: kein Lob, keine Erklärung — nur der
// Hinweis, dass neue Vorschläge bereitstehen. Anrede/Wrapper/Signatur identisch
// zu den übrigen Mails (buildHalloAnrede).
function buildNeuePflegekraefteHtml(lead: Lead, siteUrl: string, portalBase: string): string {
  const portalUrl = (portalBase && lead.token) ? buildPortalUrl(portalBase, lead.token) : siteUrl;
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  const content = `
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${halloAnrede},</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">ich habe <strong>weitere passende Pflegekräfte</strong> für Sie herausgesucht. Schauen Sie sie sich gern an und laden Sie Ihre Wunschkräfte unverbindlich ein.</p>

    ${bulletproofButton(portalUrl, "Neue Pflegekräfte ansehen", "#2A9D5C")}

    <p style="font-size:15px;line-height:1.75;color:#444;margin:24px 0 18px;">Bei Fragen bin ich gerne für Sie da – telefonisch, per WhatsApp oder als Antwort auf diese E-Mail.</p>

    ${buildMartaSig(siteUrl)}`;
  return buildEmailWrapper(lead, siteUrl, content);
}

function buildNeuePflegekraefteText(lead: Lead, siteUrl: string, portalBase: string): string {
  const portalUrl = (portalBase && lead.token) ? buildPortalUrl(portalBase, lead.token) : siteUrl;
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  return `${halloAnrede},

ich habe weitere passende Pflegekräfte für Sie herausgesucht. Schauen Sie sie sich gern an und laden Sie Ihre Wunschkräfte unverbindlich ein:

${portalUrl}

Bei Fragen bin ich gerne für Sie da – telefonisch, per WhatsApp oder als Antwort auf diese E-Mail.

Mit freundlichen Grüßen
Marta Kapcio

---
Primundus Deutschland | +49 89 200 000 830 | www.primundus.de`;
}

function buildNachfass2Html(lead: Lead, siteUrl: string, portalBase: string, milestone: LeadMilestone): string {
  const portalUrl = (portalBase && lead.token) ? buildPortalUrl(portalBase, lead.token) : siteUrl;
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  const v = nachfass2Content(milestone);

  // Bewusst minimaler Aufbau: kurze persönliche Frage + ein CTA + Telefon-
  // Direktdraht. Kein Re-Marketing-Block, kein Testsieger-Strip, keine
  // Konditionen-Auflistung — die Mail soll wie eine Nachfrage vom Berater
  // klingen, nicht wie eine zweite Verkaufsmail.
  const content = `
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${halloAnrede},</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:18px;">${v.intro}</p>

    ${nachfassCtaButton(portalUrl, v.cta)}

    <p style="font-size:14px;line-height:1.65;color:#666;margin:20px 0 0;text-align:center;">
      Schreiben Sie kurz per <a href="https://wa.me/4989200000830" style="color:#25D366;text-decoration:none;font-weight:600;white-space:nowrap;">WhatsApp</a> oder rufen Sie an: <a href="tel:+4989200000830" style="color:#3D2B1F;text-decoration:none;font-weight:600;white-space:nowrap;">+49 89 200 000 830</a>
    </p>

    ${buildMartaSig(siteUrl)}`;

  return buildEmailWrapper(lead, siteUrl, content);
}

function buildNachfass2Text(lead: Lead, siteUrl: string, portalBase: string, milestone: LeadMilestone): string {
  const portalUrl = (portalBase && lead.token) ? buildPortalUrl(portalBase, lead.token) : siteUrl;
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  const v = nachfass2Content(milestone);
  return `${halloAnrede},

${v.intro}

${v.cta.replace(/ →$/, "")}: ${portalUrl}

Schreiben Sie kurz per WhatsApp: https://wa.me/4989200000830
Oder rufen Sie an: +49 89 200 000 830

Mit freundlichen Grüßen
Marta Kapcio

---
Primundus Deutschland | +49 89 200 000 830 | www.primundus.de`;
}

// Nachfass-3: "letzter Versuch" — Quick-Reaktion mit drei mailto-Buttons.
// Antworten kommen als normale Mail an info@primundus.de mit
// vordefiniertem Subject (inkl. Lead-ID damit das Team direkt zuordnen
// kann). Bewusst SEHR kurz — nicht überreden, nur Status abklopfen.
function buildNachfass3Html(lead: Lead, siteUrl: string): string {
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  const leadRef = lead.email || lead.id;
  const mailtoYes = `mailto:info@primundus.de?subject=${encodeURIComponent(`Habe noch Interesse — ${leadRef}`)}&body=${encodeURIComponent(`Hallo Marta,\n\nich habe noch Interesse, bitte melden Sie sich bei mir.\n\n${halloAnrede.replace(/^Hallo /, '')}`)}`;
  const mailtoLater = `mailto:info@primundus.de?subject=${encodeURIComponent(`Aktuell nicht — vielleicht später — ${leadRef}`)}&body=${encodeURIComponent(`Hallo Marta,\n\naktuell brauche ich noch keine Pflegekraft, vielleicht später.\n\n${halloAnrede.replace(/^Hallo /, '')}`)}`;
  const mailtoNo = `mailto:info@primundus.de?subject=${encodeURIComponent(`Doch nicht relevant — ${leadRef}`)}&body=${encodeURIComponent(`Hallo Marta,\n\nes hat sich erledigt, das Thema ist für mich nicht mehr relevant.\n\n${halloAnrede.replace(/^Hallo /, '')}`)}`;

  const content = `
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${halloAnrede},</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:18px;">ein letzter Versuch von meiner Seite — wie schaut's bei Ihnen aus? Klicken Sie kurz auf eines der Felder, damit ich weiß, woran ich bin:</p>

    ${bulletproofButton(mailtoYes, "Ja, habe Interesse — bitte melden", "#2A9D5C")}
    ${bulletproofButton(mailtoLater, "Aktuell nicht — vielleicht später", "#8B7355")}
    ${bulletproofButton(mailtoNo, "Doch nicht relevant", "#9CA3AF")}

    <p style="font-size:14px;line-height:1.65;color:#666;margin:22px 0 0;text-align:center;">
      Schreiben Sie kurz per <a href="https://wa.me/4989200000830" style="color:#25D366;text-decoration:none;font-weight:600;white-space:nowrap;">WhatsApp</a> oder rufen Sie an: <a href="tel:+4989200000830" style="color:#3D2B1F;text-decoration:none;font-weight:600;white-space:nowrap;">+49 89 200 000 830</a>
    </p>

    <p style="font-size:13px;line-height:1.6;color:#888;margin:22px 0 0;font-style:italic;">Falls wir nichts hören, melden wir uns nicht mehr — wir wollen Sie nicht stören.</p>

    ${buildMartaSig(siteUrl)}`;

  return buildEmailWrapper(lead, siteUrl, content);
}

function buildNachfass3Text(lead: Lead, _siteUrl: string): string {
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  const leadRef = lead.email || lead.id;
  return `${halloAnrede},

ein letzter Versuch von meiner Seite — wie schaut's bei Ihnen aus?

Antworten Sie kurz mit einer der drei Optionen:

Ja, habe Interesse — bitte melden:
mailto:info@primundus.de?subject=Habe noch Interesse — ${leadRef}

Aktuell nicht — vielleicht später:
mailto:info@primundus.de?subject=Aktuell nicht — ${leadRef}

Doch nicht relevant:
mailto:info@primundus.de?subject=Doch nicht relevant — ${leadRef}

Schreiben Sie kurz per WhatsApp: https://wa.me/4989200000830
Oder rufen Sie an: +49 89 200 000 830

Falls wir nichts hören, melden wir uns nicht mehr — wir wollen Sie nicht stören.

Mit freundlichen Grüßen
Marta Kapcio

---
Primundus Deutschland | +49 89 200 000 830 | www.primundus.de`;
}


const EINGANGS_LABELS: Record<string, Record<string, string>> = {
  betreuung_fuer: { "1-person": "1 Person", "ehepaar": "2 Personen" },
  mobilitaet: { "mobil": "Mobil", "rollator": "Eingeschränkt – Rollator", "rollstuhl": "Rollstuhl", "bettlaegerig": "Bettlägerig" },
  nachteinsaetze: { "nein": "Nein", "gelegentlich": "Gelegentlich", "taeglich": "Täglich (1×)", "mehrmals": "Mehrmals nachts" },
  deutschkenntnisse: { "grundlegend": "Grundlegend", "kommunikativ": "Kommunikativ", "sehr-gut": "Gut" },
  fuehrerschein: { "ja": "Ja", "nein": "Nein / nicht unbedingt" },
  geschlecht: { "egal": "Egal", "weiblich": "Weiblich", "maennlich": "Männlich" },
  erfahrung: { "keine": "Keine Anforderung", "wuenschenswert": "Wünschenswert", "zwingend": "Zwingend erforderlich" },
  weitere_personen: { "ja": "Ja", "nein": "Nein" },
  care_start_timing: { "sofort": "Sofort (4–7 Tage)", "2-4-wochen": "In 2–4 Wochen", "1-2-monate": "In 1–2 Monaten", "unklar": "Ich informiere mich nur" },
};

function eingangsLabel(key: string, val: string | undefined): string {
  if (!val) return "Nicht angegeben";
  return EINGANGS_LABELS[key]?.[val] || val;
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

export function buildEingangsbestaetigungHtml(
  lead: Lead,
  siteUrl: string,
  portalBase: string,
  isResubmit: boolean = false,
  /* Fertiger Empfehlungs-Block. undefined = gar keine Empfehlungs-Sektion
     (Portal-Leads, Altaufrufe). null = Sektion mit Ersatztext, weil noch
     keine Kraft feststeht. Die Mail funktioniert in allen drei Faellen. */
  empfehlungBlock?: string | null,
): string {
  const greeting = buildEingangsGreeting(lead);
  /* Eingekaufter Lead: der Kunde hat NICHT bei uns angefragt, sondern beim
     Portal — und wartet dort gerade auf mehrere Anbieter. Kopf, Betreff und
     beide Buttons haengen daran. Herkunft schlaegt Resubmit: ein
     eingekaufter Lead ist per Definition der erste Kontakt. */
  const herkunft = portalHerkunft(lead.source);
  // Steht eine echte Pflegekraft in der Mail? Steuert Einleitung, Reihenfolge
  // und ob der alte Sammel-CTA direkt unter dem Preis noch gebraucht wird.
  const hatEmpfehlung = typeof empfehlungBlock === "string" && empfehlungBlock.length > 0;
  const fd = (lead.kalkulation as any)?.formularDaten || {};
  const careStartTiming = (lead as any).care_start_timing || "";

  // Preis aus der Kalkulation (eigene DB). Tagessatz = Monatssatz / 30.
  const kalk = lead.kalkulation || {};
  const bruttopreis = kalk.bruttopreis || 0;
  const gesamteZuschuesse = kalk.zuschüsse?.gesamt || 0;
  const eigenanteil = kalk.eigenanteil || (bruttopreis - gesamteZuschuesse);
  const tagessatz = bruttopreis > 0 ? Math.round(bruttopreis / 30) : 0;
  const fmt = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const portalUrl = (portalBase && lead.token) ? buildPortalUrl(portalBase, lead.token) : "";
  const ctaUrl = portalUrl || siteUrl;

  // Wiederverwendbares Label-Styling (Preis-Bühne + Angaben-Sektionen).
  const psLabel = "font-size:11px;font-weight:700;color:#9a8a73;letter-spacing:.08em;text-transform:uppercase;";

  // ── Preis-Bühne: Preise + Konditionen + Testsieger in einer Klammer ───────
  // Angleichung an Website/Portal (Martin, 17.08.): Die Mail erzählte an drei
  // Stellen eine eigene Geschichte. Jetzt gilt überall dasselbe Vokabular —
  // die VIER Konditionen wortgleich zum Angebot-Kasten im Portal, die
  // Testsieger-Zeile wortgleich zur Portal-Zeile, und der Pflegeheim-Vergleich
  // (buildHeimVergleichBoxHtml) direkt unter den Preisen, weil dort schon der
  // Eigenanteil steht. Bestpreis-Garantie ist RAUS (Martin, 14.08.: „scheint
  // nicht zu ziehen") — sie lud zum Anbietervergleich ein statt zum Nutzen.
  const priceRows = bruttopreis > 0 ? `
      <tr>
        <td class="price-stage-cell" style="width:50%;padding:22px 24px 18px;border-right:1px solid #ebe2d2;vertical-align:top;">
          <p style="margin:0 0 8px;${psLabel}">Tagessatz</p>
          <p style="margin:0 0 4px;font-size:26px;font-weight:700;color:#2D1F0F;line-height:1.15;">${fmt(tagessatz)}&nbsp;€<span style="font-size:14px;font-weight:500;color:#9a8a73;"> / Tag</span></p>
          <p style="margin:0;font-size:12px;color:#9a8a73;line-height:1.5;">inkl. Steuern &amp; Sozialabgaben</p>
        </td>
        <td class="price-stage-cell" style="width:50%;padding:22px 24px 18px;vertical-align:top;">
          <p style="margin:0 0 8px;${psLabel}">Monatssatz</p>
          <p style="margin:0 0 4px;font-size:26px;font-weight:700;color:#2D1F0F;line-height:1.15;">${fmt(bruttopreis)}&nbsp;€<span style="font-size:14px;font-weight:500;color:#9a8a73;"> / Monat</span></p>
          <p style="margin:0;font-size:12px;color:#9a8a73;line-height:1.5;">rechn. Eigenanteil ca. ${fmt(eigenanteil)}&nbsp;€</p>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding:14px 24px 16px;border-top:1px solid #ebe2d2;">
          <p style="margin:0;font-size:13px;line-height:1.7;color:#666;">zzgl. ca. 125&nbsp;€ Anreise- und Abreisekosten je Strecke sowie Kost und Logis.</p>
        </td>
      </tr>` : "";

  /* Aufgeteilt in ZWEI Panels (Martin, 31.08.): die Empfehlung soll direkt
     nach den Preisen stehen, Konditionen und Testsieger danach. Optik,
     Farben und Innenabstaende bleiben identisch — es ist dieselbe Buehne,
     nur mit der Pflegekraft dazwischen. Ohne Empfehlung stehen beide
     Panels wie bisher unmittelbar untereinander. */
  const preisTabelle = priceRows ? `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 ${hatEmpfehlung ? "28px" : "0"};background:#FAF8F4;border-radius:10px;overflow:hidden;">
      ${priceRows}
    </table>` : "";

  const konditionenTabelle = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 28px;background:#FAF8F4;border-radius:10px;overflow:hidden;">
      <tr>
        <td colspan="2" style="padding:16px 24px 16px;">
          <p style="margin:0 0 10px;${psLabel}color:#2A9D5C;">Ihre Konditionen</p>
          ${["Täglich kündbar", "Tagesgenaue Abrechnung", "Pflegekraft vor Vertragsabschluss selbst auswählen", "Keine Vermittlungsgebühren"].map((t) => `<p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#2D1F0F;"><span style="color:#2A9D5C;font-weight:700;">&#10003;</span>&nbsp;&nbsp;${t}</p>`).join("")}
          <p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#666;">Kosten entstehen erst, wenn Ihre Pflegekraft vor Ort ist.</p>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding:16px 24px 20px;border-top:1px solid #ebe2d2;">
          <!-- Wie im Siegel: die ZAHL steht oben bei "Testsieger", "in Folge"
               kommt nur einmal darunter. Vorher trugen Etikett und Satz beides
               doppelt ("Testsieger · 6× in Folge" / "Testsieger – DIE WELT,
               6× in Folge") — direkt untereinander gelesen ein Stottern
               (Martin 28.08.2026). -->
          <p style="margin:0 0 6px;${psLabel}color:#B8860B;">6× Testsieger</p>
          <p style="margin:0;font-size:14px;line-height:1.65;color:#2D1F0F;"><strong>DIE&nbsp;WELT &ndash; 6× in Folge</strong>, mit über 20&nbsp;Jahren Erfahrung und 60.000 Betreuungseinsätzen.</p>
        </td>
      </tr>
    </table>
    ${buildHeimVergleichBoxHtml(lead)}`;

  /* Empfehlungs-Sektion. Drei Zustaende, alle bewusst:
       string  → echte Pflegekraft
       null    → wir haben (noch) keine → ehrlicher Ersatztext
       undefined → gar keine Sektion (Portal-Leads / Altaufrufe) */
  const empfehlungSektion =
    empfehlungBlock === undefined ? "" : (empfehlungBlock || keineEmpfehlungHtml());

  // ── "So geht es weiter" — 3 Schritte ──────────────────────────────────────
  const stepRow = (n: string, title: string, desc: string, last = false) => `
      <tr>
        <td style="vertical-align:top;width:38px;padding:0 12px ${last ? "0" : "14px"} 0;">
          <table cellpadding="0" cellspacing="0" role="presentation"><tr>
            <td width="26" height="26" align="center" valign="middle" bgcolor="#8B7355" style="background-color:#8B7355;width:26px;min-width:26px;max-width:26px;height:26px;border-radius:13px;padding:0;mso-line-height-rule:exactly;color:#ffffff;font-size:13px;font-weight:700;line-height:26px;text-align:center;">${n}</td>
          </tr></table>
        </td>
        <td style="vertical-align:top;padding:0 0 ${last ? "0" : "14px"} 0;">
          <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#2D1F0F;line-height:1.4;">${title}</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#555;">${desc}</p>
        </td>
      </tr>`;

  const stepsTable = `
    <p style="font-size:15px;line-height:1.75;color:#2D1F0F;margin:0 0 16px;"><strong>So geht es weiter:</strong></p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 26px;">
      ${stepRow("1", "Pflegesituation beschreiben", "Ein Teil ist aus dem Kostenrechner schon übernommen. Danach sehen Sie sofort, welche Pflegekräfte passen und verfügbar sind.")}
      ${stepRow("2", "Bewerbungen erhalten & Pflegekräfte einladen", "Passende Pflegekräfte bewerben sich bei Ihnen — mit Profil, Erfahrung und Anreisedatum. In der Zwischenzeit können Sie Wunschkandidatinnen gezielt einladen.")}
      ${stepRow("3", "Auswählen und starten", "Sie entscheiden, wir übernehmen den Rest. Ihre Wunsch-Pflegekraft kann die Betreuung bereits in 4–7 Werktagen übernehmen.", true)}
    </table>`;

  // ── CTA-Button (Gradient + Schatten, mit Outlook-Fallback) ────────────────
  /* Portal-Lead: derselbe Button wie oben. Zwei Farben in einer Mail
     lesen sich als zwei verschiedene Angebote (Martin 30.08.). Fuer alle
     anderen Leads bleibt der eingefuehrte gruene Button unangetastet —
     die Kette laeuft und ist gemessen. */
  const cta = herkunft
    ? portalCtaButtonHtml(ctaUrl, "Angebot &amp; passende Pflegekräfte ansehen", "8px auto 30px")
    : `
    <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 30px;border-collapse:separate;">
      <tr>
        <td align="center" bgcolor="#2A9D5C" style="background-color:#2A9D5C;background-image:linear-gradient(180deg,#34B36C 0%,#2A9D5C 100%);border-radius:10px;padding:17px 44px;box-shadow:0 2px 6px rgba(42,157,92,0.25);">
          <a href="${ctaUrl}" target="_blank" style="color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;letter-spacing:0.01em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.4;">Angebot &amp; Pflegekräfte ansehen&nbsp;&nbsp;→</a>
        </td>
      </tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->`;

  // ── Angaben im Überblick — zwei Sektionen, null-Werte ausgeblendet ────────
  const kvRow = (label: string, value: string) =>
    `<tr><td style="padding:4px 0;color:#888;width:55%;">${label}</td><td style="padding:4px 0;color:#2D1F0F;font-weight:600;">${value}</td></tr>`;

  const section1 = [
    kvRow("Betreuung für", eingangsLabel("betreuung_fuer", fd.betreuung_fuer)),
    kvRow("Pflegegrad", fd.pflegegrad ? `Pflegegrad ${fd.pflegegrad}` : "Nicht angegeben"),
    kvRow("Weitere Personen im Haushalt", eingangsLabel("weitere_personen", fd.weitere_personen)),
    kvRow("Mobilität", eingangsLabel("mobilitaet", fd.mobilitaet)),
    kvRow("Nachteinsätze erforderlich", eingangsLabel("nachteinsaetze", fd.nachteinsaetze)),
    kvRow("Gewünschter Start", eingangsLabel("care_start_timing", careStartTiming)),
  ].join("");

  const section2Parts = [kvRow("Deutschkenntnisse", eingangsLabel("deutschkenntnisse", fd.deutschkenntnisse))];
  if (fd.erfahrung) section2Parts.push(kvRow("Erfahrung", eingangsLabel("erfahrung", fd.erfahrung)));
  if (fd.fuehrerschein) section2Parts.push(kvRow("Führerschein", eingangsLabel("fuehrerschein", fd.fuehrerschein)));
  section2Parts.push(kvRow("Geschlecht der Pflegekraft", fd.geschlecht ? eingangsLabel("geschlecht", fd.geschlecht) : "Egal"));
  const section2 = section2Parts.join("");

  const angabenTable = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 8px;border:1px solid #ebe2d2;border-radius:10px;overflow:hidden;">
      <tr><td style="padding:12px 20px;background:#FAF8F4;border-bottom:1px solid #ebe2d2;"><p style="margin:0;${psLabel}">Pflegesituation &amp; Anforderungen</p></td></tr>
      <tr><td style="padding:14px 20px 16px;border-bottom:1px solid #ebe2d2;"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-size:14px;color:#555;line-height:1.7;">${section1}</table></td></tr>
      <tr><td style="padding:12px 20px;background:#FAF8F4;border-bottom:1px solid #ebe2d2;"><p style="margin:0;${psLabel}">Anforderungen an die Pflegekraft</p></td></tr>
      <tr><td style="padding:14px 20px 16px;"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-size:14px;color:#555;line-height:1.7;">${section2}</table></td></tr>
    </table>`;

  const introParagraph = herkunft
    ? portalIntroHtml(herkunft)
    : isResubmit
    ? `vielen Dank für Ihre erneute Anfrage.<br><br>Wir haben Ihre aktualisierten Angaben übernommen, Ihr <strong style="color:#2D1F0F;">persönliches Angebot</strong> angepasst${hatEmpfehlung ? " &ndash; und passende Betreuungskräfte für Sie gefunden" : ""}.`
    : `vielen Dank für Ihre Anfrage.<br><br>Auf Basis Ihrer Angaben haben wir Ihr <strong style="color:#2D1F0F;">persönliches Angebot</strong> erstellt${hatEmpfehlung ? " &ndash; und bereits passende Betreuungskräfte für Sie gefunden" : ""}.`;

  /* Bei eingekauften Leads sind nicht alle Angaben vom Kunden: was das
     Portal nicht liefert, nehmen wir bewusst zum teureren Wert an (lieber
     ein Preis, der faellt, als einer, der steigt). Das gehoert ueber die
     Tabelle geschrieben — sonst wundert sich der Kunde, woher wir Dinge
     wissen, die er nie gesagt hat. Gleichzeitig der beste Grund, das
     Portal zu oeffnen. */
  /* Welche Felder WIR gesetzt haben, legt api/portal-lead in der
     Kalkulation ab. Fehlt die Liste (Altbestand), nehmen wir den
     vorsichtigeren Text an: lieber zu viel Transparenz als zu wenig. */
  const angenommeneFelder = (lead.kalkulation as any)?.angenommene_felder;
  const wurdeAngenommen = !Array.isArray(angenommeneFelder) || angenommeneFelder.length > 0;
  const angabenHinweis = herkunft ? portalAngabenHinweisHtml(herkunft, wurdeAngenommen) : "";
  const vorschauBlock = herkunft ? portalVorschauHtml(siteUrl, ctaUrl) : "";

  const content = `
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${greeting},</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:24px;">${introParagraph}</p>

    ${vorschauBlock}

    ${preisTabelle}

    ${empfehlungSektion}

    ${konditionenTabelle}

    ${hatEmpfehlung ? "" : cta}

    ${stepsTable}

    ${hatEmpfehlung ? cta : ""}

    ${angabenHinweis}

    ${angabenTable}

    <p style="font-size:15px;line-height:1.75;color:#444;margin:30px 0 18px;">Wenn Sie Fragen haben oder Unterstützung möchten — rufen Sie mich an, schreiben Sie mir per WhatsApp oder antworten Sie einfach auf diese E-Mail. Ich bin gerne für Sie da.</p>

    ${buildMartaSig(siteUrl)}`;

  return buildEmailWrapper(lead, siteUrl, content);
}

export function buildEingangsbestaetigungText(
  lead: Lead,
  portalBase: string,
  isResubmit: boolean = false,
  empfehlungAbschnitt?: string | null,
): string {
  const greeting = buildEingangsGreeting(lead);
  const fd = (lead.kalkulation as any)?.formularDaten || {};
  const careStartTiming = (lead as any).care_start_timing || "";

  const portalUrl = (portalBase && lead.token) ? buildPortalUrl(portalBase, lead.token) : "";
  const ctaUrl = portalUrl || "https://primundus.de";

  const kalk = lead.kalkulation || {};
  const bruttopreis = kalk.bruttopreis || 0;
  const gesamteZuschuesse = kalk.zuschüsse?.gesamt || 0;
  const eigenanteil = kalk.eigenanteil || (bruttopreis - gesamteZuschuesse);
  const tagessatz = bruttopreis > 0 ? Math.round(bruttopreis / 30) : 0;
  const fmt = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
  const priceLine = bruttopreis > 0
    ? `Tagessatz: ${fmt(tagessatz)} / Tag (inkl. Steuern & Sozialabgaben)
Monatssatz: ${fmt(bruttopreis)} / Monat — rechn. Eigenanteil ca. ${fmt(eigenanteil)}
zzgl. ca. 125 € Anreise- und Abreisekosten je Strecke sowie Kost und Logis.

Ihre Konditionen:
  ✓ Täglich kündbar
  ✓ Tagesgenaue Abrechnung
  ✓ Pflegekraft vor Vertragsabschluss selbst auswählen
  ✓ Keine Vermittlungsgebühren
Kosten entstehen erst, wenn Ihre Pflegekraft vor Ort ist.

6× Testsieger
DIE WELT – 6× in Folge, mit über 20 Jahren Erfahrung und 60.000 Betreuungseinsätzen.

${buildHeimVergleichText(lead)}

`
    : "";

  const headerLine = portalHerkunft(lead.source)
    ? PORTAL_BETREFF
    : isResubmit
    ? "Ihr aktualisiertes Angebot zur 24-Stunden-Betreuung – Primundus"
    : "Ihr Angebot zur 24-Stunden-Betreuung – Primundus";

  const herkunftPlain = portalHerkunft(lead.source);
  const hatEmpfehlungPlain = typeof empfehlungAbschnitt === "string" && empfehlungAbschnitt.length > 0;
  const empfehlungPlain =
    empfehlungAbschnitt === undefined ? "" : `${empfehlungAbschnitt || keineEmpfehlungText()}\n\n`;

  const introPlain = herkunftPlain
    ? portalIntroText(herkunftPlain)
    : isResubmit
    ? `vielen Dank für Ihre erneute Anfrage.\n\nWir haben Ihre aktualisierten Angaben übernommen, Ihr persönliches Angebot angepasst${hatEmpfehlungPlain ? " – und passende Betreuungskräfte für Sie gefunden" : ""}.`
    : `vielen Dank für Ihre Anfrage.\n\nAuf Basis Ihrer Angaben haben wir Ihr persönliches Angebot erstellt${hatEmpfehlungPlain ? " – und bereits passende Betreuungskräfte für Sie gefunden" : ""}.`;

  const angenommeneFelderPlain = (lead.kalkulation as any)?.angenommene_felder;
  const wurdeAngenommenPlain = !Array.isArray(angenommeneFelderPlain) || angenommeneFelderPlain.length > 0;
  const angabenHinweisPlain = herkunftPlain ? portalAngabenHinweisText(herkunftPlain, wurdeAngenommenPlain) + "\n\n" : "";
  const vorschauPlain = herkunftPlain ? portalVorschauText(ctaUrl) + "\n\n" : "";

  // Sektion 2 (Anforderungen an die Pflegekraft) — null-Werte ausblenden.
  const anf: string[] = [`Deutschkenntnisse: ${eingangsLabel("deutschkenntnisse", fd.deutschkenntnisse)}`];
  if (fd.erfahrung) anf.push(`Erfahrung: ${eingangsLabel("erfahrung", fd.erfahrung)}`);
  if (fd.fuehrerschein) anf.push(`Führerschein: ${eingangsLabel("fuehrerschein", fd.fuehrerschein)}`);
  anf.push(`Geschlecht der Pflegekraft: ${fd.geschlecht ? eingangsLabel("geschlecht", fd.geschlecht) : "Egal"}`);

  return `${headerLine}

${greeting},

${introPlain}

${vorschauPlain}${priceLine}${empfehlungPlain}Angebot & Pflegekräfte ansehen: ${ctaUrl}

SO GEHT ES WEITER

1. Pflegesituation beschreiben — ein Teil ist aus dem Kostenrechner schon übernommen. Danach sehen Sie sofort, welche Pflegekräfte passen und verfügbar sind.
2. Bewerbungen erhalten & Pflegekräfte einladen — passende Pflegekräfte bewerben sich bei Ihnen, mit Profil, Erfahrung und Anreisedatum. In der Zwischenzeit können Sie Wunschkandidatinnen gezielt einladen.
3. Auswählen und starten — Sie entscheiden, wir übernehmen den Rest. Ihre Wunsch-Pflegekraft kann die Betreuung bereits in 4–7 Werktagen übernehmen.

PFLEGESITUATION & ANFORDERUNGEN

${angabenHinweisPlain}Betreuung für: ${eingangsLabel("betreuung_fuer", fd.betreuung_fuer)}
Pflegegrad: ${fd.pflegegrad ? `Pflegegrad ${fd.pflegegrad}` : "Nicht angegeben"}
Weitere Personen im Haushalt: ${eingangsLabel("weitere_personen", fd.weitere_personen)}
Mobilität: ${eingangsLabel("mobilitaet", fd.mobilitaet)}
Nachteinsätze erforderlich: ${eingangsLabel("nachteinsaetze", fd.nachteinsaetze)}
Gewünschter Start: ${eingangsLabel("care_start_timing", careStartTiming)}

ANFORDERUNGEN AN DIE PFLEGEKRAFT

${anf.join("\n")}

Wenn Sie Fragen haben oder Unterstützung möchten — rufen Sie mich an, schreiben Sie mir per WhatsApp oder antworten Sie einfach auf diese E-Mail. Ich bin gerne für Sie da.

Mit freundlichen Grüßen
Marta Kapcio

---
Primundus Deutschland | 24h-Pflege und Betreuung
Telefon: +49 89 200 000 830 | E-Mail: info@primundus.de
www.primundus.de`;
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
  cc?: string
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
// Berufserfahren (Jahre>0) bzw. Neu dabei. Kein Medaillen-Badge mehr — die
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

// ─────────────────────────────────────────────────────────────────────────
// "Warum Primundus?" — Trust-Mail (USP-Liste). Eigenständige Nurture-Mail,
// ~48h nach der Eingangsbestätigung (Vergleichsphase: der Kunde checkt
// gerade andere Anbieter). Cancelt sich, sobald der Lead beauftragt oder
// nicht interessiert ist. Argument: die vier Kern-USPs (Kräfte vorab
// sehen, keine Bindung, keine Vermittlungsgebühr, fester Ansprechpartner).
// ─────────────────────────────────────────────────────────────────────────
export function buildWarumPrimundusHtml(lead: Lead, portalUrl: string, siteUrl: string): string {
  const greeting = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");

  // Runde Marke: Maße gehoeren ins CSS, nicht nur in width=/height=.
  // Mail-Clients werfen die Attribute weg und rechnen den Innenabstand
  // der Spalte mit — aus dem Kreis wird sonst ein Ei (26.08.2026:
  // gemessen 11,8 x 22 px). Pixel-Radius statt 50%, Spalte breit genug.
  const usp = (title: string, desc: string) => `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 12px;">
      <tr>
        <td style="vertical-align:top;width:34px;padding:2px 12px 0 0;">
          <table cellpadding="0" cellspacing="0" role="presentation"><tr>
            <td width="22" height="22" align="center" valign="middle" bgcolor="#2A9D5C" style="background-color:#2A9D5C;width:22px;min-width:22px;max-width:22px;height:22px;border-radius:11px;padding:0;mso-line-height-rule:exactly;color:#ffffff;font-size:13px;font-weight:700;line-height:22px;text-align:center;">&#10003;</td>
          </tr></table>
        </td>
        <td style="vertical-align:top;">
          <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#2D1F0F;line-height:1.4;">${title}</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#555;">${desc}</p>
        </td>
      </tr>
    </table>`;

  // Nutzen-first statt Anbieter-Lob (Martin, 14.08.): jeder Punkt beginnt
  // mit dem, was der Kunde davon hat; Vertragsvorteile eingewoben.
  // Bestpreis-Garantie bewusst raus („scheint nicht zu ziehen"); Punkt 1
  // betont den Bestand („Tausende bewährte Pflegekräfte"), nicht Features.
  const uspBlock =
    usp("Sie wissen vorher, wer ins Haus kommt.", "Tausende bewährte Pflegekräfte in unserem Bestand &mdash; Sie sehen vorab, wer die Betreuung übernehmen möchte, und entscheiden in Ruhe.") +
    usp("Sie binden sich nicht.", "Kein Vertrag vor Auswahl, täglich kündbar, tagesgenaue Abrechnung &mdash; Kosten erst ab Anreise der Pflegekraft.") +
    usp("Sie zahlen nie zu viel.", "Keine Vermittlungsgebühren &mdash; als Direktanbieter sparen wir die Vermittler-Provision: Die Pflegekraft verdient mehr, und Sie zahlen trotzdem weniger.") +
    usp("Sie sind nie allein.", "Persönlicher Ansprechpartner 7 Tage die Woche &mdash; mit der Erfahrung aus über 60.000 Einsätzen, 6× in Folge als Testsieger von DIE WELT ausgezeichnet.");

  const content = `
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${greeting},</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:18px;">Sie vergleichen gerade Anbieter für die 24-Stunden-Betreuung? Dann zählt am Ende nur, was Sie davon haben:</p>
    ${uspBlock}
    ${buildHeimVergleichBoxHtml(lead)}
    ${bulletproofButton(portalUrl, "Pflegekräfte im Portal ansehen →")}
    <p style="font-size:14px;line-height:1.65;color:#555;margin:0 0 4px;">Fragen zum Preis oder zur Betreuung? Rufen Sie mich gerne <a href="tel:+4989200000830" style="color:#0066CC;text-decoration:none;white-space:nowrap;">direkt an</a> oder schreiben Sie per <a href="https://wa.me/4989200000830" style="color:#25D366;text-decoration:none;font-weight:600;white-space:nowrap;">WhatsApp</a> &mdash; oder antworten Sie einfach auf diese E-Mail.</p>
    ${buildMartaSig(siteUrl)}`;

  return buildEmailWrapper(lead, siteUrl, content);
}

export function buildWarumPrimundusText(lead: Lead, portalUrl: string): string {
  const greeting = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  return `${greeting},

Sie vergleichen gerade Anbieter für die 24-Stunden-Betreuung? Dann zählt am Ende nur, was Sie davon haben:

✓ Sie wissen vorher, wer ins Haus kommt. Tausende bewährte Pflegekräfte in unserem Bestand — Sie sehen vorab, wer die Betreuung übernehmen möchte, und entscheiden in Ruhe.
✓ Sie binden sich nicht. Kein Vertrag vor Auswahl, täglich kündbar, tagesgenaue Abrechnung — Kosten erst ab Anreise der Pflegekraft.
✓ Sie zahlen nie zu viel. Keine Vermittlungsgebühren — als Direktanbieter sparen wir die Vermittler-Provision: Die Pflegekraft verdient mehr, und Sie zahlen trotzdem weniger.
✓ Sie sind nie allein. Persönlicher Ansprechpartner 7 Tage die Woche — mit der Erfahrung aus über 60.000 Einsätzen, 6× in Folge als Testsieger von DIE WELT ausgezeichnet.

${buildHeimVergleichText(lead)}Pflegekräfte im Portal ansehen: ${portalUrl}

Fragen zum Preis oder zur Betreuung? Rufen Sie mich gerne direkt an (089 200 000 830) oder schreiben Sie per WhatsApp (wa.me/4989200000830) — oder antworten Sie einfach auf diese E-Mail.

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
    .select("id, vorname, nachname, anrede_text, token, email, status, created_at")
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
    const r = await sendEmailSmtp(
      smtpConfig, lead.email!, tpl.subject, tpl.html, tpl.text,
      undefined, false, BEWERTUNG_CC,
    );
    if (r.success) {
      gesendet++;
      const nowIso = new Date().toISOString();
      await supabase.from("scheduled_emails").insert({
        lead_id: lead.id,
        email_type: "bewertungsanfrage",
        recipient_email: lead.email,
        scheduled_for: nowIso,
        status: "sent",
        sent_at: nowIso,
      });
      await supabase.from("lead_events").insert({
        lead_id: lead.id,
        event_type: "email_bewertungsanfrage_sent",
        metadata: { to: lead.email, cc: BEWERTUNG_CC, ausloeser: "tag7" },
      });
    } else {
      zaehle("versand_fehler");
    }
  }
  return { gesendet, uebersprungen };
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
      const ms = (demoBody.milestone || "none") as LeadMilestone;
      const pu = (portalBase && (lead as Lead).token) ? buildPortalUrl(portalBase, (lead as Lead).token) : site;

      const render = (t: string): { subject: string; html: string; text: string } => {
        switch (t) {
          case "eingangsbestaetigung": return { subject: "Ihr persönliches Angebot zur 24-Stunden-Betreuung", html: buildEingangsbestaetigungHtml(lead as Lead, site, portalBase), text: buildEingangsbestaetigungText(lead as Lead, portalBase) };
          case "profil_nudge_1": return { subject: "Pflegekräfte können sich noch nicht bei Ihnen bewerben", html: buildProfilNudge1Html(lead as Lead, site, portalBase), text: buildProfilNudge1Text(lead as Lead, site, portalBase) };
          case "profil_nudge_2": return { subject: "Profil unvollständig — Sie können noch keine Bewerbungen erhalten", html: buildProfilNudge2Html(lead as Lead, site, portalBase), text: buildProfilNudge2Text(lead as Lead, site, portalBase) };
          case "warum_primundus": return { subject: "Warum Familien sich für Primundus entscheiden", html: buildWarumPrimundusHtml(lead as Lead, withMailMark(pu, "wp"), site), text: buildWarumPrimundusText(lead as Lead, withMailMark(pu, "wp")) };
          case "nachfass_2": return { subject: "Ihre Betreuung — kann ich Ihnen etwas abnehmen?", html: buildNachfass2Html(lead as Lead, site, portalBase, ms), text: buildNachfass2Text(lead as Lead, site, portalBase, ms) };
          case "nachfass_3": return { subject: "Eine letzte Frage — wie schaut's bei Ihnen aus?", html: buildNachfass3Html(lead as Lead, site), text: buildNachfass3Text(lead as Lead, site) };
          case "profil_nudge_3": return { subject: "Können wir Sie bei etwas unterstützen?", html: buildProfilNudge3Html(lead as Lead, site, portalBase), text: buildProfilNudge3Text(lead as Lead, site, portalBase) };
          case "reaktivierung_wechsel": return { subject: "Steht bei Ihnen ein Pflegekraft-Wechsel an?", html: buildReaktivierungWechselHtml(lead as Lead, site, portalBase), text: buildReaktivierungWechselText(lead as Lead, site, portalBase) };
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
          const r = await sendEmailSmtp(smtpConfig, to, subject, html, text, undefined, demoBody.skipBcc === true);
          results.push({ email_type: item.email_type, to, subject, ...r });
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

        // Empfänger IMMER frisch aus dem Lead. scheduled_emails.recipient_email
        // ist nur eine Kopie vom Zeitpunkt der Einplanung — korrigiert jemand die
        // Adresse (Admin-Kontaktformular), würde die geplante Mail sonst weiter
        // an die alte Adresse gehen. Der Snapshot bleibt Fallback für Alt-Zeilen
        // ohne lead.email. Alle Queue-Typen sind Kundenmails — Team-Mails laufen
        // an der Warteschlange vorbei (direkter SMTP-Versand), daher ist der Lead
        // hier ausnahmslos der richtige Adressat.
        const recipient = (lead.email ?? "").trim() || scheduledEmail.recipient_email;

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

        // Profil-Nudges (gegen Profil-Abbruch). Feuern nur solange das
        // Patientenprofil offen ist \u2014 bei patient_data_saved/eingeladen
        // ist das Ziel erreicht und der Nudge cancelt sich selbst.
        const isProfilNudge =
          scheduledEmail.email_type === "profil_nudge_1" ||
          scheduledEmail.email_type === "profil_nudge_2" ||
          scheduledEmail.email_type === "profil_nudge_3" ||
          scheduledEmail.email_type === "reaktivierung_wechsel";

        // Lead-Meilenstein aus den CA-App-Events (portal_opened, patient_data_saved,
        // caregiver_invited) \u2014 steuert die Nachfass-Variante + den Abbruch.
        const milestone = (isNachfass || isProfilNudge)
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
        // nur senden, wenn der Kunde NICHT reagiert hat. Cancelt bei Buchung /
        // nicht interessiert ODER wenn seit dem Einplanen eine Reaktion kam
        // (Bewerbung / Interesse) — dann hat der Kunde schon etwas zu tun und
        // die "schau dir weitere an"-Mail wäre fehl am Platz.
        const isNeuePk = scheduledEmail.email_type === "neue_pflegekraefte_verfuegbar";
        if (isNeuePk) {
          const { data: reactEvents } = await supabase
            .from("lead_events")
            .select("id")
            .eq("lead_id", scheduledEmail.lead_id)
            .in("event_type", ["application_received", "caregiver_interest_shown"])
            .gte("created_at", (scheduledEmail as any).created_at ?? "1970-01-01")
            .limit(1);
          const reacted = Array.isArray(reactEvents) && reactEvents.length > 0;
          if (isBeauftragt || isNichtInteressiert || reacted) {
            await supabase
              .from("scheduled_emails")
              .update({ status: "cancelled", updated_at: new Date().toISOString() })
              .eq("id", scheduledEmail.id);
            await supabase.from("lead_events").insert({
              lead_id: scheduledEmail.lead_id,
              event_type: `email_${scheduledEmail.email_type}_cancelled`,
              metadata: {
                reason: reacted
                  ? "reaction_received"
                  : isNichtInteressiert ? "nicht_interessiert" : "betreuung_beauftragt",
              },
            });
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

        if (scheduledEmail.email_type === "angebot") {
          // Legacy: wird seit dem neuen Flow nicht mehr neu eingeplant, der
          // Handler bleibt nur f\u00fcr evtl. noch eingeplante Alt-Rows.
          subject = "Ihr pers\u00f6nliches Angebot zur 24-Stunden-Betreuung";
          html = buildAngebotsEmailHtml(lead as Lead, smtpConfig.siteUrl);
          text = buildAngebotsEmailText(lead as Lead, smtpConfig.siteUrl);
          eventTypeSent = "email_angebot_sent";
          eventTypeFailed = "email_angebot_failed";
        } else if (scheduledEmail.email_type === "eingangsbestaetigung") {
          // Gemergte Mail 1: Empfangsbest\u00e4tigung + Angebot in einem.
          // Re-Submit-Check: hat der Kunde schon mal eine Eingangsbest\u00e4tigung
          // bekommen? Falls ja \u2192 angepasste Wording-Variante.
          const isResubmit = await hasPreviousEingangsbestaetigungSent(supabase, scheduledEmail.lead_id);
          /* Eingekaufter Lead: eigener Betreff. Der Standard setzt voraus,
             dass der Empfaenger weiss, wofuer er ein Angebot bekommt — der
             Kaltkontakt weiss das nicht. Herkunft schlaegt Resubmit. */
          subject = portalHerkunft((lead as Lead).source)
            ? PORTAL_BETREFF
            : isResubmit
            ? "Ihr aktualisiertes Angebot zur 24-Stunden-Betreuung \u2013 Primundus"
            : "Ihr Angebot zur 24-Stunden-Betreuung \u2013 Primundus";

          /* ── Empfehlung: echte gematchte Pflegekraft in die Mail ──────────
             Eingekaufte Portal-Leads bleiben AUSSEN VOR (undefined): die haben
             eine eigene Dramaturgie mit Vorschau-Block und Herkunfts-Hinweis,
             da gehoert keine zweite Pflegekraft-Sektion hinein.
             Alles hier ist best-effort — faellt es aus, bleibt es bei null und
             die Mail zeigt den ehrlichen Ersatztext. Der Versand haengt an
             keiner Stelle davon ab. */
          let empfHtml: string | null | undefined = undefined;
          let empfText: string | null | undefined = undefined;
          if (!portalHerkunft((lead as Lead).source) && (lead as Lead).token) {
            empfHtml = null;
            empfText = null;
            const tok = (lead as Lead).token as string;
            const basisUrl = buildPortalUrl(portalBase, tok);
            const erg: EmpfehlungErgebnis | null = await holeEmpfehlung({
              supabaseUrl,
              key: supabaseServiceKey,
              token: tok,
              jobOfferId: (lead as any).mamamia_job_offer_id ?? null,
              formularDaten: ((lead as any).kalkulation?.formularDaten ?? {}),
              // Serverseitiges Onboarding abschaltbar, ohne das Feature zu
              // verlieren: EMPFEHLUNG_ONBOARD=0 → nur Leads mit bestehender
              // job_offer bekommen eine Empfehlung.
              darfOnboarden: Deno.env.get("EMPFEHLUNG_ONBOARD") !== "0",
            });
            if (erg) {
              const inline = await fetchInlinePhotoDeno(erg.empfehlung.fotoUrl);
              const profilUrl = withMailMark(`${basisUrl}&cg=${erg.empfehlung.caregiverId}`, "eb");
              const alleUrl = withMailMark(buildPortalUrl(portalBase, tok, "matches"), "eb");
              empfHtml = empfehlungHtml(
                erg.empfehlung, inline?.cid ?? null, profilUrl, alleUrl, erg.sichtbarGesamt,
              );
              empfText = empfehlungText(erg.empfehlung, profilUrl, alleUrl, erg.sichtbarGesamt);
              if (inline) (scheduledEmail as any).__reminderInline = inline;
              await supabase.from("lead_events").insert({
                lead_id: scheduledEmail.lead_id,
                event_type: "empfehlung_in_angebotsmail",
                metadata: {
                  caregiver_id: erg.empfehlung.caregiverId,
                  sichtbar_gesamt: erg.sichtbarGesamt,
                  gruende: erg.empfehlung.gruende,
                  foto: inline ? "inline" : "initialen",
                },
              });
            }
          }

          html = buildEingangsbestaetigungHtml(lead as Lead, smtpConfig.siteUrl, portalBase, isResubmit, empfHtml);
          text = buildEingangsbestaetigungText(lead as Lead, portalBase, isResubmit, empfText);
          eventTypeSent = "email_eingangsbestaetigung_sent";
          eventTypeFailed = "email_eingangsbestaetigung_failed";
        } else if (scheduledEmail.email_type === "nachfass_1") {
          subject = "AW: Kurze R\u00fcckfrage zu Ihrem Angebot";
          html = buildNachfass1Html(lead as Lead, smtpConfig.siteUrl, portalBase, milestone);
          text = buildNachfass1Text(lead as Lead, smtpConfig.siteUrl, portalBase, milestone);
          eventTypeSent = "email_nachfass_1_sent";
          eventTypeFailed = "email_nachfass_1_failed";
        } else if (scheduledEmail.email_type === "nachfass_2") {
          // Betreff trägt alle drei Varianten (Kräfte gefunden / Hilfe beim
          // Ausfüllen / Angaben fehlen) — daher bewusst offen gehalten.
          subject = "Ihre Betreuung — kann ich Ihnen etwas abnehmen?";
          html = buildNachfass2Html(lead as Lead, smtpConfig.siteUrl, portalBase, milestone);
          text = buildNachfass2Text(lead as Lead, smtpConfig.siteUrl, portalBase, milestone);
          eventTypeSent = "email_nachfass_2_sent";
          eventTypeFailed = "email_nachfass_2_failed";
        } else if (scheduledEmail.email_type === "nachfass_3") {
          subject = "Eine letzte Frage — wie schaut's bei Ihnen aus?";
          html = buildNachfass3Html(lead as Lead, smtpConfig.siteUrl);
          text = buildNachfass3Text(lead as Lead, smtpConfig.siteUrl);
          eventTypeSent = "email_nachfass_3_sent";
          eventTypeFailed = "email_nachfass_3_failed";
        } else if (scheduledEmail.email_type === "profil_nudge_1") {
          subject = "Pflegekräfte können sich noch nicht bei Ihnen bewerben";
          html = buildProfilNudge1Html(lead as Lead, smtpConfig.siteUrl, portalBase);
          text = buildProfilNudge1Text(lead as Lead, smtpConfig.siteUrl, portalBase);
          eventTypeSent = "email_profil_nudge_1_sent";
          eventTypeFailed = "email_profil_nudge_1_failed";
        } else if (scheduledEmail.email_type === "profil_nudge_2") {
          subject = "Profil unvollständig — Sie können noch keine Bewerbungen erhalten";
          html = buildProfilNudge2Html(lead as Lead, smtpConfig.siteUrl, portalBase);
          text = buildProfilNudge2Text(lead as Lead, smtpConfig.siteUrl, portalBase);
          eventTypeSent = "email_profil_nudge_2_sent";
          eventTypeFailed = "email_profil_nudge_2_failed";
        } else if (scheduledEmail.email_type === "profil_nudge_3") {
          subject = "Können wir Sie bei etwas unterstützen?";
          html = buildProfilNudge3Html(lead as Lead, smtpConfig.siteUrl, portalBase);
          text = buildProfilNudge3Text(lead as Lead, smtpConfig.siteUrl, portalBase);
          eventTypeSent = "email_profil_nudge_3_sent";
          eventTypeFailed = "email_profil_nudge_3_failed";
        } else if (scheduledEmail.email_type === "reaktivierung_wechsel") {
          subject = "Steht bei Ihnen ein Pflegekraft-Wechsel an?";
          html = buildReaktivierungWechselHtml(lead as Lead, smtpConfig.siteUrl, portalBase);
          text = buildReaktivierungWechselText(lead as Lead, smtpConfig.siteUrl, portalBase);
          eventTypeSent = "email_reaktivierung_wechsel_sent";
          eventTypeFailed = "email_reaktivierung_wechsel_failed";
        } else if (scheduledEmail.email_type === "neue_pflegekraefte_verfuegbar") {
          subject = "Neue Pflegekräfte für Sie";
          html = buildNeuePflegekraefteHtml(lead as Lead, smtpConfig.siteUrl, portalBase);
          text = buildNeuePflegekraefteText(lead as Lead, smtpConfig.siteUrl, portalBase);
          eventTypeSent = "email_neue_pflegekraefte_verfuegbar_sent";
          eventTypeFailed = "email_neue_pflegekraefte_verfuegbar_failed";
        } else if (
          scheduledEmail.email_type === "interest_reminder" ||
          scheduledEmail.email_type === "application_reminder" ||
          scheduledEmail.email_type === "application_reminder_4h" ||
          scheduledEmail.email_type === "application_reminder_12h" ||
          scheduledEmail.email_type === "application_last_chance"
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
          const tier: ReminderTier =
            scheduledEmail.email_type === "application_reminder_4h" ? "4h"
            : scheduledEmail.email_type === "application_reminder_12h" ? "12h"
            : scheduledEmail.email_type === "application_last_chance" ? "70h"
            : "1h";
          const cgName = meta.caregiver_name || "Ihre Pflegekraft";
          const firstName = cgName.split(/\s+/)[0] || cgName;
          if (variant === "interest") {
            subject = `${firstName} würde sich gern bei Ihnen vorstellen`;
          } else if (tier === "1h") {
            subject = `Haben Sie ${firstName}s Bewerbung schon gesehen?`;
          } else if (tier === "4h") {
            subject = `Kurze Frage zu ${firstName}`;
          } else if (tier === "12h") {
            subject = `Wie ist Ihr Eindruck von ${firstName}?`;
          } else {
            subject = `Bevor ich ${firstName} wieder freigebe …`;
          }

          // Portal-URL mit Token bauen. Bewerbungs-Reminder springen per
          // goto direkt zur Bewerbungs-Sektion (Martin, 2026-07-09: Kunde
          // landete auf "Bewerbungen werden vorbereitet" statt der Bewerbung).
          let portalUrl = (portalBase && (lead as Lead).token)
            ? buildPortalUrl(portalBase, (lead as Lead).token, variant === "application" ? "bewerbungen" : undefined)
            : smtpConfig.siteUrl;
          // Multi-Job (Bug #25): Reminder eines konkreten Jobs verlinkt das
          // Portal MIT &job=<lead_jobs.id> — der Kunde landet auf DEM Einsatz,
          // um den es geht (nicht auf dem Default-/neuesten Job). Fail-soft:
          // kein Mirror-Wiersz ⇒ plain Link.
          if (portalUrl !== smtpConfig.siteUrl && meta.mamamia_job_offer_id != null) {
            try {
              const { data: jobRow } = await supabase
                .from("lead_jobs")
                .select("id")
                .eq("lead_id", scheduledEmail.lead_id)
                .eq("mamamia_job_offer_id", meta.mamamia_job_offer_id)
                .maybeSingle();
              portalUrl = appendJobParam(portalUrl, typeof jobRow?.id === "string" ? jobRow.id : null);
            } catch (e) {
              console.warn(`reminder job-deeplink lookup failed (lead ${scheduledEmail.lead_id}):`, e instanceof Error ? e.message : String(e));
            }
          }

          const inline = await fetchInlinePhotoDeno(meta.caregiver_photo_url);
          html = buildReminderHtml(lead as Lead, meta, portalUrl, smtpConfig.siteUrl, variant, inline?.cid ?? null, tier);
          text = buildReminderText(lead as Lead, meta, portalUrl, variant, tier);
          eventTypeSent = `email_${scheduledEmail.email_type}_sent`;
          eventTypeFailed = `email_${scheduledEmail.email_type}_failed`;

          // Inline-Photo wird unten beim Send-Block aufgenommen (siehe
          // reminderInline-Variable).
          (scheduledEmail as any).__reminderInline = inline;
        } else if (scheduledEmail.email_type === "warum_primundus") {
          // Trust-Mail (~48h nach Eingangsbestätigung).
          // Abbruch wenn Lead beauftragt/nicht interessiert — sonst raus.
          // Bewusst KEIN Abbruch bei caregiver_invited: solange noch nicht
          // gebucht ist, hilft das Preis-Argument weiterhin.
          if (isBeauftragt || isNichtInteressiert) {
            await supabase
              .from("scheduled_emails")
              .update({ status: "cancelled", updated_at: new Date().toISOString() })
              .eq("id", scheduledEmail.id);
            await supabase.from("lead_events").insert({
              lead_id: scheduledEmail.lead_id,
              event_type: "email_warum_primundus_cancelled",
              metadata: { reason: isNichtInteressiert ? "nicht_interessiert" : "betreuung_beauftragt" },
            });
            results.push({ id: scheduledEmail.id, success: true });
            continue;
          }
          const portalUrl = (portalBase && (lead as Lead).token)
            ? buildPortalUrl(portalBase, (lead as Lead).token)
            : smtpConfig.siteUrl;
          subject = "Vier Dinge, die Primundus anders macht";
          html = buildWarumPrimundusHtml(lead as Lead, portalUrl, smtpConfig.siteUrl);
          text = buildWarumPrimundusText(lead as Lead, portalUrl);
          eventTypeSent = "email_warum_primundus_sent";
          eventTypeFailed = "email_warum_primundus_failed";
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

        const emailResult = await sendEmailSmtp(smtpConfig, recipient, subject, html, text, attachments);

        if (emailResult.success) {
          await supabase
            .from("scheduled_emails")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              // Verlauf ehrlich halten: die Zeile soll die Adresse zeigen, an
              // die tatsächlich versendet wurde, nicht den Snapshot von damals.
              recipient_email: recipient,
            })
            .eq("id", scheduledEmail.id);

          await supabase.from("lead_events").insert({
            lead_id: scheduledEmail.lead_id,
            event_type: eventTypeSent,
            metadata: { to: recipient, triggered_by: "scheduled_email" },
          });
 
          // Nachfass-Kette: startet jetzt nach der (gemergten) Eingangsbestätigung.
          // `angebot` bleibt für evtl. eingeplante Alt-Rows ebenfalls als Anker.
          // Sequenz (Profil-Abbruch-optimiert, Stand 15.06.2026):
          //   0h    Eingangsbestätigung
          //   +4h   profil_nudge_1  (das Warum: ohne Profil keine Bewerbungen)
          //   +28h  profil_nudge_2  ("Soll ich Ihnen beim Ausfüllen helfen?")
          //   +48h  warum_primundus (Trust/USPs)
          //   +72h  nachfass_2      (kurze persönliche Nachfrage)
          //   +120h nachfass_3      (Break-up, mailto-Buttons)
          //   +7d   profil_nudge_3  (Reaktivierung: nützliche Infos, kein Druck)
          //   +49d  reaktivierung_wechsel (Wechsel-Fenster nach 6–8 Wochen)
          // nachfass_1 wurde durch die zwei dedizierten Profil-Nudges
          // ersetzt (war generisch + kollidierte zeitlich). Der nachfass_1-
          // Handler bleibt für evtl. noch eingeplante Alt-Rows.
          // Alle Profil-Nudges + Nachfässe canceln sich selbst, sobald das
          // Profil steht / gebucht / nicht interessiert (Skip-Logik oben).
          if (scheduledEmail.email_type === "eingangsbestaetigung" || scheduledEmail.email_type === "angebot") {
            await scheduleFollowUp(supabase, lead as Lead, "profil_nudge_1", 4 * 60);
            await scheduleFollowUp(supabase, lead as Lead, "profil_nudge_2", 28 * 60);
            await scheduleFollowUp(supabase, lead as Lead, "warum_primundus", 48 * 60);
            await scheduleFollowUp(supabase, lead as Lead, "nachfass_2", 72 * 60);
            await scheduleFollowUp(supabase, lead as Lead, "profil_nudge_3", 7 * 24 * 60);
            await scheduleFollowUp(supabase, lead as Lead, "reaktivierung_wechsel", 49 * 24 * 60);
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