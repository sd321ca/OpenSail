import { api, stream, uploadFile } from "../api.js";
import {
  confirmDialog,
  emptyState,
  escapeHtml,
  icon,
  openModal,
  plainText,
  renderMarkdown,
  setButtonBusy,
  spinner,
  toast,
} from "../ui.js";

const KIND_LABELS = {
  image: "Image",
  audio: "Audio",
  video: "Video",
};

function workflowUrl(name) {
  return `/api/workflows/${encodeURIComponent(name)}`;
}

function candidateValues(config, values) {
  // Keep values for every candidate, including hidden ones. Hiding a control
  // should not reset its last value back to the workflow JSON default.
  const candidates = new Set(
    (config?.candidates || []).map((candidate) => candidate.id),
  );
  return Object.fromEntries(
    Object.entries(values || {}).filter(([id]) => candidates.has(id)),
  );
}

function selectedValues(config, values) {
  const selected = new Set(config?.selected || []);
  return Object.fromEntries(
    Object.entries(values || {}).filter(([id]) => selected.has(id)),
  );
}

function refPayload(ref) {
  if (!ref) return null;
  if (ref.upload) return { upload: ref.upload, gallery: null };
  if (ref.gallery) {
    return {
      upload: null,
      gallery: {
        filename: ref.gallery.filename,
        subfolder: ref.gallery.subfolder || "",
        type: ref.gallery.type || "output",
      },
    };
  }
  return null;
}

export async function renderGenerate(root, ctx) {
  const workflows = ctx.boot.workflows || [];
  let config = null;
  let workflow = ctx.boot.default_workflow || workflows[0]?.name || null;
  let randomize = true;
  let selectedPreset = null;

  const state = {
    values: {},
    images: [],
    audio: null,
    video: null,
    running: false,
    result: null,
    error: "",
    controller: null,
  };

  root.innerHTML = `
    <div class="grid items-start gap-5 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,500px)_minmax(0,1fr)]">
      <div class="min-w-0 space-y-5">
        <section class="card">
          <div class="card-header">
            <div class="flex items-center gap-2.5">
              <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500/10 text-accent-300">${icon("sparkles", "h-4 w-4")}</span>
              <div>
                <h2 class="card-title">Workflow</h2>
                <p class="card-subtitle" data-workflow-summary>Loading…</p>
              </div>
            </div>
            <span class="chip" data-kind-chip>—</span>
          </div>
          <div class="space-y-3 p-4 sm:p-5">
            ${
              workflows.length
                ? `<select class="select" data-workflow-select aria-label="Workflow">
                    ${workflows
                      .map(
                        (item) =>
                          `<option value="${escapeHtml(item.name)}">${escapeHtml(item.label)}</option>`,
                      )
                      .join("")}
                  </select>`
                : `<div class="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-200">No workflows were found in the <code class="font-mono">workflows/</code> folder.</div>`
            }
            <div class="flex flex-wrap gap-2">
              <button class="btn-secondary btn-xs" data-choose-inputs>${icon("settings", "h-4 w-4")} Choose inputs</button>
              <button class="btn-ghost btn-xs" data-reload-workflow>${icon("refresh", "h-4 w-4")} Refresh</button>
            </div>
          </div>
        </section>

        <section class="card hidden" data-presets-card></section>

        <section class="card hidden" data-inputs-card></section>

        <section class="card hidden" data-notes-card></section>

        <section class="card">
          <div class="card-header">
            <div class="flex items-center gap-2.5">
              <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-300">${icon("settings", "h-4 w-4")}</span>
              <div>
                <h2 class="card-title">Parameters</h2>
                <p class="card-subtitle" data-controls-summary>—</p>
              </div>
            </div>
          </div>
          <div class="space-y-4 p-4 sm:p-5" data-controls></div>
        </section>

        <section class="card">
          <div class="space-y-3 p-4 sm:p-5">
            <div class="flex flex-wrap items-center gap-2">
              <button class="btn-primary min-w-[9rem] flex-1" data-generate>${icon("play", "h-4 w-4")} Generate</button>
              <button class="btn-danger min-w-[7rem] flex-1" data-stop disabled>${icon("stop", "h-4 w-4")} Stop</button>
            </div>
            <div class="hidden space-y-2" data-progress-wrap>
              <div class="flex items-center justify-between gap-3 text-xs">
                <span class="truncate text-slate-400" data-progress-label>Preparing…</span>
                <span class="shrink-0 font-mono text-slate-500" data-progress-percent></span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div class="h-full w-0 rounded-full bg-gradient-to-r from-accent-500 to-sky-400 transition-all duration-300" data-progress-bar></div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div class="min-w-0 space-y-5 xl:sticky xl:top-24 xl:self-start">
        <section class="card overflow-hidden">
          <div class="card-header">
            <div class="flex items-center gap-2.5">
              <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">${icon("image", "h-4 w-4")}</span>
              <div>
                <h2 class="card-title">Output</h2>
                <p class="card-subtitle" data-result-subtitle>Nothing generated yet.</p>
              </div>
            </div>
            <a class="btn-ghost btn-xs hidden" data-result-open target="_blank" rel="noopener noreferrer">${icon("external", "h-4 w-4")} Open</a>
          </div>
          <div class="p-4 sm:p-5" data-result></div>
        </section>
      </div>
    </div>
  `;

  const $ = (selector) => root.querySelector(selector);
  const workflowSelect = $("[data-workflow-select]");
  const presetsCard = $("[data-presets-card]");
  const inputsCard = $("[data-inputs-card]");
  const notesCard = $("[data-notes-card]");
  const controls = $("[data-controls]");
  const result = $("[data-result]");
  const generateButton = $("[data-generate]");
  const stopButton = $("[data-stop]");
  const progressWrap = $("[data-progress-wrap]");
  const progressBar = $("[data-progress-bar]");
  const progressLabel = $("[data-progress-label]");
  const progressPercent = $("[data-progress-percent]");
  const resultOpen = $("[data-result-open]");

  if (workflowSelect) workflowSelect.value = workflow || "";

  /* ---------------------------------------------------------------- */
  /* Progress                                                         */
  /* ---------------------------------------------------------------- */

  function updateProgress(value, message, indeterminate = false) {
    progressWrap.classList.remove("hidden");
    progressLabel.textContent = message || "";
    if (indeterminate) {
      progressBar.classList.add("animate-pulse");
      progressBar.style.width = "38%";
      progressBar.style.transform = "translateX(0)";
      progressPercent.textContent = "";
    } else {
      progressBar.classList.remove("animate-pulse");
      progressBar.style.transform = "none";
      const percent = Math.round(Math.max(0, Math.min(1, value || 0)) * 100);
      progressBar.style.width = `${percent}%`;
      progressPercent.textContent = `${percent}%`;
    }
  }

  function hideProgress() {
    progressWrap.classList.add("hidden");
    progressBar.style.width = "0%";
    progressPercent.textContent = "";
  }

  /* ---------------------------------------------------------------- */
  /* Result                                                           */
  /* ---------------------------------------------------------------- */

  function renderResult() {
    if (state.error) {
      resultOpen.classList.add("hidden");
      $("[data-result-subtitle]").textContent = "Generation failed.";
      result.innerHTML = `
        <div class="rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] p-5">
          <div class="flex items-start gap-3">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300">${icon("alert", "h-5 w-5")}</span>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-rose-100">Generation failed</p>
              <p class="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-rose-200/80">${escapeHtml(state.error)}</p>
            </div>
          </div>
        </div>
      `;
      return;
    }
    if (state.running) {
      resultOpen.classList.add("hidden");
      $("[data-result-subtitle]").textContent = "Working…";
      result.innerHTML = `
        <div class="flex min-h-[22rem] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-subtle bg-white/[0.015]">
          <div class="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-accent-400/20 bg-accent-500/10 text-accent-300">
            ${spinner("h-7 w-7")}
          </div>
          <div class="text-center">
            <p class="text-sm font-medium text-slate-200">Generating</p>
            <p class="mt-1 text-xs text-slate-500">The result will appear here when ComfyUI finishes.</p>
          </div>
        </div>
      `;
      return;
    }
    if (!state.result) {
      resultOpen.classList.add("hidden");
      $("[data-result-subtitle]").textContent = "Nothing generated yet.";
      result.innerHTML = emptyState(
        "Ready when you are",
        "Set your inputs, then press Generate. Results stay available here until you start another run.",
        "sparkles",
      );
      return;
    }

    const item = state.result;
    $("[data-result-subtitle]").textContent = item.filename || "Generated result";
    resultOpen.href = item.url;
    resultOpen.classList.remove("hidden");

    if (item.kind === "image") {
      result.innerHTML = `
        <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="group relative block overflow-hidden rounded-2xl border border-subtle bg-ink-950">
          <img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.filename || "Generated image")}" class="max-h-[72vh] w-full object-contain transition duration-300 group-hover:scale-[1.005]" />
          <span class="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent p-3 text-[11px] text-white/70 opacity-0 transition group-hover:opacity-100">
            <span class="truncate">${escapeHtml(item.filename || "")}</span>
            <span class="inline-flex items-center gap-1">Open full size ${icon("external", "h-3.5 w-3.5")}</span>
          </span>
        </a>
      `;
    } else if (item.kind === "audio") {
      result.innerHTML = `
        <div class="rounded-2xl border border-subtle bg-raised p-5">
          <div class="mb-4 flex items-center gap-3">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">${icon("music", "h-5 w-5")}</span>
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-slate-200">${escapeHtml(item.filename || "Generated audio")}</p>
              <p class="text-xs text-slate-500">Audio result</p>
            </div>
          </div>
          <audio class="w-full" controls autoplay src="${escapeHtml(item.url)}"></audio>
        </div>
      `;
    } else {
      result.innerHTML = `
        <div class="overflow-hidden rounded-2xl border border-subtle bg-ink-950">
          <video class="max-h-[72vh] w-full" controls autoplay playsinline src="${escapeHtml(item.url)}"></video>
          <div class="flex items-center justify-between gap-3 border-t border-subtle px-4 py-3">
            <p class="truncate text-xs text-slate-400">${escapeHtml(item.filename || "Generated video")}</p>
            <a class="btn-ghost btn-xs" href="${escapeHtml(item.url)}" download>${icon("download", "h-4 w-4")} Download</a>
          </div>
        </div>
      `;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Workflow summary / notes / presets                               */
  /* ---------------------------------------------------------------- */

  function renderWorkflowSummary() {
    if (!config) return;
    const count = config.selected.length;
    $("[data-workflow-summary]").textContent = `${count} input${count === 1 ? "" : "s"} · ${config.saved_selection ? "custom selection" : "all inputs"}`;
    const chip = $("[data-kind-chip]");
    chip.textContent = KIND_LABELS[config.kind] || "Image";
    chip.className = `chip ${config.kind === "audio" ? "chip-warn" : config.kind === "video" ? "chip-success" : ""}`;
  }

  function renderNotes() {
    if (!config?.notes) {
      notesCard.classList.add("hidden");
      notesCard.innerHTML = "";
      return;
    }
    notesCard.classList.remove("hidden");
    notesCard.innerHTML = `
      <div class="card-header">
        <div class="flex items-center gap-2.5">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-300">${icon("info", "h-4 w-4")}</span>
          <div>
            <h2 class="card-title">Workflow notes</h2>
            <p class="card-subtitle">Tips saved for this workflow</p>
          </div>
        </div>
        <button class="btn-ghost btn-xs" data-edit-notes>${icon("pencil", "h-4 w-4")} Edit</button>
      </div>
      <div class="prose-notes p-4 sm:p-5">${renderMarkdown(config.notes)}</div>
    `;
    notesCard.querySelector("[data-edit-notes]")?.addEventListener("click", openInputPicker);
  }

  function renderPresets() {
    if (!config) return;
    presetsCard.classList.remove("hidden");
    const names = config.preset_names || [];
    if (!selectedPreset || !names.includes(selectedPreset)) {
      selectedPreset = config.default_preset || names[0] || "";
    }
    presetsCard.innerHTML = `
      <details class="group" ${names.length ? "" : "open"}>
        <summary class="card-header cursor-pointer list-none select-none">
          <div class="flex items-center gap-2.5">
            <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">${icon("save", "h-4 w-4")}</span>
            <div>
              <h2 class="card-title">Input presets</h2>
              <p class="card-subtitle">${names.length ? `${names.length} saved preset${names.length === 1 ? "" : "s"}` : "Save your current values for later"}</p>
            </div>
          </div>
          <span class="text-slate-500 transition group-open:rotate-180">${icon("chevron", "h-4 w-4")}</span>
        </summary>
        <div class="space-y-3 border-t border-subtle p-4 sm:p-5">
          <div class="flex gap-2">
            <select class="select min-w-0 flex-1" data-preset-select aria-label="Saved preset">
              ${names.length ? names.map((name) => `<option value="${escapeHtml(name)}" ${name === selectedPreset ? "selected" : ""}>${escapeHtml(name)}${name === config.default_preset ? " (default)" : ""}</option>`).join("") : `<option value="">No presets yet</option>`}
            </select>
            <button class="btn-secondary btn-xs shrink-0" data-preset-load ${names.length ? "" : "disabled"}>Load</button>
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="btn-ghost btn-xs" data-preset-default ${names.length ? "" : "disabled"}>${icon("check", "h-4 w-4")} Set default</button>
            <button class="btn-ghost btn-xs text-rose-300 hover:bg-rose-500/10" data-preset-delete ${names.length ? "" : "disabled"}>${icon("trash", "h-4 w-4")} Delete</button>
          </div>
          <div class="flex gap-2 border-t border-subtle pt-3">
            <input class="input min-w-0 flex-1" data-preset-name placeholder="New preset name, e.g. High quality" />
            <button class="btn-primary btn-xs shrink-0" data-preset-save>${icon("save", "h-4 w-4")} Save</button>
          </div>
          <p class="text-[11px] leading-5 text-slate-500">Leave the name blank to overwrite the selected preset.</p>
        </div>
      </details>
    `;

    const presetSelect = presetsCard.querySelector("[data-preset-select]");
    presetSelect?.addEventListener("change", () => {
      selectedPreset = presetSelect.value;
    });

    presetsCard.querySelector("[data-preset-load]")?.addEventListener("click", () => {
      const values = config.presets[selectedPreset];
      if (!values) return toast("Choose a preset first.", "warning");
      for (const candidate of config.candidates) {
        if (Object.prototype.hasOwnProperty.call(values, candidate.id)) {
          state.values[candidate.id] = values[candidate.id];
        }
      }
      renderControls();
      toast(`Loaded preset “${selectedPreset}”.`, "success");
    });

    presetsCard.querySelector("[data-preset-save]")?.addEventListener("click", async (event) => {
      const nameInput = presetsCard.querySelector("[data-preset-name]");
      const name = nameInput.value.trim() || selectedPreset;
      if (!name) return toast("Type a preset name first.", "warning");
      const button = event.currentTarget;
      setButtonBusy(button, true, "Saving…");
      try {
        const updated = await api(`${workflowUrl(config.name)}/presets`, {
          method: "POST",
          body: { name, values: selectedValues(config, state.values) },
        });
        selectedPreset = name;
        applyConfig(updated, { preserve: true });
        toast(`Saved preset “${name}”.`, "success");
      } catch (error) {
        toast(error.message, "error");
      } finally {
        setButtonBusy(button, false);
      }
    });

    presetsCard.querySelector("[data-preset-default]")?.addEventListener("click", async () => {
      if (!selectedPreset) return;
      try {
        const updated = await api(`${workflowUrl(config.name)}/presets/default`, {
          method: "POST",
          body: { name: selectedPreset },
        });
        applyConfig(updated, { preserve: true });
        toast(`“${selectedPreset}” will load automatically.`, "success");
      } catch (error) {
        toast(error.message, "error");
      }
    });

    presetsCard.querySelector("[data-preset-delete]")?.addEventListener("click", async () => {
      if (!selectedPreset) return;
      const okay = await confirmDialog(`Delete the preset “${selectedPreset}”?`, {
        title: "Delete preset",
        confirmLabel: "Delete",
        danger: true,
      });
      if (!okay) return;
      try {
        const updated = await api(`${workflowUrl(config.name)}/presets/delete`, {
          method: "POST",
          body: { name: selectedPreset },
        });
        selectedPreset = updated.default_preset || updated.preset_names[0] || "";
        applyConfig(updated, { preserve: true });
        toast("Preset deleted.", "success");
      } catch (error) {
        toast(error.message, "error");
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* Media inputs                                                     */
  /* ---------------------------------------------------------------- */

  function renderMedia() {
    if (!config) return;
    const hasImages = (config.image_nodes || []).length > 0;
    const hasAudio = (config.audio_nodes || []).length > 0;
    const hasVideo = (config.video_nodes || []).length > 0;
    if (!hasImages && !hasAudio && !hasVideo) {
      inputsCard.classList.add("hidden");
      inputsCard.innerHTML = "";
      return;
    }
    inputsCard.classList.remove("hidden");

    const sections = [];
    if (hasImages) {
      sections.push(`
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Input images</h3>
            <span class="text-[11px] text-slate-600">Upload, sketch or pick from the gallery</span>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            ${config.image_nodes.map((node, index) => imageSlotHtml(node, index)).join("")}
          </div>
        </div>
      `);
    }
    if (hasAudio) {
      sections.push(`
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Reference audio</h3>
            <span class="text-[11px] text-slate-600">${escapeHtml(config.audio_nodes[0].label)}</span>
          </div>
          ${audioSlotHtml()}
        </div>
      `);
    }
    if (hasVideo) {
      sections.push(`
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Input video</h3>
            <span class="text-[11px] text-slate-600">${escapeHtml(config.video_nodes[0].label)}</span>
          </div>
          ${videoSlotHtml()}
        </div>
      `);
    }

    inputsCard.innerHTML = `
      <div class="card-header">
        <div class="flex items-center gap-2.5">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-300">${icon("image", "h-4 w-4")}</span>
          <div>
            <h2 class="card-title">Inputs</h2>
            <p class="card-subtitle">Files are uploaded to ComfyUI when you generate.</p>
          </div>
        </div>
      </div>
      <div class="space-y-5 p-4 sm:p-5">${sections.join("")}</div>
    `;

    config.image_nodes.forEach((_node, index) => {
      const slot = inputsCard.querySelector(`[data-image-slot="${index}"]`);
      if (!slot) return;
      slot.querySelector("[data-image-upload]")?.addEventListener("change", (event) => {
        const file = event.target.files?.[0];
        if (file) uploadImageRef(file, index);
      });
      slot.querySelector("[data-image-sketch]")?.addEventListener("click", () => openSketch(index));
      slot.querySelector("[data-image-gallery]")?.addEventListener("click", () => openImageGallery(index));
      slot.querySelector("[data-image-clear]")?.addEventListener("click", () => {
        state.images[index] = null;
        renderMedia();
      });
    });

    inputsCard.querySelector("[data-audio-upload]")?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) uploadMediaRef(file, (ref) => (state.audio = ref), "Audio");
    });
    inputsCard.querySelector("[data-audio-clear]")?.addEventListener("click", () => {
      state.audio = null;
      renderMedia();
    });
    inputsCard.querySelector("[data-video-upload]")?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) uploadMediaRef(file, (ref) => (state.video = ref), "Video");
    });
    inputsCard.querySelector("[data-video-gallery]")?.addEventListener("click", openVideoGallery);
    inputsCard.querySelector("[data-video-clear]")?.addEventListener("click", () => {
      state.video = null;
      renderMedia();
    });
  }

  function imageSlotHtml(node, index) {
    const ref = state.images[index];
    const preview = ref
      ? `<img src="${escapeHtml(ref.previewUrl)}" alt="${escapeHtml(node.label)}" class="h-full w-full object-contain" />`
      : `<div class="flex h-full flex-col items-center justify-center gap-2 text-slate-600">
           ${icon("image", "h-7 w-7")}
           <span class="text-[11px]">No image selected</span>
         </div>`;
    return `
      <div class="rounded-xl border border-subtle bg-raised p-3" data-image-slot="${index}">
        <div class="mb-2 flex items-center justify-between gap-2">
          <p class="truncate text-xs font-semibold text-slate-300">${escapeHtml(node.label)}</p>
          <span class="text-[10px] font-mono text-slate-600">${escapeHtml(node.id)}</span>
        </div>
        <div class="mb-2 flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-subtle bg-ink-950/80">
          ${preview}
        </div>
        <div class="flex flex-wrap gap-1.5">
          <label class="btn-secondary btn-xs cursor-pointer">
            ${icon("upload", "h-3.5 w-3.5")} Upload
            <input type="file" accept="image/*" class="sr-only" data-image-upload />
          </label>
          <button class="btn-ghost btn-xs" data-image-sketch>${icon("pencil", "h-3.5 w-3.5")} Sketch</button>
          <button class="btn-ghost btn-xs" data-image-gallery>${icon("gallery", "h-3.5 w-3.5")} Gallery</button>
          ${ref ? `<button class="btn-ghost btn-xs text-rose-300 hover:bg-rose-500/10" data-image-clear>${icon("trash", "h-3.5 w-3.5")}</button>` : ""}
        </div>
      </div>
    `;
  }

  function audioSlotHtml() {
    const ref = state.audio;
    return `
      <div class="rounded-xl border border-subtle bg-raised p-3">
        ${ref ? `<audio class="mb-3 w-full" controls src="${escapeHtml(ref.previewUrl)}"></audio>` : ""}
        <div class="flex flex-wrap items-center gap-2">
          <label class="btn-secondary btn-xs cursor-pointer">
            ${icon("upload", "h-3.5 w-3.5")} ${ref ? "Replace audio" : "Upload audio"}
            <input type="file" accept="audio/*" class="sr-only" data-audio-upload />
          </label>
          ${ref ? `<span class="min-w-0 flex-1 truncate text-[11px] text-slate-500">${escapeHtml(ref.name || "Audio selected")}</span>` : `<span class="text-[11px] text-slate-600">No reference audio selected</span>`}
          ${ref ? `<button class="btn-ghost btn-xs text-rose-300 hover:bg-rose-500/10" data-audio-clear>${icon("trash", "h-3.5 w-3.5")}</button>` : ""}
        </div>
      </div>
    `;
  }

  function videoSlotHtml() {
    const ref = state.video;
    return `
      <div class="rounded-xl border border-subtle bg-raised p-3">
        ${
          ref
            ? `<video class="mb-3 max-h-64 w-full rounded-lg bg-ink-950" controls src="${escapeHtml(ref.previewUrl)}"></video>`
            : `<div class="mb-3 flex aspect-video items-center justify-center rounded-lg border border-dashed border-subtle bg-ink-950/60 text-slate-600">${icon("film", "h-7 w-7")}</div>`
        }
        <div class="flex flex-wrap items-center gap-2">
          <label class="btn-secondary btn-xs cursor-pointer">
            ${icon("upload", "h-3.5 w-3.5")} ${ref ? "Replace video" : "Upload video"}
            <input type="file" accept="video/*" class="sr-only" data-video-upload />
          </label>
          <button class="btn-ghost btn-xs" data-video-gallery>${icon("gallery", "h-3.5 w-3.5")} Gallery</button>
          ${ref ? `<span class="min-w-0 flex-1 truncate text-[11px] text-slate-500">${escapeHtml(ref.name || "Video selected")}</span>` : ""}
          ${ref ? `<button class="btn-ghost btn-xs text-rose-300 hover:bg-rose-500/10" data-video-clear>${icon("trash", "h-3.5 w-3.5")}</button>` : ""}
        </div>
      </div>
    `;
  }

  async function uploadImageRef(file, index) {
    try {
      toast("Uploading image…", "info", 1500);
      const stored = await uploadFile(file);
      state.images[index] = {
        upload: stored.id,
        previewUrl: stored.url,
        name: stored.name,
      };
      renderMedia();
      toast("Image ready.", "success", 1600);
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function uploadMediaRef(file, setter, label) {
    try {
      toast(`Uploading ${label.toLowerCase()}…`, "info", 1500);
      const stored = await uploadFile(file);
      setter({ upload: stored.id, previewUrl: stored.url, name: stored.name });
      renderMedia();
      toast(`${label} ready.`, "success", 1600);
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function openImageGallery(index) {
    const modal = openModal({
      title: "Choose an image",
      subtitle: "Reuse a recent image generated by ComfyUI.",
      size: "lg",
      content: `<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">${Array.from({ length: 8 })
        .map(() => '<div class="skeleton aspect-square"></div>')
        .join("")}</div>`,
    });
    try {
      const data = await api("/api/gallery/images?limit=60");
      if (!data.items.length) {
        modal.body.innerHTML = emptyState(
          "No images yet",
          "Generate an image first, or upload one in the image editor.",
          "image",
        );
        return;
      }
      modal.body.innerHTML = `<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        ${data.items
          .map(
            (item, itemIndex) => `
            <button class="group overflow-hidden rounded-xl border border-subtle bg-raised text-left transition hover:border-accent-400/40 hover:bg-raised" data-gallery-item="${itemIndex}">
              <div class="aspect-square overflow-hidden bg-ink-950">
                <img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.filename)}" loading="lazy" class="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
              </div>
              <p class="truncate px-2.5 py-2 text-[11px] text-slate-400">${escapeHtml(item.filename)}</p>
            </button>
          `,
          )
          .join("")}
      </div>`;
      modal.body.querySelectorAll("[data-gallery-item]").forEach((button) => {
        button.addEventListener("click", () => {
          const item = data.items[Number(button.dataset.galleryItem)];
          state.images[index] = {
            gallery: item,
            previewUrl: item.url,
            name: item.filename,
          };
          modal.close();
          renderMedia();
          toast("Gallery image selected.", "success", 1600);
        });
      });
    } catch (error) {
      modal.body.innerHTML = `<p class="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">${escapeHtml(error.message)}</p>`;
    }
  }

  async function openVideoGallery() {
    const modal = openModal({
      title: "Choose a video",
      subtitle: "Reuse a recent video generated or upscaled by ComfyUI.",
      size: "lg",
      content: `<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">${Array.from({ length: 6 })
        .map(() => '<div class="skeleton aspect-video"></div>')
        .join("")}</div>`,
    });
    try {
      const data = await api("/api/gallery/videos?limit=60");
      if (!data.items.length) {
        modal.body.innerHTML = emptyState(
          "No videos yet",
          "Generate or upscale a video first, or upload one above.",
          "film",
        );
        return;
      }
      modal.body.innerHTML = `<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        ${data.items
          .map(
            (item, itemIndex) => `
            <button class="group overflow-hidden rounded-xl border border-subtle bg-raised text-left transition hover:border-accent-400/40 hover:bg-raised" data-video-item="${itemIndex}">
              <video class="aspect-video w-full bg-ink-950 object-cover" muted preload="metadata" src="${escapeHtml(item.url)}"></video>
              <p class="truncate px-2.5 py-2 text-[11px] text-slate-400">${escapeHtml(item.filename)}</p>
            </button>
          `,
          )
          .join("")}
      </div>`;
      modal.body.querySelectorAll("[data-video-item]").forEach((button) => {
        button.addEventListener("click", () => {
          const item = data.items[Number(button.dataset.videoItem)];
          state.video = {
            gallery: item,
            previewUrl: item.url,
            name: item.filename,
          };
          modal.close();
          renderMedia();
          toast("Gallery video selected.", "success", 1600);
        });
      });
    } catch (error) {
      modal.body.innerHTML = `<p class="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">${escapeHtml(error.message)}</p>`;
    }
  }

  function openSketch(index) {
    const ref = state.images[index];
    const modal = openModal({
      title: "Sketch an input image",
      subtitle: "Draw directly on the canvas. The result is uploaded when you apply it.",
      size: "lg",
      content: `
        <div class="space-y-3">
          <div class="flex flex-wrap items-center gap-3 rounded-xl border border-subtle bg-raised p-3">
            <label class="flex items-center gap-2 text-xs text-slate-400">
              Brush
              <input type="range" min="1" max="48" value="8" class="range w-28" data-brush-size />
              <span class="w-7 text-right font-mono text-slate-500" data-brush-label>8</span>
            </label>
            <label class="flex items-center gap-2 text-xs text-slate-400">
              Color
              <input type="color" value="#818cf8" class="h-8 w-10 cursor-pointer rounded-lg border border-white/10 bg-transparent p-0.5" data-brush-color />
            </label>
            <button class="btn-ghost btn-xs ml-auto" data-sketch-clear>${icon("trash", "h-4 w-4")} Clear</button>
          </div>
          <div class="flex items-center justify-center overflow-hidden rounded-xl border border-subtle bg-ink-950 p-2">
            <canvas class="max-h-[62vh] max-w-full touch-none rounded-lg bg-white" data-sketch-canvas></canvas>
          </div>
        </div>
      `,
      footer: `
        <div class="flex w-full items-center justify-end gap-2">
          <button class="btn-secondary" data-sketch-cancel>Cancel</button>
          <button class="btn-primary" data-sketch-apply>${icon("check", "h-4 w-4")} Use sketch</button>
        </div>
      `,
    });

    const canvas = modal.element.querySelector("[data-sketch-canvas]");
    const context = canvas.getContext("2d");
    const colorInput = modal.element.querySelector("[data-brush-color]");
    const sizeInput = modal.element.querySelector("[data-brush-size]");
    const sizeLabel = modal.element.querySelector("[data-brush-label]");
    let drawing = false;
    let last = null;
    let brushColor = colorInput.value;
    let brushSize = Number(sizeInput.value);

    const resetCanvas = (width = 1024, height = 1024) => {
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    };

    const applyBrush = () => {
      context.strokeStyle = brushColor;
      context.lineWidth = brushSize;
      context.lineCap = "round";
      context.lineJoin = "round";
    };

    if (ref?.previewUrl) {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
        resetCanvas(
          Math.max(1, Math.round(image.naturalWidth * scale)),
          Math.max(1, Math.round(image.naturalHeight * scale)),
        );
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        applyBrush();
      };
      image.onerror = () => {
        resetCanvas();
        applyBrush();
      };
      image.src = ref.previewUrl;
    } else {
      resetCanvas();
      applyBrush();
    }

    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      };
    };

    canvas.addEventListener("pointerdown", (event) => {
      drawing = true;
      canvas.setPointerCapture(event.pointerId);
      last = point(event);
      applyBrush();
      context.beginPath();
      context.arc(last.x, last.y, brushSize / 2, 0, Math.PI * 2);
      context.fillStyle = brushColor;
      context.fill();
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drawing) return;
      const next = point(event);
      applyBrush();
      context.beginPath();
      context.moveTo(last.x, last.y);
      context.lineTo(next.x, next.y);
      context.stroke();
      last = next;
    });
    const stopDrawing = () => {
      drawing = false;
      last = null;
    };
    canvas.addEventListener("pointerup", stopDrawing);
    canvas.addEventListener("pointercancel", stopDrawing);
    canvas.addEventListener("pointerleave", stopDrawing);

    colorInput.addEventListener("input", () => {
      brushColor = colorInput.value;
    });
    sizeInput.addEventListener("input", () => {
      brushSize = Number(sizeInput.value);
      sizeLabel.textContent = String(brushSize);
    });
    modal.element.querySelector("[data-sketch-clear]")?.addEventListener("click", () => {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    });
    modal.element.querySelector("[data-sketch-cancel]")?.addEventListener("click", () => modal.close());
    modal.element.querySelector("[data-sketch-apply]")?.addEventListener("click", (event) => {
      const button = event.currentTarget;
      setButtonBusy(button, true, "Uploading…");
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setButtonBusy(button, false);
          return toast("Could not export the sketch.", "error");
        }
        try {
          const file = new File([blob], "sketch.png", { type: "image/png" });
          const stored = await uploadFile(file);
          state.images[index] = {
            upload: stored.id,
            previewUrl: stored.url,
            name: "sketch.png",
          };
          modal.close();
          renderMedia();
          toast("Sketch applied.", "success");
        } catch (error) {
          toast(error.message, "error");
          setButtonBusy(button, false);
        }
      }, "image/png");
    });
  }

  /* ---------------------------------------------------------------- */
  /* Dynamic controls                                                 */
  /* ---------------------------------------------------------------- */

  function controlHtml(candidate, value) {
    const field = candidate.field_def || {};
    const widget = field.widget || "textbox";
    const options = field.options || {};
    const id = escapeHtml(candidate.id);
    const label = escapeHtml(candidate.display_name || candidate.title || candidate.class_type);
    const meta = `<span class="font-mono text-[10px] text-slate-600">${escapeHtml(candidate.node)} · ${escapeHtml(candidate.input)}</span>`;

    if (widget === "textbox") {
      const lines = Math.max(1, Math.min(Number(options.lines) || 3, 12));
      return `
        <div class="field-row" data-control="${id}">
          <div class="flex items-center justify-between gap-2"><label class="label mb-0" for="field-${id}">${label}</label>${meta}</div>
          <textarea id="field-${id}" class="textarea" rows="${lines}" data-binding="${id}" placeholder="${escapeHtml(options.placeholder || "")}">${escapeHtml(value ?? "")}</textarea>
        </div>
      `;
    }

    if (widget === "slider") {
      const minimum = Number(options.minimum ?? 0);
      const maximum = Number(options.maximum ?? 1);
      const step = Number(options.step ?? 0.01) || 0.01;
      const numeric = Number(value ?? minimum);
      return `
        <div class="field-row" data-control="${id}">
          <div class="flex items-center justify-between gap-2"><label class="label mb-0" for="field-${id}">${label}</label>${meta}</div>
          <div class="flex items-center gap-3">
            <input id="field-${id}" type="range" class="range min-w-0 flex-1" min="${minimum}" max="${maximum}" step="${step}" value="${numeric}" data-binding="${id}" data-range />
            <input type="number" class="input w-24 shrink-0 text-right font-mono text-xs" min="${minimum}" max="${maximum}" step="${step}" value="${numeric}" data-range-number />
          </div>
        </div>
      `;
    }

    if (widget === "dropdown") {
      const choices = Array.isArray(field.choices) ? [...field.choices] : [];
      if (value !== undefined && value !== null && !choices.includes(value)) choices.unshift(value);
      return `
        <div class="field-row" data-control="${id}">
          <div class="flex items-center justify-between gap-2"><label class="label mb-0" for="field-${id}">${label}</label>${meta}</div>
          <select id="field-${id}" class="select" data-binding="${id}">
            ${choices
              .map(
                (choice) =>
                  `<option value="${escapeHtml(choice)}" ${String(choice) === String(value) ? "selected" : ""}>${escapeHtml(choice)}</option>`,
              )
              .join("")}
          </select>
        </div>
      `;
    }

    if (widget === "checkbox") {
      return `
        <div class="field-row" data-control="${id}">
          <label class="flex items-center justify-between gap-3 rounded-xl border border-subtle bg-raised px-3 py-2.5">
            <span class="min-w-0"><span class="block text-sm font-medium text-slate-200">${label}</span><span class="mt-0.5 block font-mono text-[10px] text-slate-600">${escapeHtml(candidate.node)} · ${escapeHtml(candidate.input)}</span></span>
            <span class="switch"><input type="checkbox" data-binding="${id}" ${value ? "checked" : ""} /><span></span></span>
          </label>
        </div>
      `;
    }

    const step = Number(options.precision) === 0 ? 1 : "any";
    return `
      <div class="field-row" data-control="${id}">
        <div class="flex items-center justify-between gap-2"><label class="label mb-0" for="field-${id}">${label}</label>${meta}</div>
        <input id="field-${id}" type="number" class="input font-mono text-xs" step="${step}" value="${escapeHtml(value ?? "")}" data-binding="${id}" />
      </div>
    `;
  }

  function renderControls() {
    if (!config) return;
    const candidatesById = new Map(
      config.candidates.map((candidate) => [candidate.id, candidate]),
    );
    // Follow the saved binding order, not the workflow's node order.
    const candidates = (config.selected || [])
      .map((bindingId) => candidatesById.get(bindingId))
      .filter(Boolean);
    $("[data-controls-summary]").textContent = `${candidates.length} control${candidates.length === 1 ? "" : "s"} shown`;
    if (!candidates.length) {
      controls.innerHTML = emptyState(
        "No inputs selected",
        "Use Choose inputs to pick which workflow parameters appear here.",
        "settings",
      );
      controls.insertAdjacentHTML(
        "beforeend",
        '<div class="flex justify-center"><button class="btn-secondary btn-xs" data-empty-choose>Choose inputs</button></div>',
      );
      controls.querySelector("[data-empty-choose]")?.addEventListener("click", openInputPicker);
      return;
    }

    for (const candidate of candidates) {
      if (!(candidate.id in state.values) || state.values[candidate.id] === undefined) {
        state.values[candidate.id] = candidate.value;
      }
    }

    const hasSeed = candidates.some((candidate) => /(^|_)(noise_)?seed$/.test(candidate.input));
    controls.innerHTML = `
      <div class="space-y-4">
        ${candidates.map((candidate) => controlHtml(candidate, state.values[candidate.id])).join("")}
      </div>
      ${
        hasSeed
          ? `<label class="flex items-center justify-between gap-3 rounded-xl border border-subtle bg-raised px-3 py-2.5">
               <span><span class="block text-sm font-medium text-slate-200">Randomize seed</span><span class="text-[11px] text-slate-500">Use a fresh seed on every run</span></span>
               <span class="switch"><input type="checkbox" ${randomize ? "checked" : ""} data-randomize /><span></span></span>
             </label>`
          : ""
      }
    `;

    controls.querySelectorAll("[data-binding]").forEach((input) => {
      const id = input.dataset.binding;
      const widget = config.candidates.find((candidate) => candidate.id === id)?.field_def?.widget;
      const read = () => {
        if (input.type === "checkbox") return input.checked;
        if (input.type === "number" || input.type === "range") {
          const number = Number(input.value);
          return Number.isFinite(number) ? number : input.value;
        }
        return input.value;
      };
      const update = () => {
        state.values[id] = read();
        if (input.dataset.range !== undefined) {
          const numberInput = input.closest("[data-control]")?.querySelector("[data-range-number]");
          if (numberInput) numberInput.value = input.value;
        }
      };
      input.addEventListener("input", update);
      input.addEventListener("change", update);
      if (widget === "slider" && input.dataset.range !== undefined) {
        const numberInput = input.closest("[data-control]")?.querySelector("[data-range-number]");
        numberInput?.addEventListener("input", () => {
          const minimum = Number(input.min);
          const maximum = Number(input.max);
          const value = Math.min(maximum, Math.max(minimum, Number(numberInput.value) || minimum));
          input.value = value;
          state.values[id] = value;
        });
      }
    });

    controls.querySelector("[data-randomize]")?.addEventListener("change", (event) => {
      randomize = event.target.checked;
    });
  }

  /* ---------------------------------------------------------------- */
  /* Input picker + notes editor                                      */
  /* ---------------------------------------------------------------- */

  function openInputPicker() {
    if (!config) return;
    const rows = config.candidates.map((candidate) => {
      const position = config.selected.indexOf(candidate.id);
      return {
        candidate,
        show: position >= 0,
        order: position >= 0 ? position + 1 : "",
        name: candidate.display_name || "",
      };
    });
    rows.sort((a, b) => {
      if (a.show !== b.show) return a.show ? -1 : 1;
      if (a.show && b.show) return Number(a.order) - Number(b.order);
      return 0;
    });

    const modal = openModal({
      title: "Choose inputs",
      subtitle: `Pick which node inputs are shown for ${config.name}. Drag-free ordering is set with the Order column.`,
      size: "lg",
      content: `
        <div class="space-y-5">
          <div class="flex flex-wrap items-center gap-2">
            <button class="btn-secondary btn-xs" data-select-all>Select all</button>
            <button class="btn-ghost btn-xs" data-select-none>Select none</button>
            <span class="ml-auto text-[11px] text-slate-500">${rows.length} candidate input${rows.length === 1 ? "" : "s"}</span>
          </div>
          <div class="overflow-x-auto rounded-xl border border-subtle">
            <table class="w-full min-w-[36rem] text-left text-sm">
              <thead class="border-b border-subtle bg-raised text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th class="w-14 px-3 py-2.5">Show</th>
                  <th class="w-20 px-3 py-2.5">Order</th>
                  <th class="px-3 py-2.5">Node input</th>
                  <th class="w-48 px-3 py-2.5">Display name</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/[0.05]">
                ${rows
                  .map(
                    (row, index) => `
                  <tr class="align-middle ${row.show ? "bg-accent-500/[0.035]" : ""}" data-picker-row="${index}">
                    <td class="px-3 py-2"><input type="checkbox" class="h-4 w-4 rounded border-white/20 bg-ink-950 accent-accent-500" data-show ${row.show ? "checked" : ""} /></td>
                    <td class="px-3 py-2"><input type="number" min="1" class="input w-16 px-2 py-1 text-center font-mono text-xs" value="${row.order}" data-order ${row.show ? "" : "disabled"} /></td>
                    <td class="px-3 py-2">
                      <span class="block text-xs font-medium text-slate-200">${escapeHtml(row.candidate.title)} · ${escapeHtml(row.candidate.input)}</span>
                      <span class="mt-0.5 block font-mono text-[10px] text-slate-600">${escapeHtml(row.candidate.label)}</span>
                    </td>
                    <td class="px-3 py-2"><input class="input px-2 py-1 text-xs" value="${escapeHtml(row.name)}" placeholder="Optional" data-name /></td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>

          <div class="space-y-2 rounded-xl border border-subtle bg-raised p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="text-sm font-semibold text-slate-200">Workflow notes</p>
                <p class="text-[11px] text-slate-500">Markdown shown in the notes panel on the Generate page.</p>
              </div>
              <button class="btn-ghost btn-xs" data-save-notes>${icon("save", "h-4 w-4")} Save notes</button>
            </div>
            <textarea class="textarea mt-2 font-mono text-xs" rows="7" data-notes placeholder="### Tips&#10;&#10;- Add workflow-specific tips here.">${escapeHtml(config.notes || "")}</textarea>
          </div>
        </div>
      `,
      footer: `
        <div class="flex w-full flex-wrap items-center justify-end gap-2">
          <button class="btn-secondary" data-picker-close>Close</button>
          <button class="btn-primary" data-picker-save>${icon("check", "h-4 w-4")} Save selection</button>
        </div>
      `,
    });

    const rowNodes = [...modal.body.querySelectorAll("[data-picker-row]")];
    const updateRowState = (index) => {
      const row = rows[index];
      const node = rowNodes[index];
      const checkbox = node.querySelector("[data-show]");
      const order = node.querySelector("[data-order]");
      row.show = checkbox.checked;
      if (row.show) {
        if (!order.value) {
          const used = rows.filter((item) => item.show && item.order).map((item) => Number(item.order));
          order.value = String(used.length ? Math.max(...used) + 1 : 1);
        }
      }
      row.order = order.value;
      order.disabled = !row.show;
      node.classList.toggle("bg-accent-500/[0.035]", row.show);
    };

    rowNodes.forEach((node, index) => {
      node.querySelector("[data-show]")?.addEventListener("change", () => updateRowState(index));
      node.querySelector("[data-order]")?.addEventListener("input", () => {
        rows[index].order = node.querySelector("[data-order]").value;
      });
      node.querySelector("[data-name]")?.addEventListener("input", () => {
        rows[index].name = node.querySelector("[data-name]").value;
      });
    });

    modal.body.querySelector("[data-select-all]")?.addEventListener("click", () => {
      rows.forEach((row, index) => {
        if (!row.show) {
          const node = rowNodes[index];
          node.querySelector("[data-show]").checked = true;
          updateRowState(index);
        }
      });
    });
    modal.body.querySelector("[data-select-none]")?.addEventListener("click", () => {
      rows.forEach((row, index) => {
        const node = rowNodes[index];
        node.querySelector("[data-show]").checked = false;
        updateRowState(index);
      });
    });
    modal.body.querySelector("[data-save-notes]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const notes = modal.body.querySelector("[data-notes]").value;
      setButtonBusy(button, true, "Saving…");
      try {
        const response = await api(`${workflowUrl(config.name)}/notes`, {
          method: "PUT",
          body: { notes },
        });
        config.notes = response.notes;
        renderNotes();
        toast("Notes saved.", "success");
      } catch (error) {
        toast(error.message, "error");
      } finally {
        setButtonBusy(button, false);
      }
    });
    modal.element.querySelector("[data-picker-close]")?.addEventListener("click", () => modal.close());
    modal.element.querySelector("[data-picker-save]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      setButtonBusy(button, true, "Saving…");
      const ordered = rows
        .filter((row) => row.show)
        .sort((a, b) => {
          const first = a.order === "" ? Number.POSITIVE_INFINITY : Number(a.order);
          const second = b.order === "" ? Number.POSITIVE_INFINITY : Number(b.order);
          return first - second;
        });
      try {
        const updated = await api(`${workflowUrl(config.name)}/fields`, {
          method: "PUT",
          body: {
            bindings: [
              ...ordered.map((row) => ({
                id: row.candidate.id,
                name: row.name.trim(),
                visible: true,
              })),
              // Hidden aliases stay in the same list so showing the input
              // again restores its display name.
              ...rows
                .filter((row) => !row.show && row.name.trim())
                .map((row) => ({
                  id: row.candidate.id,
                  name: row.name.trim(),
                  visible: false,
                })),
            ],
          },
        });
        modal.close();
        applyConfig(updated, { preserve: true });
        toast("Input selection saved.", "success");
      } catch (error) {
        toast(error.message, "error");
        setButtonBusy(button, false);
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* Config lifecycle and generation                                  */
  /* ---------------------------------------------------------------- */

  function applyConfig(nextConfig, { preserve = false } = {}) {
    const previousValues = state.values;
    config = nextConfig;
    workflow = nextConfig.name;
    if (workflowSelect) workflowSelect.value = workflow;

    if (preserve) {
      state.values = { ...nextConfig.values, ...previousValues };
      state.images = nextConfig.image_nodes.map((_node, index) => state.images[index] || null);
    } else {
      state.values = { ...nextConfig.values };
      state.images = nextConfig.image_nodes.map(() => null);
      state.audio = null;
      state.video = null;
      state.result = null;
      state.error = "";
      hideProgress();
    }

    renderWorkflowSummary();
    renderPresets();
    renderNotes();
    renderMedia();
    renderControls();
    renderResult();
    renderButtons();
  }

  function renderButtons() {
    generateButton.disabled = state.running || !config;
    generateButton.innerHTML = state.running
      ? `${spinner("h-4 w-4")} Generating…`
      : `${icon("play", "h-4 w-4")} Generate`;
    stopButton.disabled = !state.running;
  }

  async function loadWorkflow(name, { preserve = false } = {}) {
    if (!name) {
      $("[data-workflow-summary]").textContent = "No workflow selected";
      return;
    }
    try {
      $("[data-workflow-summary]").textContent = "Loading…";
      const data = await api(workflowUrl(name));
      applyConfig(data, { preserve });
      if (!preserve) {
        selectedPreset = data.default_preset || data.preset_names[0] || "";
      }
    } catch (error) {
      toast(error.message, "error");
      $("[data-workflow-summary]").textContent = "Could not load workflow";
    }
  }

  async function runGenerate() {
    if (!config || state.running) return;
    state.running = true;
    state.result = null;
    state.error = "";
    state.controller = new AbortController();
    renderButtons();
    renderResult();
    updateProgress(0, "Preparing…", true);

    const payload = {
      workflow: config.name,
      values: candidateValues(config, state.values),
      randomize_seed: randomize,
      images: config.image_nodes.map((_node, index) => refPayload(state.images[index])),
      audio: refPayload(state.audio),
      video: refPayload(state.video),
    };

    try {
      await stream(
        "/api/generate",
        payload,
        (event) => {
          if (event.type === "phase") {
            updateProgress(null, event.message, true);
          } else if (event.type === "progress") {
            updateProgress(event.value, event.message, Boolean(event.indeterminate));
          } else if (event.type === "result") {
            state.result = event;
            state.error = "";
            renderResult();
          } else if (event.type === "error") {
            state.error = event.message || "Generation failed.";
            state.running = false;
            renderButtons();
            renderResult();
            toast(state.error, "error");
          } else if (event.type === "cancelled") {
            state.error = "Generation cancelled.";
            state.running = false;
            renderButtons();
            renderResult();
            toast("Generation cancelled.", "warning");
          } else if (event.type === "done") {
            state.running = false;
            renderButtons();
            renderResult();
            updateProgress(1, "Done.", false);
            setTimeout(hideProgress, 1400);
          }
        },
        state.controller.signal,
      );
    } catch (error) {
      if (error.name !== "AbortError") {
        state.error = error.message || "Generation failed.";
        renderResult();
        toast(state.error, "error");
      }
    } finally {
      state.running = false;
      state.controller = null;
      renderButtons();
      if (!state.error) {
        renderResult();
        if (state.result) {
          updateProgress(1, "Done.", false);
          setTimeout(hideProgress, 1400);
        }
      }
    }
  }

  async function stopGenerate() {
    try {
      await api("/api/generate/cancel", { method: "POST" });
      state.controller?.abort();
      toast("Stopping generation…", "warning", 2200);
    } catch (error) {
      toast(error.message, "error");
    }
  }

  /* ---------------------------------------------------------------- */
  /* Wire static controls                                             */
  /* ---------------------------------------------------------------- */

  workflowSelect?.addEventListener("change", () => {
    selectedPreset = null;
    loadWorkflow(workflowSelect.value, { preserve: false });
  });
  $("[data-reload-workflow]")?.addEventListener("click", () => {
    loadWorkflow(workflow, { preserve: true });
    toast("Workflow refreshed.", "success", 1800);
  });
  $("[data-choose-inputs]")?.addEventListener("click", openInputPicker);
  generateButton.addEventListener("click", runGenerate);
  stopButton.addEventListener("click", stopGenerate);

  renderButtons();
  renderResult();
  if (workflow) await loadWorkflow(workflow);

  return () => {
    if (state.running) {
      state.controller?.abort();
      api("/api/generate/cancel", { method: "POST" }).catch(() => {});
    }
  };
}
