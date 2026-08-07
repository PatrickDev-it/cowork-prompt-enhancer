import type { $WSServer } from '@/lib/ws';
import type { FileOp, FileOpRequest, FileOps } from './types';

const KNOWN: readonly FileOp[] = ['write', 'append', 'mkdir', 'delete', 'move'];

export class CapabilityMismatchError extends Error {
  readonly code = 'capability_mismatch' as const;
}
function isFileOp(value: string): value is FileOp {
  return (KNOWN as readonly string[]).includes(value);
}

/**
 * Set of file operations advertised by the client, per connection — RFC-0008 § 2. The client
 * declares what it knows how to execute; the server never invokes an operation outside that set.
 */
const advertised = new WeakMap<$WSServer, Set<FileOp>>();

/** Records the client's advertisement (data off the wire: unknown ops are discarded). */
export function rememberAdvertisedOps(WS: $WSServer, ops: unknown) {
  const list = Array.isArray(ops) ? ops.filter((o): o is string => typeof o === 'string') : [];
  advertised.set(WS, new Set(list.filter(isFileOp)));
}

/**
 * Builds the `ctx.fs` for a tool bound to one connection — RFC-0008 § 5. Every call checks that
 * the op is in the set the client advertised (§ 2) and emits `fileop` with the session uuid. An
 * op that wasn't advertised is a loud error (→ `status: error` in the runtime), never silently dropped.
 */
export function createFileOps(WS: $WSServer, correlationId = WS.sessionId): FileOps {
  const send = (req: FileOpRequest) => {
    if (!advertised.get(WS)?.has(req.op)) {
      throw new CapabilityMismatchError(`Operation '${req.op}' is not supported by this session's client.`);
    }
    WS.emit('fileop', { uuid: correlationId, payload: req });
  };
  return {
    write: (path, content) => send({ op: 'write', path, content }),
    append: (path, content) => send({ op: 'append', path, content }),
    mkdir: (path) => send({ op: 'mkdir', path }),
    delete: (path) => send({ op: 'delete', path }),
    move: (from, to) => send({ op: 'move', path: from, to }),
  };
}
