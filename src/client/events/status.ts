import { handleStatusUpdate, type StatusPayload } from '@/lib/status-view';

/** Handler generico dell'evento `status` — RFC-0003 § 4. Nessuna conoscenza di dominio. */
export function handleStatus(data: Record<string, unknown>): void {
  if (typeof data.payload !== 'object' || data.payload === null) return;
  handleStatusUpdate(data.payload as unknown as StatusPayload);
}
