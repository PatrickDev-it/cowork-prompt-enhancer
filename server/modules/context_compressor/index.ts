import { PROFILE } from '@/config';
import { chatCompletion, countTokens, ensureLlmReady } from '@/modules/llm';

/**
 * Compressione semantica dell'input in HEAD — RFC-0015. Un input grande e grezzo (es. 50k token di
 * codice/documenti) è condensato in ~5-8k token di **informazione utile** (architettura, API, data
 * model, dipendenze, vincoli, TODO + eventuali istruzioni esplicite) PRIMA che raggiunga un modulo.
 * Indipendente da qualunque modulo: `prompt_enhancer` (e futuri) restano invariati e ricevono il
 * condensato al posto del grezzo. Usa il modello condiviso (`@/modules/llm`) via API OpenAI.
 *
 * Perché serve (misurato, RFC-0014 amendment 2): il prefill di un input enorme è model-bound lento e
 * un input > finestra-slot non entrerebbe affatto; condensarlo lo rende processabile, veloce a valle
 * e riusabile. È lossy per costruzione: tiene l'essenziale, scarta il ridondante.
 */

const THRESHOLD = Number(process.env.COWORK_COMPRESS_THRESHOLD_TOKENS ?? 8192);
const CHUNK_TOKENS = Number(process.env.COWORK_COMPRESS_CHUNK_TOKENS ?? 6000);
const TARGET_TOKENS = Number(process.env.COWORK_COMPRESS_TARGET_TOKENS ?? 6000);
const CONCURRENCY = Math.max(1, Number(process.env.COWORK_COMPRESS_CONCURRENCY ?? 3));

const EXTRACT_SYSTEM =
  'You condense a large document for a downstream AI. From the SEGMENT, extract ONLY durable, ' +
  'load-bearing facts an engineer needs: architecture & components, public APIs/interfaces & their ' +
  'signatures, data models/schemas, dependencies & integrations, invariants/constraints/config, and ' +
  'open problems/TODOs/bugs. Preserve concrete names verbatim. ALSO preserve verbatim any explicit ' +
  'user instruction, request, question or task you find. Output dense factual bullet points only — ' +
  'no preamble, no filler, no restating this instruction.';

const SYNTH_SYSTEM =
  'You merge per-segment extracts of a large document into ONE coherent, de-duplicated briefing for ' +
  'a downstream AI that will act on it. Produce structured markdown with sections (as applicable): ' +
  'Task/Request, Architecture, APIs/Interfaces, Data Models, Dependencies, Constraints/Config, Open ' +
  'Issues/TODOs. Preserve concrete names/signatures; drop redundancy; keep it information-dense. Do ' +
  'not invent facts not present in the extracts. Output only the briefing.';

/** Divide il testo in chunk di ~chunkTokens (approssimati a 4 char/token), tagliando su a-capo. */
function chunkText(text: string, chunkTokens: number): string[] {
  const budget = Math.max(2000, chunkTokens * 4);
  if (text.length <= budget) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + budget, text.length);
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end);
      if (nl > i + budget * 0.6) end = nl + 1; // taglia su a-capo se ragionevolmente vicino
    }
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}

async function mapPool<T, R>(items: T[], size: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx] as T, idx);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface CompressResult {
  text: string;
  compressed: boolean;
  inputTokens: number;
  outputTokens: number;
  chunks: number;
}

/**
 * Condensa `text` se supera la soglia; altrimenti lo ritorna intatto. `onLog` riceve messaggi di
 * avanzamento (adatti a `status:log` verso il client).
 */
export async function compressContext(
  text: string,
  onLog?: (line: string) => void,
  signal?: AbortSignal
): Promise<CompressResult> {
  const log = (m: string) => onLog?.(m);
  if (PROFILE === 'local') await ensureLlmReady(signal);

  const inputTokens = await countTokens(text, signal);
  if (inputTokens <= THRESHOLD) {
    return { text, compressed: false, inputTokens, outputTokens: inputTokens, chunks: 0 };
  }

  const chunks = chunkText(text, CHUNK_TOKENS);
  log(`Input grande (~${inputTokens} token): compressione in ${chunks.length} segmenti...`);

  const extracts = await mapPool(chunks, CONCURRENCY, async (chunk, idx) => {
    const res = await chatCompletion({
      messages: [
        { role: 'system', content: EXTRACT_SYSTEM },
        { role: 'user', content: `SEGMENT ${idx + 1}/${chunks.length}:\n${chunk}` },
      ],
      maxTokens: 1024,
      temperature: 0.3,
      think: false,
      signal,
    });
    log(`Segmento ${idx + 1}/${chunks.length} estratto.`);
    return res.content.trim();
  });

  const joined = extracts
    .filter(Boolean)
    .map((e, i) => `## Extract ${i + 1}\n${e}`)
    .join('\n\n');
  log('Sintesi del contesto condensato...');
  const synth = await chatCompletion({
    messages: [
      { role: 'system', content: SYNTH_SYSTEM },
      { role: 'user', content: `Target: ~${TARGET_TOKENS} tokens.\n\nEXTRACTS:\n${joined}` },
    ],
    maxTokens: TARGET_TOKENS,
    temperature: 0.3,
    think: false,
    signal,
  });

  const condensed = `# Condensed context (compressed from ~${inputTokens} tokens of raw input)\n\n${synth.content.trim()}`;
  const outputTokens = await countTokens(condensed, signal);
  log(`Compressione completata: ~${inputTokens} → ~${outputTokens} token.`);
  return { text: condensed, compressed: true, inputTokens, outputTokens, chunks: chunks.length };
}
