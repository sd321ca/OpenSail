import { api, errorText, stream, uploadFile } from "../api";
import {
  confirmDialog,
  escapeHtml,
  icon,
  openModal,
  plainText,
  queryElement,
  renderMarkdown,
  setButtonBusy,
  spinner,
  toast,
} from "../ui";
import type {
  Bootstrap,
  ChatPersonaSettings,
  ChatPersonas,
  RenderContext,
  TtsModel,
} from "../types";

const STORAGE_KEY = "opensail.chat.settings.v1";
const SpeechRecognitionCtor =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;
const speechInputReady =
  Boolean(SpeechRecognitionCtor) &&
  typeof window !== "undefined" &&
  window.isSecureContext;

// Absolute so the layout keeps resolving once the modules are bundled into
// /assets/app.js instead of living beside chat.html.
const CHAT_TEMPLATE_URL = "/assets/pages/chat.html";

let templatePromise: Promise<string> | null = null;

function loadChatTemplate(): Promise<string> {
  if (!templatePromise) {
    templatePromise = fetch(CHAT_TEMPLATE_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load the chat layout (${response.status}).`);
        }
        return response.text();
      })
      .catch((error: unknown) => {
        templatePromise = null;
        throw error;
      });
  }
  return templatePromise;
}

/** The subset of chat settings persisted in localStorage. */
interface ChatSettings {
  model: string;
  systemPrompt: string;
  thinking: boolean;
  engine: string;
  browserVoice: string;
  ttsVoice: string;
  persona: string;
}

/** An uploaded image attached to the next message. */
interface PendingImage {
  id: string;
  url: string;
  name: string;
}

/** One rendered turn in the conversation. */
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  images?: PendingImage[];
  streaming?: boolean;
  stopped?: boolean;
}

/** Events streamed by ``POST /api/chat/stream``. */
interface ChatStreamEvent {
  type?: string;
  message?: string;
  text?: string;
  url?: string;
  status?: string;
  loaded?: boolean;
}

interface ChatStatusResponse {
  status?: string;
  loaded?: boolean;
  personas?: ChatPersonas;
  voices?: string[];
}

function loadSettings(boot: Bootstrap): ChatSettings {
  let saved: Partial<ChatSettings> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<ChatSettings>;
  } catch {
    saved = {};
  }
  return {
    model: saved.model || boot.default_chat_model || "",
    systemPrompt: saved.systemPrompt ?? boot.chat_system_prompt ?? "",
    thinking: saved.thinking ?? false,
    engine: saved.engine || "off",
    browserVoice: saved.browserVoice || "",
    ttsVoice: saved.ttsVoice || "",
    persona: saved.persona || "",
  };
}

function saveSettings(settings: ChatSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable in private windows; settings still work.
  }
}

export async function renderChat(
  root: HTMLElement,
  ctx: RenderContext,
): Promise<() => void> {
  if (!ctx.boot) throw new Error("Chat page requires the bootstrap payload.");
  const boot: Bootstrap = ctx.boot;
  const settings = loadSettings(boot);
  const messages: ChatMessage[] = [];
  let pendingImages: PendingImage[] = [];
  let running = false;
  let controller: AbortController | null = null;
  let ttsVoices: string[] = [];
  let ttsVoicesModel = "";
  let statusText = boot.chat_loaded
    ? boot.chat_status
    : "No model loaded. It loads on the first message.";
  let phaseText = "";
  let talkRecognition: SpeechRecognitionLike | null = null;
  let talkState = "idle";
  let talkFinal = "";
  let talkInterim = "";
  let talkPressed = false;
  let talkReleaseRequested = false;
  let talkErrored = false;
  let talkCancelled = false;
  let talkDisposed = false;

  const chatModels = boot.chat_models || [];
  const modelOptions = chatModels
    .map(
      (model) =>
        `<option value="${escapeHtml(model.path)}" ${model.path === settings.model ? "selected" : ""}>${escapeHtml(model.alias)}</option>`,
    )
    .join("");

  const ttsModels = boot.tts_models || [];
  const ttsModelIds = new Set(ttsModels.map((model) => model.id));

  // A server-side voice engine is any text-to-speech model from
  // audio_models.json; "off" and "browser" are handled by the browser.
  function isServerEngine(engine: string): boolean {
    return ttsModelIds.has(engine);
  }

  function selectedTtsModel(): TtsModel | null {
    return ttsModels.find((model) => model.id === settings.engine) || null;
  }

  root.innerHTML = await loadChatTemplate();
  root.querySelectorAll<HTMLElement>("[data-icon]").forEach((element) => {
    element.innerHTML = icon(
      element.dataset.icon || "info",
      element.dataset.iconClass || "h-4 w-4",
    );
  });

  const $ = <T extends Element>(selector: string): T =>
    queryElement<T>(root, selector);
  const messagesEl = $<HTMLElement>("[data-messages]");
  const input = $<HTMLTextAreaElement>("[data-input]");
  const form = $<HTMLFormElement>("[data-composer]");
  const sendButton = $<HTMLButtonElement>("[data-send]");
  const stopButton = $<HTMLButtonElement>("[data-stop]");
  const modelSelect = $<HTMLSelectElement>("[data-model]");
  const attachLabel = $<HTMLElement>("[data-attach]");
  const fileInput = $<HTMLInputElement>("[data-file]");
  const talkButton = $<HTMLButtonElement>("[data-talk]");
  const talkLabel = $<HTMLElement>("[data-talk-label]");
  const attachmentsEl = $<HTMLElement>("[data-attachments]");
  const chatStatus = $<HTMLElement>("[data-chat-status]");
  const phaseChip = $<HTMLElement>("[data-chat-phase]");
  const modelChip = $<HTMLElement>("[data-model-chip]");
  const spoken = $<HTMLAudioElement>("[data-spoken]");
  const spokenWrap = $<HTMLElement>("[data-spoken-wrap]");
  const systemInput = $<HTMLTextAreaElement>("[data-system]");
  const thinkingInput = $<HTMLInputElement>("[data-thinking]");
  const engineSelect = $<HTMLSelectElement>("[data-engine]");
  const browserVoiceSelect = $<HTMLSelectElement>("[data-browser-voice]");
  const browserVoiceWrap = $<HTMLElement>("[data-browser-voice-wrap]");
  const ttsVoiceSelect = $<HTMLSelectElement>("[data-tts-voice]");
  const ttsVoiceWrap = $<HTMLElement>("[data-tts-voice-wrap]");
  const personaSelect = $<HTMLSelectElement>("[data-persona]");
  const personaSaveButton = $<HTMLButtonElement>("[data-persona-save]");
  const personaDeleteButton = $<HTMLButtonElement>("[data-persona-delete]");

  let personas: ChatPersonas = boot.chat_personas || {};
  let selectedPersona = "";
  // Name offered by the Save dialog. It survives a manual edit (which switches
  // the dropdown to Custom) so the edited settings can update that persona.
  let personaDraft = "";

  if (SpeechRecognitionCtor) {
    talkButton.classList.remove("hidden");
    if (!speechInputReady) {
      talkButton.classList.add("cursor-not-allowed", "opacity-40");
      talkButton.title = "Voice input requires HTTPS or localhost.";
      talkButton.setAttribute("aria-label", talkButton.title);
    }
  }

  modelSelect.innerHTML =
    modelOptions || '<option value="">No models configured</option>';
  systemInput.value = settings.systemPrompt;
  thinkingInput.checked = settings.thinking;
  // Every text-to-speech model is offered as a server-side voice engine.
  for (const model of ttsModels) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.alias;
    engineSelect.append(option);
  }
  const engineValues = [...engineSelect.options].map((option) => option.value);
  if (engineValues.includes(settings.engine)) {
    engineSelect.value = settings.engine;
  }
  // Keep the stored engine consistent with the rendered select (for example a
  // speech model that was removed from audio_models.json).
  settings.engine = engineSelect.value;

  saveSettings(settings);

  /* ---------------------------------------------------------------- */
  /* Messages                                                         */
  /* ---------------------------------------------------------------- */

  function emptyChatHtml(): string {
    return `
      <div class="flex h-full min-h-[24rem] flex-col items-center justify-center gap-4 px-6 py-10 text-center">
        <div class="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent-400/20 bg-accent-500/10 text-accent-300">${icon("chat", "h-7 w-7")}</div>
        <div>
          <p class="text-sm font-semibold text-slate-200">Start a conversation</p>
          <p class="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">Replies stream from a local GGUF model. Attach an image if the selected model has a vision projector configured.</p>
        </div>
        <div class="flex flex-wrap justify-center gap-2">
          ${["Summarize this image", "Help me write a prompt", "Explain a ComfyUI node"]
            .map(
              (prompt) =>
                `<button class="chip transition hover:border-accent-400/30 hover:text-accent-200" data-suggestion="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  function renderMessages(): void {
    if (!messages.length) {
      messagesEl.innerHTML = emptyChatHtml();
      messagesEl.querySelectorAll<HTMLElement>("[data-suggestion]").forEach((button) => {
        button.addEventListener("click", () => {
          input.value = button.dataset.suggestion || "";
          input.focus();
        });
      });
      return;
    }

    messagesEl.innerHTML = messages
      .map((message, index) => {
        if (message.role === "user") {
          return `
            <div class="flex justify-end gap-2.5 px-4 py-2 sm:px-5" data-message="${index}">
              <div class="min-w-0 max-w-[88%]">
                <div class="chat-bubble-user">${plainText(message.content)}</div>
                ${
                  message.images?.length
                    ? `<div class="mt-2 flex flex-wrap justify-end gap-2">${message.images
                        .map(
                          (image) =>
                            `<a href="${escapeHtml(image.url)}" target="_blank" rel="noopener noreferrer" class="block h-20 w-20 overflow-hidden rounded-xl border border-white/10"><img src="${escapeHtml(image.url)}" alt="Attached image" class="h-full w-full object-cover" /></a>`,
                        )
                        .join("")}</div>`
                    : ""
                }
              </div>
              <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-[11px] font-semibold text-slate-400">You</span>
            </div>
          `;
        }
        return `
          <div class="flex gap-2.5 px-4 py-2 sm:px-5" data-message="${index}">
            <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-500/10 text-accent-300">${icon("sparkles", "h-4 w-4")}</span>
            <div class="chat-bubble-assistant min-w-0">
              <div class="prose-notes" data-bubble>${renderMarkdown(message.content) || `<span class="text-slate-500">${message.stopped ? "Stopped." : "Thinking…"}</span>`}</div>
              ${message.streaming ? '<span class="mt-1 inline-block h-3.5 w-1 animate-pulse rounded-full bg-accent-400 align-middle"></span>' : ""}
            </div>
          </div>
        `;
      })
      .join("");
    scrollToBottom(true);
  }

  function updateStreamingMessage(message: ChatMessage): void {
    const index = messages.indexOf(message);
    const node = messagesEl.querySelector<HTMLElement>(
      `[data-message="${index}"] [data-bubble]`,
    );
    if (!node) {
      renderMessages();
      return;
    }
    node.innerHTML = renderMarkdown(message.content) || `<span class="text-slate-500">${message.stopped ? "Stopped." : "Thinking…"}</span>`;
    const cursor = node.parentElement?.querySelector(".animate-pulse");
    if (!message.streaming) cursor?.remove();
    scrollToBottom();
  }

  function scrollToBottom(force = false): void {
    const distance = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
    if (force || distance < 180) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Attachments                                                      */
  /* ---------------------------------------------------------------- */

  function renderAttachments(): void {
    attachmentsEl.classList.toggle("hidden", !pendingImages.length);
    attachmentsEl.innerHTML = pendingImages
      .map(
        (image, index) => `
        <div class="relative h-16 w-16 overflow-hidden rounded-lg border border-white/10">
          <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.name || "Attachment")}" class="h-full w-full object-cover" />
          <button type="button" class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-rose-500" data-remove-attachment="${index}" aria-label="Remove attachment">${icon("close", "h-3 w-3")}</button>
        </div>
      `,
      )
      .join("");
    attachmentsEl.querySelectorAll<HTMLElement>("[data-remove-attachment]").forEach((button) => {
      button.addEventListener("click", () => {
        pendingImages.splice(Number(button.dataset.removeAttachment), 1);
        renderAttachments();
      });
    });
  }

  function updateAttachAvailability(): void {
    const model = chatModels.find((entry) => entry.path === modelSelect.value);
    const multimodal = Boolean(model?.multimodal);
    attachLabel.classList.toggle("cursor-pointer", multimodal);
    attachLabel.classList.toggle("cursor-not-allowed", !multimodal);
    attachLabel.classList.toggle("opacity-40", !multimodal);
    attachLabel.setAttribute("aria-disabled", String(!multimodal));
    attachLabel.title = multimodal
      ? "Attach an image"
      : "This model does not support images";
    fileInput.disabled = !multimodal;
    if (!multimodal && pendingImages.length) {
      pendingImages = [];
      renderAttachments();
    }
  }

  fileInput.addEventListener("change", async (event) => {
    const target = event.target as HTMLInputElement;
    const files = [...(target.files || [])];
    target.value = "";
    for (const file of files) {
      try {
        const stored = await uploadFile(file);
        pendingImages.push({ id: stored.id, url: stored.url, name: stored.name });
        renderAttachments();
      } catch (error) {
        toast(errorText(error), "error");
      }
    }
  });

  /* ---------------------------------------------------------------- */
  /* Push to talk                                                     */
  /* ---------------------------------------------------------------- */

  function setTalkState(state: string): void {
    talkState = state;
    const active = state === "starting" || state === "listening";
    talkButton.classList.toggle("btn-secondary", !active);
    talkButton.classList.toggle("btn-danger", active);
    talkButton.setAttribute("aria-pressed", String(active));
    const label = !speechInputReady
      ? "Voice input requires HTTPS or localhost."
      : state === "finishing"
        ? "Transcribing…"
        : active
          ? "Release to Send"
          : "Hold to Talk";
    talkLabel.textContent = label;
    talkButton.title = label;
    talkButton.setAttribute("aria-label", label);
    talkButton.disabled =
      state === "finishing" || running || !chatModels.length || !speechInputReady;
    if (active) setPhase("Listening…");
    else if (state === "finishing") setPhase("Transcribing…");
    else setPhase("");
  }

  function finishTalk(): void {
    if (talkDisposed || talkCancelled) return;
    const text = `${talkFinal} ${talkInterim}`.replace(/\s+/g, " ").trim();
    const errored = talkErrored;
    talkRecognition = null;
    talkFinal = "";
    talkInterim = "";
    talkPressed = false;
    talkReleaseRequested = false;
    talkErrored = false;
    setTalkState("idle");
    if (!text) {
      if (!errored) toast("No speech was detected.", "warning", 2200);
      return;
    }
    const existing = input.value.trim();
    input.value = existing ? `${existing} ${text}` : text;
    void sendMessage();
  }

  function stopTalk(): void {
    talkReleaseRequested = true;
    if (talkState === "idle" || talkState === "finishing") return;
    if (talkState === "starting") return;
    setTalkState("finishing");
    try {
      talkRecognition?.stop();
    } catch {
      finishTalk();
    }
  }

  function startTalk(): void {
    if (
      !speechInputReady ||
      !SpeechRecognitionCtor ||
      running ||
      !chatModels.length ||
      talkState !== "idle"
    ) {
      return;
    }
    talkCancelled = false;
    talkErrored = false;
    talkReleaseRequested = false;
    talkFinal = "";
    talkInterim = "";
    // Avoid feeding the assistant's own speech back into the microphone.
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    spoken.pause();
    const recognition = new SpeechRecognitionCtor();
    talkRecognition = recognition;
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (talkDisposed || talkCancelled) return;
      if (talkState === "starting") setTalkState("listening");
      if (talkReleaseRequested) stopTalk();
    };

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript || "";
        if (result.isFinal) talkFinal += transcript;
        else interim += transcript;
      }
      talkInterim = interim;
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted" || talkDisposed || talkCancelled) return;
      talkErrored = true;
      const messagesByError: Record<string, string> = {
        "not-allowed": "Microphone access was denied.",
        "audio-capture": "No microphone was found.",
        "no-speech": "No speech was detected.",
        network: "Speech recognition needs a network connection.",
      };
      toast(
        messagesByError[event.error] || `Speech recognition failed: ${event.error}`,
        event.error === "no-speech" ? "warning" : "error",
      );
    };

    recognition.onend = () => {
      if (talkDisposed || talkCancelled) return;
      if (!talkReleaseRequested && talkPressed && !talkErrored) {
        // Browsers can end recognition after a pause even while the button is
        // still held; keep the transcript and continue listening.
        talkFinal += talkInterim;
        talkInterim = "";
        try {
          recognition.start();
          return;
        } catch {
          // Fall through and finish with what has been captured.
        }
      }
      finishTalk();
    };

    setTalkState("starting");
    try {
      recognition.start();
    } catch (error) {
      talkRecognition = null;
      talkPressed = false;
      toast(errorText(error) || "Could not start speech recognition.", "error");
      setTalkState("idle");
    }
  }

  function cancelTalk(): void {
    talkCancelled = true;
    talkReleaseRequested = true;
    talkPressed = false;
    talkFinal = "";
    talkInterim = "";
    const recognition = talkRecognition;
    talkRecognition = null;
    if (recognition) {
      try {
        recognition.abort();
      } catch {
        // Already stopped.
      }
    }
    setTalkState("idle");
  }

  talkButton.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (running || talkState !== "idle") return;
    event.preventDefault();
    talkPressed = true;
    try {
      talkButton.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional.
    }
    startTalk();
  });

  function releaseTalk(event: PointerEvent): void {
    if (!talkPressed) return;
    talkPressed = false;
    try {
      if (talkButton.hasPointerCapture(event.pointerId)) {
        talkButton.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Pointer capture is optional.
    }
    stopTalk();
  }

  talkButton.addEventListener("pointerup", releaseTalk);
  talkButton.addEventListener("pointercancel", releaseTalk);
  talkButton.addEventListener("lostpointercapture", () => {
    if (!talkPressed) return;
    talkPressed = false;
    stopTalk();
  });
  talkButton.addEventListener("contextmenu", (event) => event.preventDefault());

  talkButton.addEventListener("keydown", (event) => {
    if (event.key !== " " && event.key !== "Enter") return;
    if (event.repeat || running || talkState !== "idle") return;
    event.preventDefault();
    talkPressed = true;
    startTalk();
  });
  talkButton.addEventListener("keyup", (event) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (!talkPressed) return;
    talkPressed = false;
    stopTalk();
  });
  talkButton.addEventListener("blur", () => {
    if (!talkPressed) return;
    talkPressed = false;
    stopTalk();
  });

  /* ---------------------------------------------------------------- */
  /* Speech                                                           */
  /* ---------------------------------------------------------------- */

  function populateBrowserVoices(): void {
    if (!("speechSynthesis" in window)) return;
    const voices = window.speechSynthesis.getVoices();
    browserVoiceSelect.innerHTML =
      `<option value="">System default</option>` +
      voices
        .map(
          (voice) =>
            `<option value="${escapeHtml(voice.name)}" ${voice.name === settings.browserVoice ? "selected" : ""}>${escapeHtml(voice.name)}${voice.lang ? ` (${escapeHtml(voice.lang)})` : ""}</option>`,
        )
        .join("");
  }

  function speakReply(text: string): void {
    if (settings.engine !== "browser" || !text.trim() || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const selected = voices.find((voice) => voice.name === settings.browserVoice);
    if (selected) utterance.voice = selected;
    window.speechSynthesis.speak(utterance);
  }

  function updateSpeechVisibility(): void {
    const engine = settings.engine;
    const server = isServerEngine(engine);
    browserVoiceWrap.classList.toggle("hidden", engine !== "browser");
    ttsVoiceWrap.classList.toggle("hidden", !server);
    spokenWrap.classList.toggle("hidden", !server || !spoken.src);
  }

  async function refreshSpeechVoices(): Promise<void> {
    const model = selectedTtsModel();
    if (!model) return;
    const button = root.querySelector<HTMLElement>("[data-refresh-voices]");
    setButtonBusy(button, true, "Loading…");
    try {
      const data = await api<ChatStatusResponse>(
        `/api/audio/voices?model_id=${encodeURIComponent(model.id)}`,
      );
      // The user may have switched speech models while the request was in
      // flight; ignore a response for a model that is no longer selected.
      if (settings.engine !== model.id) return;
      ttsVoices = data.voices || [];
      ttsVoicesModel = model.id;
      if (!ttsVoices.length) {
        ttsVoiceSelect.innerHTML = '<option value="">No voices reported</option>';
        toast(`No ${model.alias} voices were reported.`, "warning");
        return;
      }
      if (!ttsVoices.includes(settings.ttsVoice)) {
        settings.ttsVoice = ttsVoices[0];
        saveSettings(settings);
      }
      ttsVoiceSelect.innerHTML = ttsVoices
        .map(
          (voice) =>
            `<option value="${escapeHtml(voice)}" ${voice === settings.ttsVoice ? "selected" : ""}>${escapeHtml(voice)}</option>`,
        )
        .join("");
      toast(`Loaded ${ttsVoices.length} voice${ttsVoices.length === 1 ? "" : "s"}.`, "success");
    } catch (error) {
      toast(errorText(error), "error");
    } finally {
      setButtonBusy(button, false);
    }
  }

  if ("speechSynthesis" in window) {
    populateBrowserVoices();
    window.speechSynthesis.onvoiceschanged = populateBrowserVoices;
  }

  /* ---------------------------------------------------------------- */
  /* Personas                                                         */
  /* ---------------------------------------------------------------- */

  function personaVoice(engine: string): string {
    if (engine === "browser") return settings.browserVoice;
    if (isServerEngine(engine)) return settings.ttsVoice;
    return "";
  }

  function personaValues(): ChatPersonaSettings {
    return {
      system_prompt: settings.systemPrompt,
      voice_engine: settings.engine,
      voice: personaVoice(settings.engine),
    };
  }

  function personaMatches(persona: ChatPersonaSettings | undefined): boolean {
    if (!persona) return false;
    const engine = persona.voice_engine || "off";
    return (
      (persona.system_prompt || "") === settings.systemPrompt &&
      engine === settings.engine &&
      (persona.voice || "") === personaVoice(engine)
    );
  }

  function updatePersonaButtons(): void {
    const hasSelection = Boolean(selectedPersona);
    personaDeleteButton.disabled = !hasSelection;
    personaDeleteButton.classList.toggle("opacity-40", !hasSelection);
    personaDeleteButton.classList.toggle("cursor-not-allowed", !hasSelection);
  }

  function renderPersonaSelect(): void {
    const names = Object.keys(personas);
    if (selectedPersona && !personas[selectedPersona]) selectedPersona = "";
    personaSelect.innerHTML =
      `<option value="">Custom (unsaved)</option>` +
      names
        .map(
          (name) =>
            `<option value="${escapeHtml(name)}" ${name === selectedPersona ? "selected" : ""}>${escapeHtml(name)}</option>`,
        )
        .join("");
    personaSelect.value = selectedPersona;
    updatePersonaButtons();
  }

  function markPersonaDirty(): void {
    if (!selectedPersona) return;
    selectedPersona = "";
    settings.persona = "";
    renderPersonaSelect();
  }

  async function applyPersona(persona: ChatPersonaSettings): Promise<void> {
    settings.systemPrompt = persona.system_prompt || "";
    settings.engine = persona.voice_engine || "off";
    systemInput.value = settings.systemPrompt;
    const engines = [...engineSelect.options].map((option) => option.value);
    if (!engines.includes(settings.engine)) settings.engine = "off";
    engineSelect.value = settings.engine;
    if (settings.engine === "browser") {
      settings.browserVoice = persona.voice || "";
      browserVoiceSelect.value = settings.browserVoice;
    } else if (isServerEngine(settings.engine)) {
      settings.ttsVoice = persona.voice || "";
    }
    updateSpeechVisibility();
    saveSettings(settings);
    if (isServerEngine(settings.engine)) {
      if (ttsVoicesModel !== settings.engine) await refreshSpeechVoices();
      ttsVoiceSelect.value = settings.ttsVoice;
    }
  }

  function openPersonaDialog(): void {
    const body = document.createElement("div");
    body.className = "space-y-3";
    body.innerHTML = `
      <div>
        <label class="label" for="chat-persona-name">Name</label>
        <input id="chat-persona-name" class="input" maxlength="80" placeholder="e.g. Writing coach" value="${escapeHtml(selectedPersona || personaDraft)}" />
      </div>
      <p class="text-[11px] leading-5 text-slate-500">Saves the current system prompt, speech engine and voice. Using an existing name updates that persona.</p>
    `;
    const footer = document.createElement("div");
    footer.className = "flex items-center justify-end gap-2";
    footer.innerHTML = `
      <button class="btn-secondary" data-cancel>Cancel</button>
      <button class="btn-primary" data-confirm>${icon("save", "h-4 w-4")}<span>Save persona</span></button>
    `;
    const modal = openModal({
      title: "Save persona",
      subtitle: "Personas are stored on the server.",
      content: body,
      footer,
    });
    const nameInput = queryElement<HTMLInputElement>(body, "#chat-persona-name");
    const confirmButton = queryElement<HTMLElement>(footer, "[data-confirm]");
    const cancelButton = queryElement<HTMLElement>(footer, "[data-cancel]");

    const save = async (): Promise<void> => {
      const name = nameInput.value.trim();
      if (!name) {
        toast("Type a persona name first.", "warning");
        nameInput.focus();
        return;
      }
      if (personas[name] && name !== selectedPersona && name !== personaDraft) {
        const okay = await confirmDialog(
          `A persona called “${name}” already exists. Overwrite it?`,
          { title: "Overwrite persona", confirmLabel: "Overwrite", danger: true },
        );
        if (!okay) return;
      }
      setButtonBusy(confirmButton, true, "Saving…");
      try {
        const data = await api<ChatStatusResponse>("/api/chat/personas", {
          method: "POST",
          body: { name, ...personaValues() },
        });
        personas = data.personas || {};
        boot.chat_personas = personas;
        selectedPersona = name;
        personaDraft = name;
        settings.persona = name;
        saveSettings(settings);
        renderPersonaSelect();
        modal.close();
        toast(`Saved persona “${name}”.`, "success");
      } catch (error) {
        toast(errorText(error), "error");
        setButtonBusy(confirmButton, false);
      }
    };

    cancelButton.addEventListener("click", () => modal.close());
    confirmButton.addEventListener("click", () => {
      void save();
    });
    nameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void save();
      }
    });
  }

  personaSelect.addEventListener("change", async () => {
    const name = personaSelect.value;
    selectedPersona = name;
    personaDraft = name;
    settings.persona = name;
    try {
      if (name && personas[name]) await applyPersona(personas[name]);
      else saveSettings(settings);
    } catch (error) {
      toast(errorText(error), "error");
    }
    renderPersonaSelect();
  });

  personaSaveButton.addEventListener("click", openPersonaDialog);

  personaDeleteButton.addEventListener("click", async () => {
    const name = selectedPersona;
    if (!name) return;
    const okay = await confirmDialog(`Delete the persona “${name}”?`, {
      title: "Delete persona",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!okay) return;
    setButtonBusy(personaDeleteButton, true, "Deleting…");
    try {
      const data = await api<ChatStatusResponse>("/api/chat/personas/delete", {
        method: "POST",
        body: { name },
      });
      personas = data.personas || {};
      boot.chat_personas = personas;
      selectedPersona = "";
      personaDraft = "";
      settings.persona = "";
      saveSettings(settings);
      renderPersonaSelect();
      toast("Persona deleted.", "success");
    } catch (error) {
      toast(errorText(error), "error");
    } finally {
      setButtonBusy(personaDeleteButton, false);
      updatePersonaButtons();
    }
  });

  /* ---------------------------------------------------------------- */
  /* Settings                                                         */
  /* ---------------------------------------------------------------- */

  systemInput.addEventListener("input", () => {
    settings.systemPrompt = systemInput.value;
    markPersonaDirty();
    saveSettings(settings);
  });
  thinkingInput.addEventListener("change", () => {
    settings.thinking = thinkingInput.checked;
    saveSettings(settings);
  });
  engineSelect.addEventListener("change", () => {
    settings.engine = engineSelect.value;
    markPersonaDirty();
    saveSettings(settings);
    updateSpeechVisibility();
    if (isServerEngine(settings.engine) && ttsVoicesModel !== settings.engine) {
      void refreshSpeechVoices();
    }
  });
  browserVoiceSelect.addEventListener("change", () => {
    settings.browserVoice = browserVoiceSelect.value;
    markPersonaDirty();
    saveSettings(settings);
  });
  ttsVoiceSelect.addEventListener("change", () => {
    settings.ttsVoice = ttsVoiceSelect.value;
    markPersonaDirty();
    saveSettings(settings);
  });
  root.querySelector("[data-refresh-voices]")?.addEventListener("click", () => {
    void refreshSpeechVoices();
  });
  updateSpeechVisibility();

  // Restore the persona label only when the persisted settings still match it;
  // an edited or updated persona then shows as "Custom (unsaved)".
  renderPersonaSelect();
  if (
    settings.persona &&
    personas[settings.persona] &&
    personaMatches(personas[settings.persona])
  ) {
    selectedPersona = settings.persona;
    personaDraft = selectedPersona;
    renderPersonaSelect();
  } else if (settings.persona) {
    settings.persona = "";
    saveSettings(settings);
  }

  /* ---------------------------------------------------------------- */
  /* Model load / unload                                              */
  /* ---------------------------------------------------------------- */

  function setModelStatus(status: string, loaded: boolean): void {
    statusText = status;
    chatStatus.textContent = status;
    modelChip.textContent = loaded ? "Loaded" : "Idle";
    modelChip.className = `chip ${loaded ? "chip-success" : ""}`;
  }

  root.querySelector("[data-load]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLElement | null;
    setButtonBusy(button, true, "Loading…");
    try {
      const result = await api<ChatStatusResponse>("/api/chat/load", {
        method: "POST",
        body: { path: modelSelect.value },
      });
      setModelStatus(result.status || "", Boolean(result.loaded));
      void ctx.refreshStatus();
      toast("Chat model loaded.", "success");
    } catch (error) {
      toast(errorText(error), "error");
    } finally {
      setButtonBusy(button, false);
    }
  });

  root.querySelector("[data-unload]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLElement | null;
    setButtonBusy(button, true, "Unloading…");
    try {
      const result = await api<ChatStatusResponse>("/api/chat/unload", { method: "POST" });
      setModelStatus(result.status || "", Boolean(result.loaded));
      void ctx.refreshStatus();
      toast("Chat model unloaded.", "success");
    } catch (error) {
      toast(errorText(error), "error");
    } finally {
      setButtonBusy(button, false);
    }
  });

  modelSelect.addEventListener("change", () => {
    settings.model = modelSelect.value;
    saveSettings(settings);
    updateAttachAvailability();
  });

  /* ---------------------------------------------------------------- */
  /* Send / stop                                                      */
  /* ---------------------------------------------------------------- */

  function setRunning(value: boolean): void {
    running = value;
    sendButton.disabled = value;
    sendButton.innerHTML = value ? `${spinner("h-3.5 w-3.5")} Sending…` : `${icon("send", "h-4 w-4")} Send`;
    stopButton.disabled = !value;
    talkButton.disabled =
      value || !speechInputReady || !chatModels.length || talkState === "finishing";
  }

  function setPhase(text: string | undefined): void {
    phaseText = text || "";
    phaseChip.textContent = phaseText;
    phaseChip.classList.toggle("hidden", !phaseText);
    phaseChip.className = `chip ${phaseText ? "chip-warn" : ""} hidden sm:inline-flex`;
  }

  async function sendMessage(): Promise<void> {
    if (running || talkState !== "idle") return;
    const text = input.value.trim();
    if (!text && !pendingImages.length) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: text,
      images: pendingImages,
    };
    messages.push(userMessage);
    pendingImages = [];
    renderAttachments();
    input.value = "";
    input.style.height = "auto";

    const assistant: ChatMessage = { role: "assistant", content: "", streaming: true };
    messages.push(assistant);
    renderMessages();
    setRunning(true);
    setPhase("Preparing…");
    controller = new AbortController();

    const requestMessages = messages
      .filter((message) => !message.streaming)
      .map((message) => ({
        role: message.role,
        content: message.content,
        images: (message.images || []).map((image) => image.id),
      }));

    let aborted = false;
    try {
      await stream<ChatStreamEvent>(
        "/api/chat/stream",
        {
          messages: requestMessages,
          system_prompt: settings.systemPrompt,
          enable_thinking: settings.thinking,
          speak_engine: settings.engine,
          voice: isServerEngine(settings.engine)
            ? settings.ttsVoice || null
            : null,
          model_path: settings.model || null,
        },
        (event) => {
          if (event.type === "phase") {
            setPhase(event.message);
          } else if (event.type === "model") {
            setModelStatus(event.status || "", Boolean(event.loaded));
            void ctx.refreshStatus();
          } else if (event.type === "chunk") {
            assistant.content = event.text || "";
            updateStreamingMessage(assistant);
          } else if (event.type === "audio") {
            spoken.src = event.url || "";
            spokenWrap.classList.remove("hidden");
            spoken.play().catch(() => {});
          } else if (event.type === "warning") {
            toast(event.message, "warning");
          } else if (event.type === "error") {
            assistant.content = assistant.content
              ? `${assistant.content}\n\n**Error:** ${event.message}`
              : `**Error:** ${event.message}`;
            toast(event.message, "error");
          } else if (event.type === "done") {
            assistant.streaming = false;
          }
        },
        controller.signal,
      );
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        aborted = true;
      } else {
        const message = errorText(error);
        assistant.content = assistant.content
          ? `${assistant.content}\n\n**Error:** ${message}`
          : `**Error:** ${message}`;
        toast(message, "error");
      }
    } finally {
      if (aborted && !assistant.content) assistant.stopped = true;
      assistant.streaming = false;
      renderMessages();
      setRunning(false);
      setPhase("");
      controller = null;
      if (!aborted && settings.engine === "browser" && assistant.content) {
        speakReply(assistant.content);
      }
    }
  }

  async function stopGenerating(): Promise<void> {
    if (!running) return;
    stopButton.disabled = true;
    let failed = false;
    // Fire the cancel request first, then abort the local stream so the UI
    // responds immediately instead of waiting for the round trip.
    const cancel = api("/api/chat/cancel", { method: "POST" }).catch((error: unknown) => {
      failed = true;
      toast(errorText(error), "error");
    });
    controller?.abort();
    setPhase("Stopping…");
    await cancel;
    if (!failed) toast("Stopped the reply.", "warning", 1800);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendMessage();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 192)}px`;
  });
  stopButton.addEventListener("click", () => {
    void stopGenerating();
  });

  root.querySelector("[data-new-chat]")?.addEventListener("click", (event) => {
    // The button lives in the Conversation summary; do not toggle the panel.
    event.preventDefault();
    event.stopPropagation();
    if (talkState !== "idle") cancelTalk();
    if (running) {
      controller?.abort();
      void api("/api/chat/cancel", { method: "POST" }).catch(() => {});
    }
    messages.length = 0;
    pendingImages = [];
    renderAttachments();
    renderMessages();
    setPhase("");
  });

  renderMessages();
  setRunning(false);
  setModelStatus(statusText, boot.chat_loaded);
  updateAttachAvailability();

  return () => {
    talkDisposed = true;
    if (talkRecognition) {
      try {
        talkRecognition.abort();
      } catch {
        // Already stopped.
      }
      talkRecognition = null;
    }
    if (running) {
      controller?.abort();
      void api("/api/chat/cancel", { method: "POST" }).catch(() => {});
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  };
}
