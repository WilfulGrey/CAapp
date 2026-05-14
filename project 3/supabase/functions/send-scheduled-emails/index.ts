// Deployed by CI — .github/workflows/test.yml → deploy-kostenrechner-edge-functions
// (on push to integration/mamamia-onboarding). Do not deploy manually.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";
 
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
 
const FEMALE_NAMES_SET = new Set(["aaliya","abby","ada","adela","adelheid","adeline","adriana","agata","agatha","agnes","aiko","aila","aileen","aimee","aisha","alana","alba","aleksandra","alexa","alexandra","alexia","alexis","alice","alicia","alina","alissa","aliyah","alke","allie","allison","alma","almut","alona","alva","alwine","amalia","amanda","amara","amaya","amelia","amelie","ami","amira","amy","ana","anastasia","andrea","andreja","angela","angelika","angelina","anita","anja","anna","annalena","anne","annegret","annelies","annelore","annette","anni","annika","antje","antonia","anuschka","aoife","arabell","ariadne","ariane","astrid","aurora","ava","babette","barbara","beatrice","beatrix","belen","bella","bente","berit","bernadette","bettina","bianca","birgit","birgitt","birgitta","birgitte","borbala","brigitta","brigitte","britt","brittany","bruna","brunhilde","camila","camilla","cara","carina","carla","carlotta","caro","carola","carolina","caroline","catharina","catharine","catrina","cecile","cecilia","charlotte","chiara","chloe","christel","christiane","christina","christine","claudia","claudine","constanze","corinna","cornelia","dagmar","dana","daniela","daria","deborah","diana","dina","dominique","dorothea","edda","edith","elena","eleonora","eliane","elisa","elisabeth","elizabeth","elke","ella","ellen","elsa","elsbeth","else","elvira","emilia","emma","erika","erna","ernestine","eva","eveline","evelyn","fatima","felicitas","filippa","fiona","franziska","frauke","frederike","frieda","gabriela","gabriele","gabi","gaby","gerda","gertrud","gisela","greta","gudrun","hanna","hannah","hannelore","heidemarie","heidi","heike","helene","helga","henriette","hildegard","hildegarde","hilke","hilde","ida","ilka","ilona","ilse","imke","ines","ingeborg","ingrid","irina","iris","irmgard","irmtraud","isabel","isabelle","isadora","jacqueline","jana","janet","janna","jasmin","jennifer","jessica","jette","johanna","jolanta","josefine","josephine","julia","juliane","justine","karin","karla","katharina","katharine","kathrin","katja","katrin","katrina","katrine","klara","klaudia","klarissa","kordula","kristin","kristina","lara","larissa","laura","lea","leah","lena","leonie","leonora","lieselotte","lilli","lillian","lilly","lina","linda","lisa","lisbeth","lore","lori","lotte","lotta","louisa","louise","lucia","luisa","luise","luzie","lydia","magdalena","maja","malin","mara","margarita","margareta","margarethe","margit","margot","marianna","marie","marielle","marina","marita","marlene","marta","martina","mary","mathilde","maud","melanie","melinda","melissa","merle","mia","michelle","mira","miriam","mirja","monika","nadine","natalia","natalie","nathalie","nele","nicola","nicole","nina","nora","natascha","odette","olivia","ottilie","patrizia","paula","pauline","petra","pia","renate","ronja","rosa","rosalie","roswitha","ruth","sabrina","sandra","sara","sarah","silke","silvia","simona","simone","sina","sofia","sonja","sophie","stefanie","stella","stephanie","susanne","sybille","sylvia","tamara","tanja","tatjana","teresa","theresa","theres","tina","ulrike","ursula","uta","veronika","victoria","viola","virginia","walburga","waltraud","wanda","wiebke","wilhelmine","xenia","yvonne","zoe"]);
const MALE_NAMES_SET = new Set(["aaron","adam","alexander","alfred","alois","andre","andreas","axel","bastian","benedikt","benjamin","bernd","bo","burkhard","carsten","christian","christoph","claus","clemens","cornelius","damian","daniel","david","dieter","dietmar","dirk","dominik","edgar","elias","emilio","eric","erik","ernst","eugen","fabian","felix","finn","florian","frank","franz","frederik","gabriel","georg","gerhard","gottfried","guido","gunnar","hans","harry","hartmut","heinz","helge","helmut","henning","henrik","herbert","heiko","holger","horst","hubert","hugo","jakob","jan","jens","joachim","joe","joel","joerg","johannes","jonas","jonathan","jochen","kai","karl","kilian","Klaus","kevin","konrad","kristian","lars","leo","leon","leopold","lorenz","lothar","lucas","lukas","manfred","marco","markus","martin","matthias","max","maximilian","michael","mike","moritz","nikolaj","nikolaus","nils","norbert","oliver","oscar","oskar","otto","patrice","patrick","paul","peter","philipp","ralf","reinhard","richard","robert","rolf","sebastian","simon","stefan","steffen","stephan","steven","sven","thomas","thorsten","tillman","tim","tobias","tom","torsten","ulrich","uwe","valentin","victor","volker","werner","willi","will","wolf","wolfram","xaver"]);
 
function capitalize(name: string): string {
  if (!name) return name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}
 
function detectGenderFromName(vorname: string): "Frau" | "Herr" | "Familie" | null {
  if (!vorname?.trim()) return null;
  const v = vorname.trim();
  if (v.toLowerCase().includes(" und ") || v.includes(" & ") || v.includes("/")) return "Familie";
  const first = v.split(" ")[0].toLowerCase();
  if (FEMALE_NAMES_SET.has(first)) return "Frau";
  if (MALE_NAMES_SET.has(first)) return "Herr";
  return null;
}
 
function buildAnredeText(anrede: string | null, nachname: string, vorname: string): string {
  const effectiveAnrede = anrede || detectGenderFromName(vorname);
  const n = capitalize(nachname);
  if (effectiveAnrede === "Frau" && n) return `Sehr geehrte Frau ${n}`;
  if (effectiveAnrede === "Herr" && n) return `Sehr geehrter Herr ${n}`;
  if (effectiveAnrede === "Familie" && n) return `Sehr geehrte Familie ${n}`;
  return "Sehr geehrte Damen und Herren";
}
 
function buildHalloAnrede(anrede: string | null, nachname: string, vorname: string): string {
  const effectiveAnrede = anrede || detectGenderFromName(vorname);
  const n = capitalize(nachname);
  if (effectiveAnrede === "Frau" && n) return `Hallo Frau ${n}`;
  if (effectiveAnrede === "Herr" && n) return `Hallo Herr ${n}`;
  if (effectiveAnrede === "Familie" && n) return `Hallo Familie ${n}`;
  return "Sehr geehrte Damen und Herren";
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
                  <img src="${logoUrl}" alt="Primundus Logo" style="max-width:160px;height:auto;display:block;" />
                </td>
                <td style="vertical-align:middle;text-align:right;">
                  <table cellpadding="0" cellspacing="0" role="presentation" style="margin-left:auto;">
                    <tr>
                      <td style="text-align:center;vertical-align:middle;padding-right:8px;border-right:1px solid #f0ebe4;">
                        <img src="${testUrl}" alt="Testsieger DIE WELT" width="36" style="display:block;width:36px;height:auto;" />
                      </td>
                      <td style="text-align:left;padding-left:8px;">
                        <p style="margin:0 0 1px 0;font-size:10px;font-weight:700;color:#3D2B1F;white-space:nowrap;">Testsieger</p>
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
              Primundus Deutschland | Vitanas Group<br><br>
              Sie erhalten diese E-Mail, weil Sie eine Kalkulation auf primundus.de angefordert haben.
            </div>
          </div>
        </div>
      </td></tr>
    </table>
  </div>
</body>
</html>`;
}
 
function buildIlkaSig(siteUrl: string): string {
  const ilkaUrl = `${siteUrl}/images/ilka-wysocki_pm-mallorca.webp`;
  const testUrl = `${siteUrl}/images/primundus_testsieger-2021.webp`;
  const mediaBase = `${siteUrl}/images/media`;
  return `
    <p style="font-size:16px;line-height:1.7;color:#555;margin-top:24px;margin-bottom:16px;">Mit freundlichen Grüßen<br><strong style="color:#3D2B1F;">Ilka Wysocki</strong></p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px 0;border:1px solid #e8ddd0;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:18px 20px 16px;background:#ffffff;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="vertical-align:top;">
                <table cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td style="padding-right:12px;vertical-align:top;">
                      <img src="${ilkaUrl}" alt="Ilka Wysocki" width="60" style="display:block;width:60px;height:auto;border-radius:8px;" />
                    </td>
                    <td style="vertical-align:middle;">
                      <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#3D2B1F;white-space:nowrap;">Ilka Wysocki</p>
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
                      <p style="margin:0 0 1px;font-size:11px;font-weight:700;color:#3D2B1F;white-space:nowrap;">Testsieger <span style="color:#B5A184;">DIE WELT</span></p>
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
function buildPortalUrl(portalBase: string, token: string): string {
  return `${portalBase.replace(/\/$/, "")}/?token=${encodeURIComponent(token)}`;
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
 
    <div style="text-align:center;margin:22px 0;">
      <a href="${kalkulationUrl}" style="display:inline-block;background:#2A9D5C;color:#fff;text-decoration:none;padding:13px 34px;border-radius:8px;font-weight:600;font-size:15px;">Angebot jetzt ansehen →</a>
    </div>
 
    <div style="background:#EEF6F0;border-left:3px solid #4CAF50;padding:12px 14px;border-radius:0 6px 6px 0;font-size:14px;color:#555;line-height:1.6;">
      Für Sie bleibt alles <strong>unverbindlich</strong>, bis Sie sich für eine passende Betreuungskraft entscheiden und diese anreist.
    </div>
 
    ${buildIlkaSig(siteUrl)}`;
 
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
Ilka Wysocki
 
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
      intro: "Ihre Patientendaten sind vollständig – perfekt.",
      body: "Jetzt fehlt nur noch der letzte Schritt: Laden Sie Ihre <strong>Wunsch-Pflegekräfte ein</strong>. Die Anfrage geht direkt an die Betreuungskraft, und Sie erhalten zeitnah eine Rückmeldung.",
      cta: "Pflegekräfte einladen →",
    };
  }
  if (milestone === "portal_opened") {
    return {
      intro: "wir haben gesehen, dass Sie schon in Ihrem Kundenportal waren – schön!",
      body: "Damit es weitergeht, fehlt nur noch <strong>ein Schritt: die Patientendaten vervollständigen</strong>. Erst damit kennen die Pflegekräfte den konkreten Pflegebedarf – und Sie können Ihre Wunsch-Pflegekräfte einladen und Bewerbungen erhalten. Es dauert nur 2 Minuten.",
      cta: "Patientendaten vervollständigen →",
    };
  }
  return {
    intro: "ich wollte kurz nachfragen, ob bei Ihnen alles angekommen ist.",
    body: "In Ihrem Kundenportal liegen bereits <strong>passende Betreuungskräfte</strong> für Sie bereit – mit Profil, Erfahrung und Verfügbarkeit. Schauen Sie gern unverbindlich rein.",
    cta: "Angebot und Pflegekräfte anzeigen →",
  };
}

function nachfassCtaButton(url: string, label: string): string {
  return `
    <div style="text-align:center;margin:8px 0 4px;">
      <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#B5A184 0%,#9A8A73 100%);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600;font-size:15px;box-shadow:0 2px 4px rgba(181,161,132,0.35);">${label}</a>
    </div>`;
}

function buildNachfass1Html(lead: Lead, siteUrl: string, portalBase: string, milestone: LeadMilestone): string {
  const portalUrl = (portalBase && lead.token) ? buildPortalUrl(portalBase, lead.token) : siteUrl;
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  const v = nachfassContent(milestone);

  const content = `
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${halloAnrede},</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${v.intro}</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${v.body}</p>

    ${buildIlkaSig(siteUrl)}
    ${nachfassCtaButton(portalUrl, v.cta)}`;

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

Mit freundlichen Grüßen
Ilka Wysocki

${v.cta.replace(/ →$/, "")}: ${portalUrl}

---
✓ Keine Vertragsbindung · ✓ Tagesgenaue Abrechnung · ✓ Kosten erst bei Anreise
Primundus Deutschland | +49 89 200 000 830 | www.primundus.de`;
}

function buildNachfass2Html(lead: Lead, siteUrl: string, portalBase: string, milestone: LeadMilestone): string {
  const portalUrl = (portalBase && lead.token) ? buildPortalUrl(portalBase, lead.token) : siteUrl;
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  const v = nachfassContent(milestone);
  // Nachfass 2 = dringlicher Ton im Intro für den "noch nicht im Portal"-Fall.
  const intro = milestone === "none"
    ? "ich melde mich noch einmal kurz – vielleicht war einfach noch nicht der richtige Moment."
    : v.intro;

  const content = `
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${halloAnrede},</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${intro}</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${v.body}</p>

    <div style="background:#F7F5F0;border:1px solid #e5e0d8;border-radius:8px;padding:12px 16px;margin:16px 0;display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <div>
        <div style="font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.06em;margin-bottom:7px;">100% Sorglos – unsere Konditionen</div>
        <div style="font-size:13px;color:#555;line-height:1.9;">
          <div><span style="color:#2D6A4F;font-weight:600;">✓</span> Keine Vertragsbindung</div>
          <div><span style="color:#2D6A4F;font-weight:600;">✓</span> Tagesgenaue Abrechnung</div>
          <div><span style="color:#2D6A4F;font-weight:600;">✓</span> Kosten erst bei Anreise</div>
        </div>
      </div>
      <img src="${siteUrl}/images/primundus_testsieger-2021.webp" alt="Testsieger" style="height:64px;width:auto;border:1px solid #e8d9a0;border-radius:4px;flex-shrink:0;opacity:.9;" />
    </div>

    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">Melden Sie sich einfach, wenn Sie Fragen haben oder wenn wir loslegen sollen.</p>

    ${buildIlkaSig(siteUrl)}
    ${nachfassCtaButton(portalUrl, v.cta)}`;

  return buildEmailWrapper(lead, siteUrl, content);
}

function buildNachfass2Text(lead: Lead, siteUrl: string, portalBase: string, milestone: LeadMilestone): string {
  const portalUrl = (portalBase && lead.token) ? buildPortalUrl(portalBase, lead.token) : siteUrl;
  const halloAnrede = buildHalloAnrede(lead.anrede_text || null, lead.nachname || "", lead.vorname || "");
  const v = nachfassContent(milestone);
  const plain = (s: string) => s.replace(/<\/?strong>/g, "");
  const intro = milestone === "none"
    ? "ich melde mich noch einmal kurz – vielleicht war einfach noch nicht der richtige Moment."
    : plain(v.intro);
  return `${halloAnrede},

${intro}

${plain(v.body)}

100% Sorglos – unsere Konditionen:
✓ Keine Vertragsbindung
✓ Tagesgenaue Abrechnung
✓ Kosten erst bei Anreise

Melden Sie sich einfach, wenn Sie Fragen haben oder wenn wir loslegen sollen.

Mit freundlichen Grüßen
Ilka Wysocki

${v.cta.replace(/ →$/, "")}: ${portalUrl}

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
  care_start_timing: { "sofort": "Sofort (4–7 Tage)", "2-4-wochen": "In 2–4 Wochen", "1-2-monate": "In 1–2 Monaten", "unklar": "Noch unklar" },
};

function eingangsLabel(key: string, val: string | undefined): string {
  if (!val) return "Nicht angegeben";
  return EINGANGS_LABELS[key]?.[val] || val;
}

function buildEingangsGreeting(lead: Lead): string {
  const detectedAnrede = lead.anrede_text || detectGenderFromName(lead.vorname || "");
  const n = lead.nachname || "";
  if (detectedAnrede === "Frau" && n) return `Guten Tag Frau ${n}`;
  if (detectedAnrede === "Herr" && n) return `Guten Tag Herr ${n}`;
  if (detectedAnrede === "Familie" && n) return `Guten Tag Familie ${n}`;
  if (lead.vorname) return `Guten Tag ${lead.vorname}`;
  return "Guten Tag";
}

function buildEingangsbestaetigungHtml(lead: Lead, siteUrl: string, portalBase: string): string {
  const greeting = buildEingangsGreeting(lead);
  const fd = (lead.kalkulation as any)?.formularDaten || {};
  const careStartTiming = (lead as any).care_start_timing || "";

  const betreuungFuer = eingangsLabel("betreuung_fuer", fd.betreuung_fuer);
  const pflegegrad = fd.pflegegrad ? `Pflegegrad ${fd.pflegegrad}` : "Nicht angegeben";
  const weiterePersonen = eingangsLabel("weitere_personen", fd.weitere_personen);
  const mobilitaet = eingangsLabel("mobilitaet", fd.mobilitaet);
  const nachteinsaetze = eingangsLabel("nachteinsaetze", fd.nachteinsaetze);
  const deutschkenntnisse = eingangsLabel("deutschkenntnisse", fd.deutschkenntnisse);
  const fuehrerschein = eingangsLabel("fuehrerschein", fd.fuehrerschein);
  const geschlecht = eingangsLabel("geschlecht", fd.geschlecht);
  const careStart = eingangsLabel("care_start_timing", careStartTiming);

  type Row = [string, string];
  const rows: Row[] = [
    ["Name", [lead.anrede_text, lead.vorname, lead.nachname].filter(Boolean).join(" ") || "Nicht angegeben"],
    ["E-Mail", lead.email],
  ];
  if ((lead as any).telefon) rows.push(["Telefon", (lead as any).telefon]);
  rows.push(
    ["Betreuung für", betreuungFuer],
    ["Weitere Person im Haushalt", weiterePersonen],
    ["Pflegegrad", pflegegrad],
    ["Mobilität", mobilitaet],
    ["Nachteinsätze", nachteinsaetze],
    ["Deutschkenntnisse BK", deutschkenntnisse],
  );
  if (fd.fuehrerschein) rows.push(["Führerschein BK", fuehrerschein]);
  if (fd.geschlecht) rows.push(["Geschlecht BK", geschlecht]);
  rows.push(["Betreuungsstart", careStart]);

  const rowsHtml = rows.map(([label, value], i) => {
    const isLast = i === rows.length - 1;
    const border = isLast ? "" : "border-bottom:1px solid #f0ebe4;";
    return `<tr>
      <td style="padding:8px 0;${border}color:#888;font-size:13px;width:44%;">${label}</td>
      <td style="padding:8px 0;${border}color:#333;font-size:13px;font-weight:600;">${value}</td>
    </tr>`;
  }).join("");

  // Preis aus der Kalkulation (gleiche Box wie früher die separate Angebots-Mail).
  const kalk = lead.kalkulation || {};
  const bruttopreis = kalk.bruttopreis || 0;
  const gesamteZuschuesse = kalk.zuschüsse?.gesamt || 0;
  const eigenanteil = kalk.eigenanteil || (bruttopreis - gesamteZuschuesse);
  const formatEuro = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";

  const priceBox = bruttopreis > 0 ? `
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
    </div>` : "";

  const portalUrl = (portalBase && lead.token) ? buildPortalUrl(portalBase, lead.token) : "";
  const portalBlock = portalUrl ? `
    <div style="background:#FAF8F4;border:1px solid #e8ddd0;border-radius:8px;padding:18px 20px;margin:0 0 22px 0;">
      <p style="margin:0 0 12px 0;font-size:14px;color:#555;line-height:1.6;">In Ihrem <strong style="color:#2D1F0F;">Kundenportal</strong> sehen Sie die vorgeschlagenen Pflegekräfte mit Profil und Erfahrung. So geht es weiter:</p>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr><td style="padding:5px 0;vertical-align:top;width:26px;"><span style="display:inline-block;width:20px;height:20px;background:#B5A184;color:#fff;border-radius:50%;text-align:center;font-size:12px;font-weight:700;line-height:20px;">1</span></td>
          <td style="padding:5px 0;font-size:14px;color:#444;line-height:1.55;"><strong>Pflegekräfte ansehen</strong> – jederzeit möglich</td></tr>
        <tr><td style="padding:5px 0;vertical-align:top;"><span style="display:inline-block;width:20px;height:20px;background:#B5A184;color:#fff;border-radius:50%;text-align:center;font-size:12px;font-weight:700;line-height:20px;">2</span></td>
          <td style="padding:5px 0;font-size:14px;color:#444;line-height:1.55;"><strong>Patientendaten vervollständigen</strong> – damit die Pflegekräfte den konkreten Pflegebedarf kennen. Voraussetzung für den nächsten Schritt.</td></tr>
        <tr><td style="padding:5px 0;vertical-align:top;"><span style="display:inline-block;width:20px;height:20px;background:#B5A184;color:#fff;border-radius:50%;text-align:center;font-size:12px;font-weight:700;line-height:20px;">3</span></td>
          <td style="padding:5px 0;font-size:14px;color:#444;line-height:1.55;"><strong>Wunsch-Pflegekräfte einladen &amp; Bewerbungen erhalten</strong> – sobald die Patientendaten vollständig sind</td></tr>
      </table>
      <div style="text-align:center;margin:18px 0 4px;">
        <a href="${portalUrl}" style="display:inline-block;background:#2A9D5C;color:#fff;text-decoration:none;padding:13px 34px;border-radius:8px;font-weight:600;font-size:15px;">Angebot und Pflegekräfte anzeigen →</a>
      </div>
    </div>` : "";

  const content = `
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">${greeting},</p>
    <p style="font-size:15px;line-height:1.75;color:#444;margin-bottom:14px;">vielen Dank für Ihre Anfrage. Auf Grundlage Ihrer Angaben haben wir Ihr <strong style="color:#2D1F0F;">persönliches Angebot</strong> für die 24-Stunden-Betreuung zu Hause erstellt – inklusive passender Pflegekräfte, die wir bereits für Sie ausgewählt haben.</p>

    ${priceBox}

    <div style="font-size:12px;color:#888;line-height:1.8;margin:0 0 18px;text-align:center;">
      <span style="color:#2D6A4F;font-weight:600;">✓ Keine Vertragsbindung</span>&ensp;&middot;&ensp;
      <span style="color:#2D6A4F;font-weight:600;">✓ Tagesgenaue Abrechnung</span>&ensp;&middot;&ensp;
      <span style="color:#2D6A4F;font-weight:600;">✓ Kosten erst bei Anreise</span>
    </div>

    ${portalBlock}

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 22px 0;border:1px solid #e8ddd0;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="background:#f9f6f2;padding:6px 20px;border-bottom:1px solid #e8ddd0;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#9a8a73;text-transform:uppercase;">Ihre Angaben im Überblick</p>
        </td>
      </tr>
      <tr>
        <td style="padding:4px 20px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
        </td>
      </tr>
    </table>

    <div style="background:#EEF6F0;border-left:3px solid #4CAF50;padding:12px 14px;border-radius:0 6px 6px 0;font-size:14px;color:#555;line-height:1.6;">
      Für Sie bleibt alles <strong>unverbindlich</strong>, bis Sie sich für eine passende Betreuungskraft entscheiden und diese anreist.
    </div>

    ${buildIlkaSig(siteUrl)}`;

  return buildEmailWrapper(lead, siteUrl, content);
}

function buildEingangsbestaetigungText(lead: Lead, portalBase: string): string {
  const greeting = buildEingangsGreeting(lead);
  const fd = (lead.kalkulation as any)?.formularDaten || {};
  const careStartTiming = (lead as any).care_start_timing || "";

  const portalUrl = (portalBase && lead.token) ? buildPortalUrl(portalBase, lead.token) : "";

  const kalk = lead.kalkulation || {};
  const bruttopreis = kalk.bruttopreis || 0;
  const gesamteZuschuesse = kalk.zuschüsse?.gesamt || 0;
  const eigenanteil = kalk.eigenanteil || (bruttopreis - gesamteZuschuesse);
  const formatEuro = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
  const priceLine = bruttopreis > 0
    ? `Monatssatz: ${formatEuro(bruttopreis)} (inkl. Steuern & Sozialabgaben) | Eigenanteil möglich: ${formatEuro(eigenanteil)} (nach Pflegekasse)\n\n`
    : "";

  const portalBlock = portalUrl ? `SO GEHT ES WEITER

In Ihrem Kundenportal sehen Sie die vorgeschlagenen Pflegekräfte mit Profil und Erfahrung.

1. Pflegekräfte ansehen – jederzeit möglich
2. Patientendaten vervollständigen – damit die Pflegekräfte den konkreten Pflegebedarf kennen. Voraussetzung für den nächsten Schritt.
3. Wunsch-Pflegekräfte einladen & Bewerbungen erhalten – sobald die Patientendaten vollständig sind

Angebot und Pflegekräfte anzeigen: ${portalUrl}

` : "";

  return `Ihr persönliches Angebot zur 24-Stunden-Betreuung – Primundus

${greeting},

vielen Dank für Ihre Anfrage. Auf Grundlage Ihrer Angaben haben wir Ihr persönliches Angebot für die 24-Stunden-Betreuung zu Hause erstellt – inklusive passender Pflegekräfte, die wir bereits für Sie ausgewählt haben.

${priceLine}✓ Keine Vertragsbindung · ✓ Tagesgenaue Abrechnung · ✓ Kosten erst bei Anreise

${portalBlock}IHRE ANGABEN IM ÜBERBLICK

Name: ${[lead.anrede_text, lead.vorname, lead.nachname].filter(Boolean).join(" ") || "Nicht angegeben"}
E-Mail: ${lead.email}
${(lead as any).telefon ? `Telefon: ${(lead as any).telefon}` : ""}
Betreuung für: ${eingangsLabel("betreuung_fuer", fd.betreuung_fuer)}
Weitere Personen: ${eingangsLabel("weitere_personen", fd.weitere_personen)}
Pflegegrad: ${fd.pflegegrad ? `Pflegegrad ${fd.pflegegrad}` : "Nicht angegeben"}
Mobilität: ${eingangsLabel("mobilitaet", fd.mobilitaet)}
Nachteinsätze: ${eingangsLabel("nachteinsaetze", fd.nachteinsaetze)}
Deutschkenntnisse: ${eingangsLabel("deutschkenntnisse", fd.deutschkenntnisse)}
Wann soll die Betreuung starten?: ${eingangsLabel("care_start_timing", careStartTiming)}

Für Sie bleibt alles unverbindlich, bis Sie sich für eine passende Betreuungskraft entscheiden und diese anreist.

Bei Fragen stehen wir Ihnen gerne telefonisch zur Verfügung: +49 89 200 000 830

Mit freundlichen Grüßen
Ilka Wysocki

---
Primundus Deutschland | 24h-Pflege und Betreuung
Telefon: +49 89 200 000 830 | E-Mail: info@primundus.de
www.primundus.de`;
}


async function sendEmailSmtp(
  smtpConfig: SmtpConfig,
  to: string,
  subject: string,
  html: string,
  text: string,
  attachments?: { filename: string; content: Uint8Array; contentType: string }[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const transport = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: false,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
      },
    });

    const mailOptions: any = {
      from: `"${smtpConfig.fromName}" <${smtpConfig.from}>`,
      to,
      subject,
      text,
      html,
    };

    if (attachments && attachments.length > 0) {
      mailOptions.attachments = attachments.map((att) => ({
        filename: att.filename,
        content: Buffer.from(att.content),
        contentType: att.contentType,
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
  const scheduledFor = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
 
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
        JSON.stringify({ message: "No pending emails to send", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
 
    const results: { id: string; success: boolean; error?: string }[] = [];
 
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
          continue;
        }
 
        const isBeauftragt = lead.status === "vertrag_abgeschlossen" || lead.status === "betreuung_beauftragt" || lead.order_confirmed === true;
        const isNichtInteressiert = lead.status === "nicht_interessiert";

        const isNachfass = scheduledEmail.email_type === "nachfass_1" || scheduledEmail.email_type === "nachfass_2";

        // Lead-Meilenstein aus den CA-App-Events (portal_opened, patient_data_saved,
        // caregiver_invited) \u2014 steuert die Nachfass-Variante + den Abbruch.
        const milestone = isNachfass
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
            data: {
              reason: milestone === "caregiver_invited"
                ? "caregiver_invited"
                : isNichtInteressiert ? "nicht_interessiert" : "betreuung_beauftragt",
            },
          });

          results.push({ id: scheduledEmail.id, success: true });
          continue;
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
          subject = "Ihr pers\u00f6nliches Angebot zur 24-Stunden-Betreuung";
          html = buildEingangsbestaetigungHtml(lead as Lead, smtpConfig.siteUrl, portalBase);
          text = buildEingangsbestaetigungText(lead as Lead, portalBase);
          eventTypeSent = "email_eingangsbestaetigung_sent";
          eventTypeFailed = "email_eingangsbestaetigung_failed";
        } else if (scheduledEmail.email_type === "nachfass_1") {
          subject = "AW: Kurze R\u00fcckfrage zu Ihrem Angebot";
          html = buildNachfass1Html(lead as Lead, smtpConfig.siteUrl, portalBase, milestone);
          text = buildNachfass1Text(lead as Lead, smtpConfig.siteUrl, portalBase, milestone);
          eventTypeSent = "email_nachfass_1_sent";
          eventTypeFailed = "email_nachfass_1_failed";
        } else if (scheduledEmail.email_type === "nachfass_2") {
          subject = "Noch offen: Ihr Angebot zur 24h-Betreuung – ich helfe gerne weiter";
          html = buildNachfass2Html(lead as Lead, smtpConfig.siteUrl, portalBase, milestone);
          text = buildNachfass2Text(lead as Lead, smtpConfig.siteUrl, portalBase, milestone);
          eventTypeSent = "email_nachfass_2_sent";
          eventTypeFailed = "email_nachfass_2_failed";
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
          continue;
        }
 
        // For Angebotsmail, attach the PDF
        let attachments: { filename: string; content: Uint8Array; contentType: string }[] | undefined;
        if (scheduledEmail.email_type === "angebot") {
          const fullName = [(lead as Lead).vorname, (lead as any).nachname].filter(Boolean).join('_');
          const pdfAttachment = await fetchPDFAttachment(smtpConfig.siteUrl, lead.id, fullName || undefined);
          if (pdfAttachment) attachments = [pdfAttachment];
        }

        const emailResult = await sendEmailSmtp(smtpConfig, scheduledEmail.recipient_email, subject, html, text, attachments);
 
        if (emailResult.success) {
          await supabase
            .from("scheduled_emails")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", scheduledEmail.id);
 
          await supabase.from("lead_events").insert({
            lead_id: scheduledEmail.lead_id,
            event_type: eventTypeSent,
            data: { to: scheduledEmail.recipient_email, triggered_by: "scheduled_email" },
          });
 
          // Nachfass-Kette: startet jetzt nach der (gemergten) Eingangsbestätigung.
          // `angebot` bleibt für evtl. eingeplante Alt-Rows ebenfalls als Anker.
          if (scheduledEmail.email_type === "eingangsbestaetigung" || scheduledEmail.email_type === "angebot") {
            await scheduleFollowUp(supabase, lead as Lead, "nachfass_1", 24 * 60);
          } else if (scheduledEmail.email_type === "nachfass_1") {
            await scheduleFollowUp(supabase, lead as Lead, "nachfass_2", 48 * 60);
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
            data: { to: scheduledEmail.recipient_email, error: emailResult.error, triggered_by: "scheduled_email" },
          });
 
          results.push({ id: scheduledEmail.id, success: false, error: emailResult.error });
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
      }
    }
 
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
 
    return new Response(
      JSON.stringify({
        message: `Processed ${results.length} emails`,
        processed: results.length,
        success: successCount,
        failed: failCount,
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