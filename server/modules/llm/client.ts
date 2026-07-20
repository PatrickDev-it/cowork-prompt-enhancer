import { LLAMA_SERVER_URL } from '@/config';

/**
 * Client "Chat Completions" OpenAI-compatible per il modello condiviso — RFC-0015. Lato TS,
 * speculare al provider Python (RFC-0014): qualunque modulo TS (context_compressor, futuri) parla
 * al modello via questa astrazione, non a llama.cpp direttamente. Reasoning nativo per-richiesta
 * (`chat_template_kwargs.enable_thinking`). I chiamanti garantiscono la readiness (`ensureLlmReady`)
 * prima di usare questi metodi.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  content: string;
  reasoningContent: string | null;
  finishReason: string;
  promptTokens: number;
  completionTokens: number;
}

export interface ChatOptions {
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  presencePenalty?: number;
  repeatPenalty?: number;
  think?: boolean;
  responseFormat?: object;
  timeoutMs?: number;
}

export async function chatCompletion(opts: ChatOptions): Promise<ChatResult> {
  const body: Record<string, unknown> = {
    messages: opts.messages,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature ?? 0.6,
    top_p: opts.topP ?? 0.95,
    top_k: opts.topK ?? 20,
    min_p: opts.minP ?? 0,
    presence_penalty: opts.presencePenalty ?? 0,
    repeat_penalty: opts.repeatPenalty ?? 1,
    chat_template_kwargs: { enable_thinking: opts.think ?? false },
  };
  if (opts.responseFormat) body.response_format = opts.responseFormat;

  const res = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 600000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`llama-server HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ finish_reason?: string; message?: { content?: string; reasoning_content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = data.choices?.[0];
  const message = choice?.message;
  if (!message) throw new Error(`risposta llama-server malformata: ${JSON.stringify(data).slice(0, 300)}`);
  return {
    content: message.content ?? '',
    reasoningContent: message.reasoning_content ?? null,
    finishReason: choice?.finish_reason ?? '',
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
  };
}

/** Conta i token via il tokenizer del server (fallback: stima chars/4). */
export async function countTokens(text: string): Promise<number> {
  try {
    const res = await fetch(`${LLAMA_SERVER_URL}/tokenize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return Math.ceil(text.length / 4);
    const data = (await res.json()) as { tokens?: unknown[] };
    return Array.isArray(data.tokens) ? data.tokens.length : Math.ceil(text.length / 4);
  } catch {
    return Math.ceil(text.length / 4);
  }
}
