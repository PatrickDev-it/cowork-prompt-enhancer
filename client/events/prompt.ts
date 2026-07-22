import { prompt } from '@/lib/prompts';
import type { $WS } from '@/lib/ws';

interface PromptDescriptor {
  key: string;
  name: string;
  props: Record<string, unknown>;
  sub_prompts?: Record<string, PromptDescriptor[]>;
}

interface PromptEventPayload {
  prompt: { key: string; props: Record<string, unknown> };
  sub_prompts?: Record<string, { sub_event?: string; role?: string; prompts?: PromptDescriptor[] }>;
  [key: string]: unknown;
}

async function resolvePrompts(target: Record<string, unknown>, prompts: PromptDescriptor[]) {
  for (const p of prompts) {
    const answer = await prompt(p.key, p.props);
    target[p.name] = answer;
    // Un `checkbox` risolve in un array: si ramifica su OGNI valore selezionato (RFC-0021 § 2).
    // Uno scalare (`select`/`confirm`) è il caso dell'array a un elemento — comportamento invariato.
    // Estensione puramente strutturale: nessuna conoscenza di dominio entra nel client (RFC-0002 § 6).
    const values = Array.isArray(answer) ? answer : [answer];
    for (const value of values) {
      const nested = p.sub_prompts?.[String(value)];
      if (nested) await resolvePrompts(target, nested);
    }
  }
}

/**
 * Esecutore generico del prompt bridge — RFC-0002 § 6. Non contiene alcuna conoscenza
 * di dominio: interpreta solo la struttura dati ricevuta dal server.
 */
export async function handlePrompt(WS: $WS, data: Record<string, unknown>): Promise<void> {
  if (typeof data.uuid !== 'string' || typeof data.payload !== 'object' || data.payload === null) {
    throw new Error('Malformed prompt event');
  }
  const eventPayload = data.payload as unknown as PromptEventPayload;
  if (typeof eventPayload.prompt !== 'object' || eventPayload.prompt === null)
    throw new Error('Malformed prompt schema');
  const {
    prompt: { key, props },
    sub_prompts,
    ...rest
  } = eventPayload;
  const value = await prompt(key, props);
  const sps = sub_prompts?.[String(value)] ?? {};

  const payload: Record<string, unknown> = { ...rest };
  if (Array.isArray(sps.prompts)) await resolvePrompts(payload, sps.prompts);

  WS.emit(String(value), { uuid: data.uuid, sub_event: sps.sub_event, role: sps.role, payload });
}
