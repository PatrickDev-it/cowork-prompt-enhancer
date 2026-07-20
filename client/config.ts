import { join, resolve } from 'node:path';

export const IP = process.env.COWORK_SERVER_IP ?? 'localhost';
export const PORT = Number(process.env.COWORK_SERVER_PORT ?? 8080);

/**
 * `input/` e `output/` vivono entrambe sotto un'unica cartella `(io)/` (Input/Output) dentro il
 * progetto client — evita di sparpagliare cartelle di scambio locale alla radice del workspace.
 */
const IO_DIR = join(import.meta.dir, '(io)');

/**
 * Cartella di output dove atterrano gli artefatti consegnati dal server — RFC-0008 § 1.
 * Ogni sessione ha la sua sottocartella `{uuid}` qui dentro. Di default `.workspaces/client/(io)/output/`,
 * override completo via `COWORK_ROOT`. Unica fonte del percorso (nessun path altrove). Creata
 * (se assente) allo start del client — vedi `lib/io.ts`.
 */
export const ROOT = resolve(process.env.COWORK_ROOT ?? join(IO_DIR, 'output'));

/**
 * Cartella dove l'utente prepara testi lunghi da usare come valore di un prompt
 * `file-select` — RFC-0009 § 1. Di default `.workspaces/client/(io)/input/`,
 * override via `COWORK_INPUT_DIR`. Unica fonte del percorso, come `ROOT`. Creata
 * (se assente) allo start del client — vedi `lib/io.ts`.
 */
export const INPUT_DIR = resolve(process.env.COWORK_INPUT_DIR ?? join(IO_DIR, 'input'));

/**
 * Scansione del progetto per la primitiva `project-select` — RFC-0021. Il client legge SOLO la
 * propria fs locale, l'utente sceglie esplicitamente i file, e questi filtri sono il **contratto**
 * (non opzioni cosmetiche): niente segreti, niente cartelle di build, niente binari, un tetto di
 * dimensione. Tutto override via env, ma i default devono già essere sicuri a config zero.
 */
export const PROJECT_SCAN = {
  /** Cartelle mai attraversate (build, VCS, dipendenze, cache). */
  denyDirs: new Set(
    (
      process.env.COWORK_SCAN_DENY_DIRS ??
      '.git,node_modules,dist,build,out,.next,.nuxt,.svelte-kit,coverage,.venv,venv,__pycache__,.mypy_cache,.pytest_cache,target,vendor,.turbo,.cache,.idea,.vscode'
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  ),
  /**
   * Denylist di sicurezza (RFC-0021 § 1): file di segreti/credenziali mai listati né letti. È parte
   * del contratto della feature — la nuova superficie di egress client→server non deve mai includerli.
   * Match sul basename, case-insensitive, con `*` come wildcard.
   */
  denySecrets: (
    process.env.COWORK_SCAN_DENY_SECRETS ??
    '.env,.env.*,*.pem,*.key,*.p12,*.pfx,*.crt,*.cer,id_rsa*,id_ed25519*,*.keystore,credentials*,secrets*,.npmrc,.netrc,.pypirc,*.tfvars'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  /** Allowlist di estensioni (sorgenti/testo). Solo questi entrano nel multi-select. */
  allowExtensions: new Set(
    (
      process.env.COWORK_SCAN_EXTENSIONS ??
      '.ts,.tsx,.js,.jsx,.mjs,.cjs,.py,.rs,.go,.java,.kt,.rb,.php,.c,.h,.cpp,.hpp,.cs,.swift,.scala,.sql,.sh,.md,.txt,.json,.jsonc,.yaml,.yml,.toml,.ini,.env.example,.css,.scss,.html,.vue,.svelte,.astro,.gradle,.dockerfile'
    )
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  ),
  /** Tetto per singolo file (byte): oltre → escluso dal candidato (ma `packFiles` tronca comunque al budget totale). */
  maxFileBytes: Number(process.env.COWORK_SCAN_MAX_FILE_BYTES ?? 128 * 1024),
  /**
   * Tetto totale del bundle assemblato (byte). **24 KB (≈ 6-9k token)** dopo la migrazione a Qwen3-8B dense
   * (RFC-0023, 2026-07-08): il **prefill è ~15× più veloce** (~1500 vs ~100 tok/s del vecchio ibrido) → il
   * contesto grande NON è più il collo di bottiglia, e resta sotto la ctx per-slot (10922 token con
   * `--ctx-size 32768 --parallel 3`) lasciando spazio per compiler-prompt + output. Verbatim, niente
   * compressione. Alzabile via env: su hardware più veloce o con `--parallel` ridotto (slot più grandi) si
   * possono dare molti più file. Vedi anche `server/config.ts` `--ctx-size`.
   */
  maxTotalBytes: Number(process.env.COWORK_SCAN_MAX_TOTAL_BYTES ?? 24 * 1024),
  /**
   * Tetto della mappa ad albero della struttura di progetto (byte) — sempre inclusa nel contesto per dare
   * al modello una vista d'insieme del progetto (`renderProjectTree`). È **sottratta** da `maxTotalBytes`,
   * non sommata: `albero + contenuti file` resta ≤ `maxTotalBytes`, così il project-context resta bounded
   * esattamente come prima (nessun rischio di superare la soglia di compressione / il budget di prefill —
   * RFC-0024). L'albero sono solo path: 6 KB coprono centinaia di file.
   */
  maxTreeBytes: Number(process.env.COWORK_SCAN_MAX_TREE_BYTES ?? 6 * 1024),
  /** Profondità massima di ricorsione, difesa contro alberi patologici. */
  maxDepth: Number(process.env.COWORK_SCAN_MAX_DEPTH ?? 12),
} as const;
