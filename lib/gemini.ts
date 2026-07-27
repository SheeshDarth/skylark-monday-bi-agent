import { GEMINI_MODEL } from "./config";

type GeminiPart = { text?: string };

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
  error?: {
    message?: string;
  };
};

export async function generateGeminiAnswer(apiKey: string, instructions: string, input: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: instructions }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: input }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
        },
      }),
      cache: "no-store",
    },
  );

  const json = (await res.json().catch(() => null)) as GeminiResponse | null;
  if (!res.ok || !json) {
    throw new Error(`Gemini API request failed with status ${res.status}.`);
  }

  if (json.error?.message) {
    throw new Error(json.error.message);
  }

  const text = json.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) {
    throw new Error("Gemini returned no text.");
  }

  return text;
}
