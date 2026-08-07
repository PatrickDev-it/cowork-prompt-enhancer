import { GoogleGenAI } from '@google/genai';
import {
  classifyApiError,
  type CompileHandlers,
  type Engine,
  EngineError,
  type EngineInfo,
  schemaForFields,
  SPEC_JSON_SCHEMA,
} from './types';

const MAX_TOKENS = 4096;

export class GeminiEngine implements Engine {
  private readonly client: GoogleGenAI;

  constructor(
    private readonly apiKey: string,
    private readonly modelId: string
  ) {
    if (!apiKey) throw new EngineError('engine_configuration', 'A Google AI API key is required.');
    if (!modelId) throw new EngineError('engine_configuration', 'Select a Gemini model.');
    this.client = new GoogleGenAI({ apiKey });
  }

  info(): EngineInfo {
    return { kind: 'gemini', label: 'Google Gemini', modelId: this.modelId, onDevice: false };
  }

  async compile(prompt: string, handlers: CompileHandlers = {}): Promise<string> {
    try {
      const stream = await this.client.models.generateContentStream({
        model: this.modelId,
        contents: prompt,
        config: {
          maxOutputTokens: handlers.maxTokens ?? MAX_TOKENS,
          responseMimeType: 'application/json',
          responseJsonSchema: handlers.fields ? schemaForFields(handlers.fields) : SPEC_JSON_SCHEMA,
          abortSignal: handlers.signal,
        },
      });

      let full = '';
      for await (const chunk of stream) {
        const delta = chunk.text ?? '';
        if (!delta) continue;
        full += delta;
        handlers.onToken?.(delta);
      }
      return full;
    } catch (error) {
      throw classifyApiError(error, this.apiKey);
    }
  }
}

export async function listGeminiModels(apiKey: string): Promise<string[]> {
  const client = new GoogleGenAI({ apiKey });
  try {
    const ids: string[] = [];
    for await (const model of await client.models.list()) {
      // The API returns fully-qualified names (`models/<id>`); the picker shows the bare id.
      const name = model.name?.replace(/^models\//, '');
      const supportsGenerate = model.supportedActions?.includes('generateContent') ?? true;
      if (name && supportsGenerate) ids.push(name);
    }
    return ids.sort();
  } catch (error) {
    throw classifyApiError(error, apiKey);
  }
}
