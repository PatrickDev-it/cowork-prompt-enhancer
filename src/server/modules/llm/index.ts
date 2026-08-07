/**
 * Infrastruttura LLM condivisa — RFC-0015. Il modello (`llama-server`) è caricato una volta e
 * usato trasversalmente da tutti i moduli via API OpenAI. Espone il ciclo di vita del server e un
 * client "Chat Completions". I consumatori importano da `@/modules/llm`.
 */

export type { ChatMessage, ChatOptions, ChatResult } from './client';
export { chatCompletion, countTokens } from './client';
export { ensureLlmReady, startLlm, stopLlm } from './supervisor';
