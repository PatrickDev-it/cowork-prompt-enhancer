import { LLAMA_SERVER_URL, PROFILE } from '@/config';

/** OpenAI-compatible client for shared TypeScript-side model consumers (RFC-0015). */

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
  signal?: AbortSignal;
}

function timeoutSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function chatCompletion(opts: ChatOptions): Promise<ChatResult> {
  if (PROFILE === 'mock') {
    const source = opts.messages.at(-1)?.content ?? '';
    const content = source.length > 24_000 ? `${source.slice(0, 12_000)}\n...\n${source.slice(-12_000)}` : source;
    return {
      content,
      reasoningContent: null,
      finishReason: 'stop',
      promptTokens: Math.ceil(source.length / 4),
      completionTokens: Math.ceil(content.length / 4),
    };
  }
  const body: Record<string, unknown> = {
    messages: opts.messages,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature ?? 0.6,
    top_p: opts.topP ?? 0.95,
    presence_penalty: opts.presencePenalty ?? 0,
  };
  if (PROFILE === 'local') {
    body.top_k = opts.topK ?? 20;
    body.min_p = opts.minP ?? 0;
    body.repeat_penalty = opts.repeatPenalty ?? 1;
    body.chat_template_kwargs = { enable_thinking: opts.think ?? false };
  } else {
    body.model = process.env.COWORK_OPENAI_MODEL;
  }
  if (opts.responseFormat) body.response_format = opts.responseFormat;

  const baseUrl = PROFILE === 'local' ? LLAMA_SERVER_URL : process.env.COWORK_OPENAI_BASE_URL!;
  const endpoint = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
  const credential = PROFILE === 'openai-compatible' ? process.env.COWORK_OPENAI_API_KEY! : '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (credential) headers.Authorization = `Bearer ${credential}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: timeoutSignal(opts.timeoutMs ?? 600000, opts.signal),
  });
  if (!res.ok) {
    const rawDetail = await res.text().catch(() => '');
    const detail = credential ? rawDetail.replaceAll(credential, '[REDACTED]') : rawDetail;
    throw new Error(`provider HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ finish_reason?: string; message?: { content?: string; reasoning_content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = data.choices?.[0];
  const message = choice?.message;
  if (!message) throw new Error(`Malformed provider response: ${JSON.stringify(data).slice(0, 300)}`);
  return {
    content: message.content ?? '',
    reasoningContent: message.reasoning_content ?? null,
    finishReason: choice?.finish_reason ?? '',
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
  };
}

/** Count with the local tokenizer and fall back to a characters-per-token estimate. */
export async function countTokens(text: string, signal?: AbortSignal): Promise<number> {
  if (PROFILE !== 'local') return Math.ceil(text.length / 4);
  try {
    const res = await fetch(`${LLAMA_SERVER_URL}/tokenize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
      signal: timeoutSignal(30000, signal),
    });
    if (!res.ok) return Math.ceil(text.length / 4);
    const data = (await res.json()) as { tokens?: unknown[] };
    return Array.isArray(data.tokens) ? data.tokens.length : Math.ceil(text.length / 4);
  } catch {
    return Math.ceil(text.length / 4);
  }
}
