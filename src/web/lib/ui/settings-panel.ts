import { listModels } from '../engine';
import { EngineError } from '../engine/types';
import { LOCAL_MODEL_PRESETS } from '../models';
import type { ApiProvider, EngineKind, Settings } from '../settings';

const PROVIDER_LABELS: Record<ApiProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
};

const KEY_HINTS: Record<ApiProvider, string> = {
  anthropic: 'console.anthropic.com → API keys',
  openai: 'platform.openai.com → API keys',
  gemini: 'aistudio.google.com → Get API key',
};

export interface SettingsPanelOptions {
  getSettings: () => Settings;
  onChange: (next: Settings) => void;
  onClearKeys: () => void;
  onReleaseLocalModel: () => Promise<void>;
  onInspectLocalMemory: () => Promise<string>;
  onLocalModelSelected: (value: string) => void;
}

/**
 * Engine configuration: on-device model choice, or a provider plus the user's own key.
 *
 * Provider model lists are fetched from the account rather than hardcoded, so the picker reflects
 * what that key can actually reach and never offers an identifier that has since been retired.
 */
export class SettingsPanel {
  constructor(
    private readonly body: HTMLElement,
    private readonly options: SettingsPanelOptions
  ) {}

  render(): void {
    const settings = this.options.getSettings();
    const children: HTMLElement[] = [this.buildEngineSelector(settings)];

    if (settings.engine === 'local') {
      children.push(this.buildLocalSection(settings));
    } else {
      children.push(this.buildProviderSection(settings, settings.engine));
      children.push(this.buildSecurityNote());
    }

    this.body.replaceChildren(...children);
  }

  private buildEngineSelector(settings: Settings): HTMLElement {
    const field = document.createElement('div');
    field.className = 'field';
    field.append(this.label('Where it runs'));

    const group = document.createElement('div');
    group.className = 'segmented';

    const options: Array<[EngineKind, string]> = [
      ['local', 'On device'],
      ['anthropic', 'Anthropic'],
      ['openai', 'OpenAI'],
      ['gemini', 'Gemini'],
    ];

    for (const [kind, label] of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.setAttribute('aria-pressed', String(settings.engine === kind));
      button.addEventListener('click', () => {
        this.options.onChange({ ...this.options.getSettings(), engine: kind });
        this.render();
      });
      group.append(button);
    }

    field.append(group);

    const note = document.createElement('p');
    note.className = 'field-note';
    note.textContent =
      settings.engine === 'local'
        ? 'Nothing leaves this browser. The model downloads once and is cached here.'
        : `Your request is sent to ${PROVIDER_LABELS[settings.engine]} using your key.`;
    field.append(note);

    return field;
  }

  private buildLocalSection(settings: Settings): HTMLElement {
    const field = document.createElement('div');
    field.className = 'field';
    field.append(this.label('Model'));

    const choices = document.createElement('div');
    choices.className = 'model-options';
    choices.setAttribute('role', 'radiogroup');
    choices.setAttribute('aria-label', 'On-device model');

    for (const preset of LOCAL_MODEL_PRESETS) {
      choices.append(this.buildModelOption(preset.id, preset.label, preset.note, preset.size, settings));
    }
    choices.append(
      this.buildModelOption(
        'custom',
        'Custom model',
        'Use a transformers.js-compatible Hugging Face repository.',
        'variable',
        settings
      )
    );
    field.append(choices);

    if (settings.localPreset === 'custom') {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'onnx-community/…';
      input.value = settings.customModelId;
      input.addEventListener('change', () => {
        this.options.onChange({ ...this.options.getSettings(), customModelId: input.value.trim() });
      });
      field.append(input);
      field.append(this.note('Any transformers.js-compatible repo. Larger models need a capable GPU.'));
    }

    const release = document.createElement('button');
    release.type = 'button';
    release.className = 'ghost-button';
    release.textContent = 'release model from memory';
    release.addEventListener('click', async () => {
      release.disabled = true;
      release.textContent = 'releasing…';
      await this.options.onReleaseLocalModel();
      release.textContent = 'model released';
    });
    field.append(
      release,
      this.note('Downloaded files remain in the browser cache; this only releases active model memory.')
    );

    const inspectMemory = document.createElement('button');
    inspectMemory.type = 'button';
    inspectMemory.className = 'ghost-button';
    inspectMemory.textContent = 'measure browser memory';
    const memoryNote = this.note(
      'Uses a browser-provided measurement when available; it does not estimate GPU memory.'
    );
    inspectMemory.addEventListener('click', async () => {
      inspectMemory.disabled = true;
      memoryNote.textContent = 'Measuring…';
      memoryNote.textContent = await this.options.onInspectLocalMemory();
      inspectMemory.disabled = false;
    });
    field.append(inspectMemory, memoryNote);

    return field;
  }

  private buildModelOption(
    value: string,
    title: string,
    description: string,
    size: string,
    settings: Settings
  ): HTMLLabelElement {
    const option = document.createElement('label');
    option.className = 'model-option';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'local-model';
    radio.value = value;
    radio.checked = settings.localPreset === value;
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      this.options.onChange({ ...this.options.getSettings(), engine: 'local', localPreset: value });
      if (value === 'custom') this.render();
      this.options.onLocalModelSelected(value);
    });

    const copy = document.createElement('span');
    copy.className = 'model-option-copy';
    const strong = document.createElement('strong');
    strong.textContent = title;
    const note = document.createElement('small');
    note.textContent = description;
    copy.append(strong, note);

    const footprint = document.createElement('span');
    footprint.className = 'model-option-size';
    footprint.textContent = size;
    option.append(radio, copy, footprint);
    return option;
  }

  private buildProviderSection(settings: Settings, provider: ApiProvider): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'field';
    wrapper.append(this.label(`${PROVIDER_LABELS[provider]} API key`));

    const input = document.createElement('input');
    input.type = 'password';
    input.autocomplete = 'off';
    input.placeholder = 'paste your key';
    input.value = settings.keys[provider];
    input.addEventListener('change', () => {
      const next = this.options.getSettings();
      this.options.onChange({ ...next, keys: { ...next.keys, [provider]: input.value.trim() } });
    });
    wrapper.append(input);
    wrapper.append(this.note(KEY_HINTS[provider]));

    wrapper.append(this.label('Model'));

    const modelRow = document.createElement('div');
    modelRow.className = 'segmented';

    const modelInput = document.createElement('input');
    modelInput.type = 'text';
    modelInput.placeholder = 'model id';
    modelInput.value = settings.models[provider];
    modelInput.addEventListener('change', () => {
      const next = this.options.getSettings();
      this.options.onChange({ ...next, models: { ...next.models, [provider]: modelInput.value.trim() } });
    });

    const fetchButton = document.createElement('button');
    fetchButton.type = 'button';
    fetchButton.className = 'ghost-button';
    fetchButton.textContent = 'list models';

    const status = document.createElement('p');
    status.className = 'field-note';

    fetchButton.addEventListener('click', async () => {
      const current = this.options.getSettings();
      fetchButton.disabled = true;
      status.textContent = 'Fetching…';
      try {
        const ids = await listModels(provider, current.keys[provider]);
        const list = document.createElement('select');
        for (const id of ids) {
          const option = document.createElement('option');
          option.value = id;
          option.textContent = id;
          option.selected = id === current.models[provider];
          list.append(option);
        }
        list.addEventListener('change', () => {
          const next = this.options.getSettings();
          this.options.onChange({ ...next, models: { ...next.models, [provider]: list.value } });
          modelInput.value = list.value;
        });
        modelInput.replaceWith(list);
        status.textContent = `${ids.length} models available to this key.`;
      } catch (error) {
        status.textContent = error instanceof EngineError ? error.message : 'Could not list models.';
      } finally {
        fetchButton.disabled = false;
      }
    });

    modelRow.append(modelInput, fetchButton);
    wrapper.append(modelRow, status);

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'ghost-button';
    clear.textContent = 'forget all stored keys';
    clear.addEventListener('click', () => {
      this.options.onClearKeys();
      this.render();
    });
    wrapper.append(clear);

    return wrapper;
  }

  private buildSecurityNote(): HTMLElement {
    const note = document.createElement('div');
    note.className = 'security-note';

    const heading = document.createElement('strong');
    heading.textContent = 'About storing a key here. ';

    const body = document.createTextNode(
      'It is kept in this browser’s local storage and sent only to the provider you selected — there is no ' +
        'server of ours to send it to. That also means anyone with access to this device, or any script running ' +
        'on this page, can read it. Prefer a key scoped to this use, and remove it when you are done. The ' +
        'on-device engine needs no key at all.'
    );

    note.append(heading, body);
    return note;
  }

  private label(text: string): HTMLElement {
    const el = document.createElement('label');
    el.textContent = text;
    return el;
  }

  private note(text: string): HTMLElement {
    const el = document.createElement('p');
    el.className = 'field-note';
    el.textContent = text;
    return el;
  }
}
