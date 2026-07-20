import { type Dirent, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { checkbox, input } from '@inquirer/prompts';
import { PROJECT_SCAN } from '@/config';

/**
 * Primitiva `project-select` — RFC-0021 § 1, gemella di `file-select` (RFC-0009). Scansiona un
 * albero di progetto LOCALE al client, fa scegliere all'utente i file, e ritorna il loro contenuto
 * impacchettato in un'unica stringa (non i path). Come `file-select`, la parte pura (`listProjectTree`)
 * è separata dall'interattiva (`projectSelect`) per essere verificabile senza TTY.
 *
 * I filtri di `PROJECT_SCAN` (config) sono il CONTRATTO, non opzioni cosmetiche: mai segreti, mai
 * cartelle di build/dipendenze, mai file oltre soglia — è la mitigazione della nuova superficie di
 * egress client→server (RFC-0021 § Sicurezza).
 */

interface ProjectSelectProps {
  message?: string;
  defaultDir?: string;
}

/** Converte un pattern con `*` (glob-lite sul basename) in RegExp case-insensitive ancorata. */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

const SECRET_MATCHERS = PROJECT_SCAN.denySecrets.map(globToRegExp);

/** Un basename è un segreto se combacia con un pattern della denylist di sicurezza. */
export function isSecretFile(name: string): boolean {
  return SECRET_MATCHERS.some((re) => re.test(name));
}

function isAllowedFile(name: string): boolean {
  if (isSecretFile(name)) return false;
  return PROJECT_SCAN.allowExtensions.has(extname(name).toLowerCase());
}

/**
 * Elenca i path relativi dei file candidati sotto `root` — puro, nessun TTY. Salta le cartelle in
 * denylist, i file di segreti, le estensioni non in allowlist e i file oltre `maxFileBytes`; limita
 * la profondità. Cartella assente/illeggibile = nessun candidato (confine di sistema, non un errore).
 */
export function listProjectTree(root: string, maxResults = 5000): string[] {
  const out: string[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > PROJECT_SCAN.maxDepth || out.length >= maxResults) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= maxResults) return;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (PROJECT_SCAN.denyDirs.has(entry.name)) continue;
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        if (!isAllowedFile(entry.name)) continue;
        try {
          if (statSync(full).size > PROJECT_SCAN.maxFileBytes) continue;
        } catch {
          continue;
        }
        out.push(relative(root, full).split('\\').join('/'));
      }
    }
  };

  walk(resolve(root), 0);
  return out.sort();
}

/**
 * Disegna un albero ASCII della struttura del progetto dai path relativi dei file candidati (già
 * filtrati da `listProjectTree`: mai segreti, mai cartelle in denylist — RFC-0021, così l'albero non
 * può mai far trapelare un file proibito). Puro, nessun TTY. Dà al modello una MAPPA VISIVA del
 * progetto, sempre presente nel contesto a prescindere da quali file l'utente include per intero.
 * Limitato a `maxBytes` (sottratto dal budget totale, non aggiunto) per non erodere il prefill (RFC-0024).
 */
export function renderProjectTree(relPaths: string[], maxBytes = PROJECT_SCAN.maxTreeBytes): string {
  interface TreeNode {
    children: Map<string, TreeNode>;
  }
  const root: TreeNode = { children: new Map() };

  for (const rel of relPaths) {
    let node = root;
    for (const part of rel.split('/').filter(Boolean)) {
      let child = node.children.get(part);
      if (!child) {
        child = { children: new Map() };
        node.children.set(part, child);
      }
      node = child;
    }
  }

  const lines: string[] = [];
  const render = (node: TreeNode, prefix: string): void => {
    // Cartelle prima dei file, poi alfabetico: mappa leggibile e ordine stabile tra richieste.
    const entries = [...node.children.entries()].sort((a, b) => {
      const aDir = a[1].children.size > 0;
      const bDir = b[1].children.size > 0;
      if (aDir !== bDir) return aDir ? -1 : 1;
      return a[0].localeCompare(b[0]);
    });
    entries.forEach(([name, child], idx) => {
      const last = idx === entries.length - 1;
      const isDir = child.children.size > 0;
      lines.push(`${prefix}${last ? '└─ ' : '├─ '}${name}${isDir ? '/' : ''}`);
      if (isDir) render(child, `${prefix}${last ? '   ' : '│  '}`);
    });
  };
  render(root, '');

  let tree = lines.join('\n');
  if (Buffer.byteLength(tree, 'utf8') > maxBytes) {
    let slice = tree.slice(0, maxBytes);
    const nl = slice.lastIndexOf('\n');
    if (nl > 0) slice = slice.slice(0, nl);
    tree = `${slice}\n… [albero troncato al budget di contesto]`;
  }
  return tree;
}

/**
 * Assembla il contenuto dei file scelti in un unico blocco, rispettando `budget` byte (oltre il
 * tetto, tronca con avviso). Ritorna solo i dati (path + contenuto): l'inquadramento "questo è
 * contesto autorevole del progetto" lo aggiunge il modulo lato server (RFC-0021 § 4), non il client.
 */
export function packFiles(root: string, relPaths: string[], budget = PROJECT_SCAN.maxTotalBytes): string {
  const blocks: string[] = [];
  let total = 0;
  let truncated = false;

  for (const rel of relPaths) {
    if (total >= budget) {
      truncated = true;
      break;
    }
    let content: string;
    try {
      content = readFileSync(join(root, rel), 'utf8');
    } catch {
      continue;
    }
    const remaining = budget - total;
    // Se il file non entra tutto, si include la parte che sta nel budget (tagliata su confine di riga)
    // invece di scartarlo del tutto: con un cap basso, un solo file grande deve comunque dare contesto.
    if (Buffer.byteLength(content, 'utf8') > remaining) {
      let slice = content.slice(0, remaining);
      const nl = slice.lastIndexOf('\n');
      if (nl > remaining * 0.5) slice = slice.slice(0, nl);
      blocks.push(`### ${rel}\n${slice}\n… [file troncato al budget di contesto]`);
      truncated = true;
      break;
    }
    total += Buffer.byteLength(content, 'utf8');
    blocks.push(`### ${rel}\n${content}`);
  }

  if (truncated) {
    blocks.push(`### (nota) contesto troncato a ${budget} byte per stare nei limiti di prefill/decode della GPU.`);
  }
  return blocks.join('\n\n');
}

export async function projectSelect(props: ProjectSelectProps): Promise<string> {
  const dir = await input({
    message: props.message ?? 'Directory del progetto da scansionare:',
    default: props.defaultDir ?? process.cwd(),
  });
  const root = resolve(dir);

  const files = listProjectTree(root);
  if (files.length === 0) {
    throw new Error(`Nessun file candidato trovato in ${root} (controlla percorso, estensioni e filtri di scansione).`);
  }

  const chosen = await checkbox({
    message: 'Quali file includere nel contesto? (spazio per selezionare, invio per confermare)',
    choices: files.map((rel) => ({ name: rel, value: rel })),
    loop: false,
  });

  // La mappa ad albero è SEMPRE inclusa: dà al modello la struttura dell'intero progetto anche quando
  // l'utente sceglie pochi (o zero) file da includere per intero. È sottratta dal budget totale, non
  // aggiunta, così `albero + file` resta ≤ `maxTotalBytes` (project-context bounded — RFC-0024).
  const treeBlock = `## Directory tree\n${renderProjectTree(files)}`;
  if (chosen.length === 0) return treeBlock;

  const fileBudget = Math.max(1024, PROJECT_SCAN.maxTotalBytes - Buffer.byteLength(treeBlock, 'utf8'));
  const packed = packFiles(root, chosen, fileBudget);
  return `${treeBlock}\n\n## Selected file contents\n${packed}`;
}
