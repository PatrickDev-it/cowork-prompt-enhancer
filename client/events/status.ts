import { handleStatusUpdate, type StatusPayload } from '@/lib/status-view';

/** Handler generico dell'evento `status` — RFC-0003 § 4. Nessuna conoscenza di dominio. */
export function handleStatus(data: { payload: StatusPayload }) {
  handleStatusUpdate(data.payload);
}
