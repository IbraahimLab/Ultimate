import type { ChatMessage, RuntimeConfig } from "../types.js";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

function normalizeContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

export class OpenAICompatibleClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  public constructor(runtimeConfig: RuntimeConfig) {
    this.apiKey = runtimeConfig.apiKey;
    this.baseUrl = runtimeConfig.baseUrl;
    this.model = runtimeConfig.model;
  }

  public async complete(
    messages: ChatMessage[],
    timeoutMs: number,
  ): Promise<string> {
    try {
      return await this.completeInternal(messages, timeoutMs, true);
    } catch (error) {
      const message = (error as Error).message.toLowerCase();
      if (message.includes("response_format")) {
        return this.completeInternal(messages, timeoutMs, false);
      }
      throw error;
    }
  }

  private async completeInternal(
    messages: ChatMessage[],
    timeoutMs: number,
    useJsonResponseFormat: boolean,
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body: Record<string, unknown> = {
        model: this.model,
        messages,
        temperature: 0.1,
      };
      if (useJsonResponseFormat) {
        body.response_format = { type: "json_object" };
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM request failed (${response.status}): ${errorText}`);
      }

      const json = (await response.json()) as ChatCompletionResponse;
      const content = json.choices?.[0]?.message?.content;
      const normalized = normalizeContent(content);
      if (!normalized) {
        throw new Error("LLM returned empty message content.");
      }
      return normalized;
    } finally {
      clearTimeout(timer);
    }
  }
}
