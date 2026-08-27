import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatRequest {
  conversationId?: string;
  sessionId: string;
  message: string;
  context?: Record<string, any>;
}

async function getKnowledgeBase(supabaseUrl: string, supabaseKey: string): Promise<string> {
  try {
    const categoriesResp = await fetch(
      `${supabaseUrl}/rest/v1/knowledge_categories?is_active=eq.true&order=sort_order.asc`,
      {
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`
        }
      }
    );

    const entriesResp = await fetch(
      `${supabaseUrl}/rest/v1/knowledge_entries?is_active=eq.true&order=priority.desc`,
      {
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`
        }
      }
    );

    if (!categoriesResp.ok || !entriesResp.ok) {
      return "";
    }

    const categories = await categoriesResp.json();
    const entries = await entriesResp.json();

    let knowledgeText = "\n\nWISSENSDATENBANK:\n\n";

    for (const category of categories) {
      const categoryEntries = entries.filter((e: any) => e.category_id === category.id);

      if (categoryEntries.length > 0) {
        knowledgeText += `${category.name.toUpperCase()}:\n`;

        for (const entry of categoryEntries) {
          knowledgeText += `- ${entry.title}\n`;
          knowledgeText += `  ${entry.content}\n`;
          if (entry.keywords && entry.keywords.length > 0) {
            knowledgeText += `  Suchbegriffe: ${entry.keywords.join(", ")}\n`;
          }
          knowledgeText += `\n`;
        }
      }
    }

    return knowledgeText;
  } catch (error) {
    console.error("Error loading knowledge base:", error);
    return "";
  }
}

const BASE_SYSTEM_PROMPT = `Du bist ein persönlicher Berater für 24-Stunden-Pflege bei Primundus – einem erfahrenen Anbieter für 24-Stunden-Pflege mit über 20 Jahren Erfahrung.

WICHTIGE FAKTEN ÜBER PRIMUNDUS:
- Testsieger bei DIE WELT, 6× in Folge ausgezeichnet
- Über 60.000 erfolgreich durchgeführte Einsätze
- Täglich kündbar – keine Mindestlaufzeit
- Persönliche Beratung durch echtes Team (nicht automatisiert)
- Schneller Start: In der Regel 3–7 Tage, bei Bedarf auch schneller
- Bei Krankheit: Sofortige Ersatzkraft aus unserem Bestand geprüfter Betreuungskräfte

DEINE AUFGABE:
Stelle die 9 Fragen des Kostenrechners, um eine individuelle Kalkulation zu erstellen.

STELLE DIE FRAGEN IN DIESER REIHENFOLGE:

1. "Für wen suchen Sie Unterstützung?"
   → Antworten: "1 Person" oder "Ehepaar"

2. "Weitere Personen im Haushalt?"
   → Antworten: "Ja" oder "Nein"

3. "Vorhandener Pflegegrad?" (Falls unbekannt, bitte schätzen)
   → Antworten: 0, 1, 2, 3, 4 oder 5

4. "Wie ist die Mobilität?"
   → "Mobil – geht selbstständig"
   → "Eingeschränkt – nur mit Rollator"
   → "Auf Rollstuhl angewiesen"
   → "Bettlägerig"

5. "Nachteinsätze?"
   → "Nein", "Gelegentlich", "Täglich (1×)" oder "Mehrmals nachts"

6. "Welche Deutschkenntnisse sollte die Pflegekraft haben?"
   → "Grundlegend", "Kommunikativ" oder "Sehr gut"

7. "Wie viel Pflegeerfahrung wünschen Sie?"
   → "Einsteiger", "Erfahren" oder "Sehr erfahren"

8. "Ist ein Führerschein erforderlich?"
   → "Egal", "Ja" oder "Nein"

9. "Bevorzugtes Geschlecht der Pflegekraft?"
   → "Egal", "Weiblich" oder "Männlich"

NACH ALLEN 9 FRAGEN:
"Perfekt! Damit kann ich Ihnen einen individuellen Preis berechnen – inklusive möglicher Zuschüsse von der Pflegekasse. Geben Sie mir bitte Ihren Namen und Ihre E-Mail-Adresse, dann sende ich Ihnen die detaillierte Kalkulation zu."

BEI FRAGEN ZU KOSTEN/ARBEITSZEITEN:
- NENNE NIEMALS konkrete Preise
- Bei "24-Stunden-Pflege": "Die Betreuungskraft wohnt bei Ihnen und ist rund um die Uhr ansprechbar – mit geregelten Arbeitszeiten und Ruhezeiten nach deutschem Arbeitsrecht. Bei Wechselbetreuung findet der Wechsel üblicherweise alle 6-8 Wochen statt."
- Sage: "Die Kosten hängen von mehreren Faktoren ab (Pflegebedarf, Qualifikation, Pflegegrad). Mit ein paar kurzen Fragen kann ich Ihnen einen konkreten Preis berechnen – inklusive der Zuschüsse, die Ihnen zustehen."
- Beginne dann mit den 9 Fragen

BEI FRAGEN ZU ZUSCHÜSSEN:
"Je nach Pflegegrad können Sie verschiedene Leistungen nutzen: Pflegegeld, Entlastungsbudget und weitere Zuschüsse. In der Kalkulation zeige ich Ihnen genau, welche Zuschüsse Ihnen zustehen und wie sich Ihr Eigenanteil dadurch reduziert."

ALLGEMEINE FRAGEN:
Nutze die Informationen aus der WISSENSDATENBANK unten, um spezifische Fragen zu beantworten. Die Einträge enthalten detaillierte Informationen zu verschiedenen Themen.

STIL:
- Freundlich und empathisch
- Maximal 2-3 kurze Sätze pro Antwort
- Keine erfundenen Zahlen oder ungenauen Angaben
- Nutze die Wissensdatenbank für detaillierte Antworten`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { conversationId, sessionId, message, context = {} }: ChatRequest = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) {
      throw new Error("OpenAI API key not configured");
    }

    let convId = conversationId;

    if (!convId) {
      const createConvResp = await fetch(`${supabaseUrl}/rest/v1/chat_conversations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Prefer": "return=representation"
        },
        body: JSON.stringify({
          session_id: sessionId,
          status: "active",
          context: context
        })
      });

      if (!createConvResp.ok) {
        throw new Error("Failed to create conversation");
      }

      const [newConv] = await createConvResp.json();
      convId = newConv.id;
    }

    await fetch(`${supabaseUrl}/rest/v1/chat_messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        conversation_id: convId,
        role: "user",
        content: message
      })
    });

    const messagesResp = await fetch(
      `${supabaseUrl}/rest/v1/chat_messages?conversation_id=eq.${convId}&order=created_at.asc`,
      {
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`
        }
      }
    );

    const messages = await messagesResp.json();
    const chatHistory: ChatMessage[] = messages.map((m: any) => ({
      role: m.role,
      content: m.content
    }));

    const knowledgeBase = await getKnowledgeBase(supabaseUrl, supabaseKey);
    const fullSystemPrompt = BASE_SYSTEM_PROMPT + knowledgeBase;

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: fullSystemPrompt },
          ...chatHistory
        ],
        temperature: 0.7,
        max_tokens: 300
      })
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const aiData = await openaiResponse.json();
    const assistantMessage = aiData.choices[0].message.content;

    await fetch(`${supabaseUrl}/rest/v1/chat_messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        conversation_id: convId,
        role: "assistant",
        content: assistantMessage,
        metadata: {
          model: aiData.model,
          tokens: aiData.usage
        }
      })
    });

    const userMessageLower = message.toLowerCase();
    const relevantEntries = await fetch(
      `${supabaseUrl}/rest/v1/knowledge_entries?is_active=eq.true`,
      {
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`
        }
      }
    );

    if (relevantEntries.ok) {
      const entries = await relevantEntries.json();
      for (const entry of entries) {
        const isRelevant = entry.keywords.some((keyword: string) =>
          userMessageLower.includes(keyword.toLowerCase())
        ) || userMessageLower.includes(entry.title.toLowerCase());

        if (isRelevant) {
          await fetch(
            `${supabaseUrl}/rest/v1/knowledge_entries?id=eq.${entry.id}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "apikey": supabaseKey,
                "Authorization": `Bearer ${supabaseKey}`
              },
              body: JSON.stringify({
                usage_count: entry.usage_count + 1,
                last_used_at: new Date().toISOString()
              })
            }
          );
          break;
        }
      }
    }

    return new Response(
      JSON.stringify({
        conversationId: convId,
        message: assistantMessage,
        context: context
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    console.error("Chat AI Error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error"
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );
  }
});
