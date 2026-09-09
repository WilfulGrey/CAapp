/* ─── Zweites SMTP-Profil: Antwort an den Vermittler ─────────────────────
 *
 * Die Mails an Pflegena gehen aus DEM Postfach raus, an das er schreibt
 * (`info@primundus.de`, Ionos) — nicht ueber Amazon SES wie die Kundenpost.
 * Zwei Gruende: der SPF-Eintrag der Domain autorisiert Ionos
 * (`v=spf1 include:_spf-eu.ionos.com ~all`) und nicht SES, und eine Antwort
 * aus demselben Postfach ist fuer den Partner eine Antwort und nicht neue
 * Post von einem fremden Absender.
 *
 * BEWUSST OHNE COALESCE-Defaults (anders als get_smtp_config): fehlt hier
 * etwas, soll der Aufrufer scheitern statt still ueber das Kundenkonto zu
 * senden. Ein leiser Fallback wuerde bedeuten, dass die Antwort mit einem
 * anderen Absender rausgeht als der, die der Partner angeschrieben hat —
 * und niemand merkt es (Heilige Regel Nr. 1).
 *
 * Host und Port stehen als Vorgabe drin: das sind oeffentliche Angaben von
 * Ionos, keine Geheimnisse. Zugang und Absender MUESSEN im Vault liegen.
 */
CREATE OR REPLACE FUNCTION get_vermittler_smtp_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'host', COALESCE((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'vermittler_smtp_host' LIMIT 1), 'smtp.ionos.de'),
    'port', COALESCE((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'vermittler_smtp_port' LIMIT 1), '587'),
    'user', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'vermittler_smtp_user' LIMIT 1),
    'pass', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'vermittler_smtp_pass' LIMIT 1),
    'from', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'vermittler_smtp_from' LIMIT 1),
    'fromName', COALESCE((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'vermittler_smtp_from_name' LIMIT 1), 'Primundus 24h-Pflege')
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION get_vermittler_smtp_config() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_vermittler_smtp_config() FROM anon;
REVOKE ALL ON FUNCTION get_vermittler_smtp_config() FROM authenticated;
GRANT EXECUTE ON FUNCTION get_vermittler_smtp_config() TO service_role;
