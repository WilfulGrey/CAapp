// Übersetzung DE↔PL für den Pflegekraft-Chat — nutzt denselben Anthropic-Key
// wie mamamia-proxy (generateCaregiverAbout). Kurzer, strikter Prompt: NUR die
// Übersetzung zurückgeben, Pflege-/Betreuungskontext, Ton höflich-natürlich.

export type Lang = "de" | "pl";

const LANG_NAME: Record<Lang, string> = { de: "Deutsch", pl: "Polnisch" };

const SYSTEM_PROMPT =
  "Du bist ein professioneller Übersetzer für die häusliche 24-Stunden-Betreuung. " +
  "Übersetze die Nachricht originalgetreu, natürlich und höflich. " +
  "Gib AUSSCHLIESSLICH die Übersetzung zurück — keine Anführungszeichen, keine Erklärung, keine Sprachangabe.";

export async function translate(
  apiKey: string,
  text: string,
  from: Lang,
  to: Lang,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  if (!apiKey || !text.trim()) return null;
  try {
    const res = await fetchFn("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Übersetze von ${LANG_NAME[from]} nach ${LANG_NAME[to]}:\n\n${text}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error("translate: Anthropic error", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const body = (await res.json()) as { content?: Array<{ type: string; text: string }> };
    return body.content?.find((b) => b.type === "text")?.text?.trim() ?? null;
  } catch (e) {
    console.error("translate failed:", (e as Error).message);
    return null;
  }
}
