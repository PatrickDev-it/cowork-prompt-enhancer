import { detectCapability } from './lib/capability';
import { loadModel, type ModelProgress } from './lib/model';
import { buildPrompt, parseCompiledSpec, renderSpec } from './lib/prompt';

function required<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`index.html is missing the expected "${selector}" element`);
  return el;
}

const requestEl = required<HTMLTextAreaElement>('#request');
const compileBtn = required<HTMLButtonElement>('#compile');
const statusEl = required<HTMLSpanElement>('#status');
const resultEl = required<HTMLDivElement>('#result');
const unsupportedEl = required<HTMLDivElement>('#unsupported');

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function formatProgress(event: ModelProgress): string {
  if (event.status === 'progress' && typeof event.progress === 'number') {
    return `Downloading ${event.file ?? 'model'}… ${Math.round(event.progress)}%`;
  }
  if (event.status === 'ready' || event.status === 'done') return 'Model ready.';
  return event.status;
}

compileBtn.addEventListener('click', async () => {
  const userInput = requestEl.value.trim();
  if (!userInput) {
    requestEl.focus();
    return;
  }

  compileBtn.disabled = true;
  resultEl.textContent = '';
  unsupportedEl.hidden = true;

  try {
    setStatus('Checking browser capability…');
    const capability = await detectCapability();

    setStatus(capability.tier === 'default' ? 'Loading model (WebGPU)…' : 'Loading light model (CPU)…');
    const model = await loadModel(capability.tier, (event) => setStatus(formatProgress(event)));

    setStatus('Compiling…');
    let raw = '';
    await model.generate(buildPrompt(userInput), (token) => {
      raw += token;
      resultEl.textContent = raw;
    });

    const spec = parseCompiledSpec(raw, userInput);
    resultEl.textContent = renderSpec(spec);
    setStatus(`Done — ${model.modelId}`);
  } catch (error) {
    console.error(error);
    unsupportedEl.hidden = false;
    setStatus('Could not run the model in this browser.');
  } finally {
    compileBtn.disabled = false;
  }
});
