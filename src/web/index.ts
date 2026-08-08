import { detectCapability } from './lib/capability';
import { createEngine } from './lib/engine';
import { inspectLocalMemory, releaseLocalModel } from './lib/engine/local';
import { EngineError, type EngineErrorCode } from './lib/engine/types';
import { customChoice, LIGHT_PRESET_ID, type LocalModelChoice, presetById } from './lib/models';
import {
  buildPassPrompt,
  COMPILE_PASSES,
  type CompiledSpec,
  parseCompiledSpec,
  parseStreamingSpec,
} from './lib/prompt';
import {
  type ApiProvider,
  clearStoredKeys,
  isEngineReady,
  loadSettings,
  type Settings,
  saveSettings,
} from './lib/settings';
import { checkIcon, copyIcon, downloadIcon } from './lib/ui/icons';
import { shouldDismissDrawer } from './lib/ui/drawer';
import { SettingsPanel } from './lib/ui/settings-panel';
import { SpecView } from './lib/ui/spec-view';
import { StatusRail } from './lib/ui/status-rail';

function required<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`index.html is missing the expected "${selector}" element`);
  return el;
}

const requestEl = required<HTMLTextAreaElement>('#request');
const compileBtn = required<HTMLButtonElement>('#compile');
const specEl = required<HTMLDivElement>('#spec');
const placeholderEl = required<HTMLDivElement>('#placeholder');
const noticeEl = required<HTMLDivElement>('#notice');
const noticeTitleEl = required<HTMLHeadingElement>('#notice-title');
const noticeBodyEl = required<HTMLParagraphElement>('#notice-body');
const copyAllBtn = required<HTMLButtonElement>('#copy-all');
const downloadBtn = required<HTMLButtonElement>('#download');
const headerModelLabelEl = required<HTMLSpanElement>('#header-model-label');
const openModelDrawerBtn = required<HTMLButtonElement>('#open-model-drawer');
const openSettingsBtn = required<HTMLButtonElement>('#open-settings');
const closeSettingsBtn = required<HTMLButtonElement>('#close-settings');
const panelEl = required<HTMLElement>('#panel');
const drawerGrabEl = required<HTMLDivElement>('#drawer-grab');
const scrimEl = required<HTMLDivElement>('#scrim');
const composerEl = required<HTMLFormElement>('#composer');
const composerStatusEl = required<HTMLDivElement>('#composer-status');
const userTurnEl = required<HTMLElement>('#user-turn');
const userTurnTextEl = required<HTMLParagraphElement>('#user-turn-text');

const REQUEST_PLACEHOLDER = 'Message the prompt compiler…';
let lastComposerStatus = '';

/** The composer is the live activity surface once a submitted prompt leaves the textarea. */
function syncComposerStatus(state: 'idle' | 'busy' | 'ready' | 'error', message: string): void {
  const active = state === 'busy';
  composerEl.dataset.state = state;
  composerStatusEl.hidden = !active;
  requestEl.placeholder = active ? message : REQUEST_PLACEHOLDER;
  if (!active) {
    lastComposerStatus = '';
    return;
  }

  const flip = message !== lastComposerStatus && !message.startsWith('Downloading');
  composerStatusEl.textContent = message;
  composerStatusEl.classList.remove('flip-up');
  if (flip) {
    void composerStatusEl.offsetWidth;
    composerStatusEl.classList.add('flip-up');
  }
  lastComposerStatus = message;
}

const rail = new StatusRail(
  required<HTMLDivElement>('#rail'),
  required<HTMLSpanElement>('#rail-status'),
  required<HTMLSpanElement>('#rail-engine'),
  required<HTMLDivElement>('#rail-progress'),
  syncComposerStatus
);

let settings: Settings = loadSettings();

const PROVIDER_LABELS: Record<ApiProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Gemini',
};

/** Human recovery text per taxonomy code. The previous UI collapsed every failure into one
 * "unsupported browser" notice, which was wrong for most of them. */
const ERROR_COPY: Record<EngineErrorCode, { title: string; hint: string }> = {
  engine_unsupported: {
    title: 'WebGPU unavailable',
    hint: 'This browser could not start the on-device model. Try a recent Chrome, Edge or Firefox on desktop, or switch to an API key in Engine settings.',
  },
  engine_download: {
    title: 'Model could not load',
    hint: 'Check your connection and the model ID. Smaller models in Engine settings need far less bandwidth.',
  },
  engine_configuration: {
    title: 'Engine not configured',
    hint: 'Open Engine settings and finish setting up this provider.',
  },
  engine_auth: {
    title: 'Key rejected',
    hint: 'The provider rejected this API key. Check that it is current and has access to the selected model.',
  },
  engine_rate_limit: {
    title: 'Rate limited',
    hint: 'The provider is throttling this key. Wait a moment, then compile again.',
  },
  engine_context_overflow: {
    title: 'Request too long',
    hint: 'Shorten the request, or pick a model with a larger context window.',
  },
  engine_error: { title: 'Compile failed', hint: 'The engine returned an error.' },
};

function localChoice(): LocalModelChoice {
  if (settings.localPreset === 'custom' && settings.customModelId) return customChoice(settings.customModelId);
  return presetById(settings.localPreset) ?? presetById(LIGHT_PRESET_ID)!;
}

function syncHeaderModel(): void {
  if (settings.engine !== 'local') {
    headerModelLabelEl.textContent = `${PROVIDER_LABELS[settings.engine]} · ${settings.models[settings.engine] || 'configure model'}`;
    return;
  }

  if (settings.localPreset === 'custom') {
    headerModelLabelEl.textContent = settings.customModelId
      ? `Custom · ${settings.customModelId.split('/').pop()}`
      : 'Custom · configure model';
    return;
  }

  const choice = localChoice();
  headerModelLabelEl.textContent = `${choice.label} · ${choice.size}`;
}

function syncRuntimeEngine(): void {
  if (settings.engine === 'local') {
    const choice = localChoice();
    const modelId =
      settings.localPreset === 'custom' && !settings.customModelId ? 'Custom model not configured' : choice.modelId;
    rail.setEngine({ kind: 'local', label: choice.label, modelId, onDevice: true });
    return;
  }

  rail.setEngine({
    kind: settings.engine,
    label: PROVIDER_LABELS[settings.engine],
    modelId: settings.models[settings.engine] || 'Model not configured',
    onDevice: false,
  });
}

function persist(next: Settings): void {
  const providerModelChanged = next.engine !== 'local' && next.models[next.engine] !== settings.models[next.engine];
  const identityChanged =
    next.engine !== settings.engine ||
    next.localPreset !== settings.localPreset ||
    next.customModelId !== settings.customModelId ||
    providerModelChanged;
  const shouldRelease =
    settings.engine === 'local' &&
    (next.engine !== 'local' ||
      next.localPreset !== settings.localPreset ||
      next.customModelId !== settings.customModelId);
  settings = next;
  saveSettings(settings);
  syncHeaderModel();
  syncRuntimeEngine();
  if (shouldRelease) void releaseLocalModel();
  if (identityChanged) {
    rail.set(
      isEngineReady(settings) ? 'ready' : 'idle',
      isEngineReady(settings) ? 'Ready · loads on first compile' : 'Complete model configuration'
    );
  }
}

const panel = new SettingsPanel(required<HTMLDivElement>('#panel-body'), {
  getSettings: () => settings,
  onChange: (next) => persist(next),
  onClearKeys: () => persist(clearStoredKeys(settings)),
  onReleaseLocalModel: releaseLocalModel,
  onInspectLocalMemory: inspectLocalMemory,
  onLocalModelSelected: (value) => {
    if (value !== 'custom') openPanel(false);
  },
});

const specView = new SpecView(specEl, {
  onChange: () => updateExportState(),
  onCopyText: (text, label) => copyToClipboard(text, label),
});

function updateExportState(): void {
  const has = !specView.isEmpty;
  placeholderEl.hidden = has || !userTurnEl.hidden;
  copyAllBtn.hidden = !has;
  downloadBtn.hidden = !has;
}

async function copyToClipboard(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    rail.set('ready', `${label} copied`);
  } catch {
    rail.set('error', 'Clipboard unavailable — select and copy manually.');
  }
}

function showError(error: unknown): void {
  const engineError =
    error instanceof EngineError ? error : new EngineError('engine_error', 'Something went wrong while compiling.');
  const copy = ERROR_COPY[engineError.code];
  noticeTitleEl.textContent = copy.title;
  noticeBodyEl.textContent = `${engineError.message} ${copy.hint}`.trim();
  noticeEl.hidden = false;
  rail.set('error', copy.title);
  // The message is already redacted by the engine layer; the cause is not, so it never leaves here.
  console.error(engineError.code, engineError.message);
}

let panelTrigger: HTMLElement | null = null;

function openPanel(open: boolean, trigger?: HTMLElement): void {
  if (open) panelTrigger = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  panelEl.dataset.open = String(open);
  panelEl.dataset.dragging = 'false';
  panelEl.style.removeProperty('--drawer-drag');
  panelEl.setAttribute('aria-hidden', String(!open));
  panelEl.inert = !open;
  scrimEl.dataset.open = String(open);
  document.body.dataset.drawerOpen = String(open);
  openModelDrawerBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    panel.render();
    window.setTimeout(() => closeSettingsBtn.focus(), 0);
  } else {
    panelTrigger?.focus();
    panelTrigger = null;
  }
}

let inFlight: AbortController | null = null;

async function compile(): Promise<void> {
  const userInput = requestEl.value.trim();
  if (!userInput) {
    requestEl.focus();
    return;
  }

  if (!isEngineReady(settings)) {
    showError(new EngineError('engine_configuration', 'This engine needs an API key and a model.'));
    openPanel(true);
    return;
  }

  inFlight?.abort();
  // Held locally as well: by the time this run's catch fires, `inFlight` may already point at a
  // newer run, and testing that one would report a superseded run's cancellation as a real error.
  const run = new AbortController();
  inFlight = run;

  compileBtn.disabled = true;
  requestEl.disabled = true;
  requestEl.value = '';
  userTurnTextEl.textContent = userInput;
  userTurnEl.hidden = false;
  noticeEl.hidden = true;
  specView.clear();
  updateExportState();

  try {
    rail.set('busy', 'Preparing engine…');
    const engine = await createEngine(settings, localChoice());
    rail.setEngine(engine.info());

    // Three focused passes rather than one ten-field generation: asked for the whole envelope at
    // once, a 1.7B model returns a structurally valid spec whose every list holds one generic
    // sentence. Each pass sees what the previous ones produced.
    const spec: Partial<CompiledSpec> = {};

    for (const [index, pass] of COMPILE_PASSES.entries()) {
      rail.set('busy', `${pass.label} · ${index + 1}/${COMPILE_PASSES.length}`);
      // Draw the pass's sections as skeletons immediately, so the wait before the first token
      // reads as work in progress rather than a finished page.
      specView.setStreaming(spec, null, pass.fields.slice(0, 1));
      updateExportState();

      let raw = '';
      const text = await engine.compile(buildPassPrompt(pass, userInput, spec), {
        signal: run.signal,
        maxTokens: pass.maxTokens,
        fields: pass.fields,
        onProgress: (event) => rail.reportProgress(event),
        onToken: (token) => {
          raw += token;
          // Includes the field mid-write, so text appears character by character rather than a
          // card at a time, plus skeletons for what this pass has not reached yet.
          const streaming = parseStreamingSpec(raw, pass.fields);
          const merged = { ...spec, ...streaming.complete };
          // Only the next section, not every remaining one — four bars pulsing at once read as
          // a stalled page rather than as progress.
          const next = pass.fields.find((field) => !(field in merged) && field !== streaming.active?.field);
          specView.setStreaming(merged, streaming.active, next ? [next] : []);
          updateExportState();
        },
      });

      // Each pass returns only its own keys; merge rather than replace.
      const passSpec = parseCompiledSpec(text || raw, userInput, pass.fields);
      for (const field of pass.fields) {
        const value = passSpec[field];
        if (Array.isArray(value) ? value.length > 0 : String(value ?? '').trim().length > 0) {
          (spec as Record<string, unknown>)[field] = value;
        }
      }
      specView.setStreaming(spec, null, []);
      updateExportState();
    }

    specView.setSpec(spec);
    updateExportState();
    rail.set('ready', 'Compiled');
  } catch (error) {
    if (run.signal.aborted) return;
    showError(error);
  } finally {
    // Only the newest run owns the button; a superseded one must not re-enable it mid-flight.
    if (inFlight === run) {
      compileBtn.disabled = false;
      requestEl.disabled = false;
    }
  }
}

composerEl.addEventListener('submit', (event) => {
  event.preventDefault();
  void compile();
});

requestEl.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    void compile();
  }
});

// Icon-only copy, with a brief checkmark instead of a wordy label.
copyAllBtn.append(copyIcon());
copyAllBtn.addEventListener('click', () => {
  void copyToClipboard(specView.toMarkdown(), 'Specification');
  copyAllBtn.replaceChildren(checkIcon());
  window.setTimeout(() => copyAllBtn.replaceChildren(copyIcon()), 1200);
});

// The bare ".md" label read as a filename, not an action — the icon makes the affordance explicit.
downloadBtn.prepend(downloadIcon());

downloadBtn.addEventListener('click', () => {
  const blob = new Blob([specView.toMarkdown()], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'prompt.md';
  anchor.click();
  URL.revokeObjectURL(url);
});

let drawerPointerId: number | null = null;
let drawerStartY = 0;
let drawerOffset = 0;

function finishDrawerDrag(close: boolean): void {
  if (drawerPointerId !== null && drawerGrabEl.hasPointerCapture(drawerPointerId)) {
    drawerGrabEl.releasePointerCapture(drawerPointerId);
  }
  drawerPointerId = null;
  panelEl.dataset.dragging = 'false';
  if (close) {
    openPanel(false);
  } else {
    panelEl.style.setProperty('--drawer-drag', '0px');
  }
}

drawerGrabEl.addEventListener('pointerdown', (event) => {
  if (panelEl.dataset.open !== 'true') return;
  drawerPointerId = event.pointerId;
  drawerStartY = event.clientY;
  drawerOffset = 0;
  drawerGrabEl.setPointerCapture(event.pointerId);
  panelEl.dataset.dragging = 'true';
});
drawerGrabEl.addEventListener('pointermove', (event) => {
  if (event.pointerId !== drawerPointerId) return;
  drawerOffset = Math.max(0, event.clientY - drawerStartY);
  panelEl.style.setProperty('--drawer-drag', `${drawerOffset}px`);
});
drawerGrabEl.addEventListener('pointerup', (event) => {
  if (event.pointerId !== drawerPointerId) return;
  finishDrawerDrag(shouldDismissDrawer(drawerOffset, panelEl.getBoundingClientRect().height));
});
drawerGrabEl.addEventListener('pointercancel', () => finishDrawerDrag(false));

openSettingsBtn.addEventListener('click', () => openPanel(true, openSettingsBtn));
openModelDrawerBtn.addEventListener('click', () => openPanel(true, openModelDrawerBtn));
closeSettingsBtn.addEventListener('click', () => openPanel(false));
scrimEl.addEventListener('click', () => openPanel(false));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && panelEl.dataset.open === 'true') {
    openPanel(false);
    return;
  }
  if (event.key !== 'Tab' || panelEl.dataset.open !== 'true') return;

  const focusable = Array.from(
    panelEl.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])')
  );
  const [first] = focusable;
  if (!first) return;
  const last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

window.addEventListener('pagehide', () => void releaseLocalModel());

/**
 * First run: pick a tier the device can actually serve before anything downloads, so a machine
 * without WebGPU is not handed a 1 GB model it cannot execute.
 */
async function boot(): Promise<void> {
  syncHeaderModel();
  syncRuntimeEngine();
  updateExportState();

  if (settings.engine !== 'local') {
    rail.set(
      isEngineReady(settings) ? 'ready' : 'idle',
      isEngineReady(settings) ? 'Ready' : 'Add an API key to compile'
    );
    return;
  }

  if (!isEngineReady(settings)) {
    rail.set('idle', 'Enter a custom model ID');
    return;
  }

  const capability = await detectCapability();
  // Downgrade a GPU preset on a device that cannot serve it. A pasted custom repo is left alone:
  // choosing it is an explicit act, and silently overriding it would be worse than letting it fail.
  const preset = presetById(settings.localPreset);
  if (capability.tier === 'light' && preset?.device === 'webgpu') {
    persist({ ...settings, localPreset: LIGHT_PRESET_ID });
  }

  const choice = localChoice();
  rail.setEngine({ kind: 'local', label: choice.label, modelId: choice.modelId, onDevice: true });
  rail.set('ready', capability.webgpu ? 'Ready · model loads on first compile' : 'Ready · CPU fallback');
}

void boot();
