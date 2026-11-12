import { api, uploadFile } from "../api.js";
import { openAudioTrimmer } from "../audio.js";
import {
  clamp,
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

/* A run belongs to the server, not to the Generate page. The dashboard polls
   the job status, so navigating away, reloading, or turning the phone screen
   off all resume the progress bar instead of losing the run. */
const job = {
  running: false,
  result: null,
  error: "",
  progress: null,
  workflow: null,
  startedAt: 0,
  elapsedMs: 0,
  doneAt: 0,
  listeners: new Set(),
};

const JOB_POLL_INTERVAL = 500;
let pollTimer = null;
let pollInFlight = false;

function jobElapsed() {
  return job.running && job.startedAt
    ? performance.now() - job.startedAt
    : job.elapsedMs;
}

function jobSnapshot() {
  return {
    running: job.running,
    result: job.result,
    error: job.error,
    progress: job.progress,
    workflow: job.workflow,
    elapsedMs: jobElapsed(),
    doneAt: job.doneAt,
  };
}

function notifyJob() {
  const snapshot = jobSnapshot();
  for (const listener of [...job.listeners]) {
    try {
      listener(snapshot);
    } catch (error) {
      console.error(error);
    }
  }
}

function subscribeJob(listener) {
  job.listeners.add(listener);
  listener(jobSnapshot());
  return () => job.listeners.delete(listener);
}

function finishJob() {
  if (job.startedAt) {
    job.elapsedMs = performance.now() - job.startedAt;
    job.startedAt = 0;
  }
  job.running = false;
}

function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
}

function schedulePoll(delay = JOB_POLL_INTERVAL) {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(pollJob, delay);
}

function applyJobSnapshot(snapshot) {
  const wasRunning = job.running;
  const previousError = job.error;
  const elapsed = Number(snapshot.elapsed_ms) || 0;

  job.running = Boolean(snapshot.running);
  job.workflow = snapshot.workflow || null;
  job.error = snapshot.error || "";
  job.result = snapshot.result || null;
  if (snapshot.progress) {
    job.progress = {
      value: snapshot.progress.value,
      message: snapshot.progress.message || "",
      indeterminate: Boolean(snapshot.progress.indeterminate),
    };
  } else {
    job.progress = null;
  }

  if (job.running) {
    // Re-base the local clock on the server's elapsed time so a suspended or
    // reloaded page shows the real duration rather than restarting at zero.
    job.startedAt = performance.now() - elapsed;
    job.elapsedMs = elapsed;
    job.doneAt = 0;
  } else {
    job.startedAt = 0;
    job.elapsedMs = elapsed;
    if (!job.error && job.result) {
      job.progress = { value: 1, message: "Done.", indeterminate: false };
      if (wasRunning) job.doneAt = performance.now();
    } else {
      job.doneAt = 0;
    }
  }

  if (wasRunning && job.error && job.error !== previousError) {
    toast(
      job.error,
      job.error === "Generation cancelled." ? "warning" : "error",
    );
  }

  notifyJob();
  if (job.running) schedulePoll();
  else stopPolling();
}

async function pollJob() {
  pollTimer = null;
  if (!job.running) return;
  if (pollInFlight) {
    schedulePoll();
    return;
  }
  pollInFlight = true;
  try {
    applyJobSnapshot(await api("/api/generate/status"));
  } catch (_error) {
    // A phone dropping the request while its screen is off is expected: keep
    // the last progress visible and try again. The job runs on the server.
    if (job.running) schedulePoll(JOB_POLL_INTERVAL * 2);
  } finally {
    pollInFlight = false;
  }
}

async function refreshJob() {
  if (pollInFlight) {
    schedulePoll(0);
    return jobSnapshot();
  }
  pollInFlight = true;
  try {
    applyJobSnapshot(await api("/api/generate/status"));
  } catch (_error) {
    // Leave the local state untouched if the server is unavailable, but keep
    // retrying when a run is still live on the server.
    if (job.running) schedulePoll(JOB_POLL_INTERVAL * 2);
  } finally {
    pollInFlight = false;
  }
  return jobSnapshot();
}

async function startGeneration(payload) {
  stopPolling();
  job.running = true;
  job.result = null;
  job.error = "";
  job.workflow = payload.workflow || null;
  job.progress = { value: 0, message: "Preparing…", indeterminate: true };
  job.startedAt = performance.now();
  job.elapsedMs = 0;
  job.doneAt = 0;
  notifyJob();

  try {
    applyJobSnapshot(
      await api("/api/generate", { method: "POST", body: payload }),
    );
  } catch (error) {
    if (error.status === 409) {
      // Another run is already live (for example after a rapid reload);
      // attach to it instead of reporting a failure.
      try {
        applyJobSnapshot(await api("/api/generate/status"));
        return;
      } catch (_statusError) {
        // Fall through to the error below.
      }
    }
    job.error = error.message || "Generation failed.";
    finishJob();
    toast(job.error, "error");
    notifyJob();
  }
}

// Mobile browsers freeze timers while the screen is off. Catch up as soon as
// the page is visible again instead of waiting for the next scheduled poll.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    refreshJob();
  }
});

export async function renderGenerate(root, ctx) {
  // Recover a run that outlived this page (navigation, reload, phone screen
  // off) before choosing which workflow to show.
  await refreshJob();

  const workflows = ctx.boot.workflows || [];
  let config = null;
  let workflow = ctx.boot.default_workflow || workflows[0]?.name || null;
  // Reopen on the workflow of the last run so a returning page matches the
  // progress it is about to show.
  if (job.workflow && (job.running || job.result || job.error)) {
    workflow = job.workflow;
  }
  let randomize = true;
  let selectedPreset = null;
  let notesCollapsed = false;
  // Ignore a previous run's output when it belongs to another workflow.
  const lastRunMatches = Boolean(workflow) && job.workflow === workflow;

  const state = {
    values: {},
    images: [],
    audio: null,
    video: null,
    running: job.running,
    result: lastRunMatches ? job.result : null,
    error: lastRunMatches ? job.error : "",
    elapsedMs: jobElapsed(),
    timer: null,
    unsubscribe: null,
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
                <span class="flex shrink-0 items-center gap-2 font-mono text-slate-500">
                  <span data-progress-time></span>
                  <span data-progress-percent></span>
                </span>
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
            <div class="flex items-center gap-2">
              <span class="chip hidden" data-result-time title="Generation time"></span>
              <a class="btn-ghost btn-xs hidden" data-result-open target="_blank" rel="noopener noreferrer">${icon("external", "h-4 w-4")} Open</a>
            </div>
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
  const progressTime = $("[data-progress-time]");
  const resultTime = $("[data-result-time]");
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
    progressTime.textContent = "";
  }

  function formatDuration(ms) {
    const seconds = Math.max(0, ms) / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60);
    return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
  }

  function setResultTime(ms) {
    if (!resultTime) return;
    if (!ms) {
      resultTime.classList.add("hidden");
      resultTime.textContent = "";
      return;
    }
    const text = formatDuration(ms);
    resultTime.innerHTML = `${icon("clock", "h-3 w-3")} ${text}`;
    resultTime.title = `Generation time: ${text}`;
    resultTime.classList.remove("hidden");
  }

  function startTimer() {
    if (!state.timer) {
      state.timer = setInterval(() => {
        if (!job.running) return;
        progressTime.textContent = formatDuration(jobElapsed());
      }, 200);
    }
    progressTime.textContent = formatDuration(jobElapsed());
  }

  function stopTimer() {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  let lastRenderKey = "";

  function syncFromJob(snapshot) {
    // The server keeps one global job, so its last result may belong to a
    // different workflow. Only surface output for the workflow on screen.
    const matchesWorkflow = Boolean(workflow) && snapshot.workflow === workflow;
    const snapshotResult = matchesWorkflow ? snapshot.result : null;
    const snapshotError = matchesWorkflow ? snapshot.error : "";

    state.running = snapshot.running;
    state.result = snapshotResult;
    state.error = snapshotError;
    state.elapsedMs = snapshot.elapsedMs;

    // Repaint the buttons/result only when their content can change; progress
    // events arrive frequently and all move the bar, not the result panel.
    const renderKey = [
      snapshot.running,
      snapshotError,
      snapshotResult?.url || "",
      snapshotResult?.kind || "",
    ].join("|");
    if (renderKey !== lastRenderKey) {
      lastRenderKey = renderKey;
      renderButtons();
      renderResult();
    }

    const showingDone =
      !snapshot.running &&
      snapshot.doneAt &&
      snapshot.progress?.message === "Done." &&
      performance.now() - snapshot.doneAt < 1400;

    if (snapshot.running) {
      updateProgress(
        snapshot.progress?.value,
        snapshot.progress?.message,
        Boolean(snapshot.progress?.indeterminate),
      );
      startTimer();
    } else if (showingDone) {
      updateProgress(1, "Done.", false);
      stopTimer();
      progressTime.textContent = formatDuration(snapshot.elapsedMs);
      setTimeout(
        () => {
          if (!job.running) hideProgress();
        },
        Math.max(0, 1400 - (performance.now() - snapshot.doneAt)),
      );
    } else {
      stopTimer();
      hideProgress();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Result                                                           */
  /* ---------------------------------------------------------------- */

  function renderResult() {
    if (state.error) {
      resultOpen.classList.add("hidden");
      setResultTime(0);
      $("[data-result-subtitle]").textContent = state.elapsedMs
        ? `${state.error === "Generation cancelled." ? "Cancelled" : "Generation failed"} after ${formatDuration(state.elapsedMs)}.`
        : "Generation failed.";
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
      setResultTime(0);
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
      setResultTime(0);
      $("[data-result-subtitle]").textContent = "Nothing generated yet.";
      result.innerHTML = emptyState(
        "Ready when you are",
        "Set your inputs, then press Generate. Results stay available here until you start another run.",
        "sparkles",
      );
      return;
    }

    const item = state.result;
    setResultTime(state.elapsedMs);
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
          <audio class="w-full" controls src="${escapeHtml(item.url)}"></audio>
        </div>
      `;
    } else {
      result.innerHTML = `
        <div class="overflow-hidden rounded-2xl border border-subtle bg-ink-950">
          <video class="max-h-[72vh] w-full" controls playsinline src="${escapeHtml(item.url)}"></video>
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
    if (!config) {
      notesCard.classList.add("hidden");
      notesCard.innerHTML = "";
      return;
    }
    notesCard.classList.remove("hidden");
    notesCard.innerHTML = `
      <div class="card-header">
        <button type="button" class="flex min-w-0 flex-1 items-center gap-2.5 text-left" data-notes-toggle aria-expanded="${notesCollapsed ? "false" : "true"}" aria-controls="workflow-notes-body">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-300">${icon("info", "h-4 w-4")}</span>
          <span class="min-w-0">
            <span class="card-title block">Workflow notes</span>
            <span class="card-subtitle block">Tips saved for this workflow</span>
          </span>
          <span class="ml-auto shrink-0 text-slate-500 transition-transform ${notesCollapsed ? "" : "rotate-180"}" data-notes-chevron>${icon("chevron", "h-4 w-4")}</span>
        </button>
        <button class="btn-ghost btn-xs" data-edit-notes>${icon("pencil", "h-4 w-4")} Edit</button>
      </div>
      <div id="workflow-notes-body" data-notes-body class="${notesCollapsed ? "hidden" : ""}">
        ${
          config.notes
            ? `<div class="prose-notes p-4 sm:p-5">${renderMarkdown(config.notes)}</div>`
            : `<p class="p-4 text-sm text-slate-500 sm:p-5">No notes for this workflow yet. Use Edit to add tips.</p>`
        }
      </div>
    `;
    notesCard.querySelector("[data-edit-notes]")?.addEventListener("click", openNotesEditor);
    notesCard.querySelector("[data-notes-toggle]")?.addEventListener("click", () => {
      notesCollapsed = !notesCollapsed;
      notesCard
        .querySelector("[data-notes-body]")
        ?.classList.toggle("hidden", notesCollapsed);
      const toggle = notesCard.querySelector("[data-notes-toggle]");
      toggle?.setAttribute("aria-expanded", String(!notesCollapsed));
      toggle
        ?.querySelector("[data-notes-chevron]")
        ?.classList.toggle("rotate-180", !notesCollapsed);
    });
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
            <span class="text-[11px] text-slate-600">Upload, crop, sketch or pick from the gallery</span>
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
      slot.querySelector("[data-image-crop]")?.addEventListener("click", () => openCrop(index));
      slot.querySelector("[data-image-gallery]")?.addEventListener("click", () => openImageGallery(index));
      slot.querySelector("[data-image-clear]")?.addEventListener("click", () => {
        state.images[index] = null;
        renderMedia();
      });
    });

    inputsCard.querySelector("[data-audio-upload]")?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) openAudioUpload(file);
    });
    inputsCard.querySelector("[data-audio-trim]")?.addEventListener("click", openAudioTrim);
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
          ${ref ? `<button class="btn-ghost btn-xs" data-image-crop>${icon("crop", "h-3.5 w-3.5")} Crop</button>` : ""}
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
          ${ref ? `<button class="btn-ghost btn-xs" data-audio-trim>${icon("scissors", "h-3.5 w-3.5")} Trim</button>` : ""}
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

  function openAudioUpload(file) {
    openAudioTrimmer({
      source: file,
      name: file.name || "audio",
      title: "Trim reference audio",
      subtitle:
        "Choose the part of the clip to keep before uploading. Trimmed selections are saved as WAV.",
      onApply: (trimmed) => uploadAudioRef(trimmed),
    });
  }

  function openAudioTrim() {
    const ref = state.audio;
    if (!ref?.previewUrl) {
      toast("Choose an audio file first.", "warning");
      return;
    }
    openAudioTrimmer({
      source: ref.previewUrl,
      name: ref.name || "audio",
      title: "Trim reference audio",
      subtitle: "Choose the part of the clip to keep.",
      onApply: (trimmed) => uploadAudioRef(trimmed),
    });
  }

  async function uploadAudioRef(file) {
    const stored = await uploadFile(file);
    state.audio = {
      upload: stored.id,
      previewUrl: stored.url,
      name: stored.name || file.name,
    };
    renderMedia();
    toast("Audio ready.", "success", 1600);
  }

  async function openImageGallery(index) {
    const modal = openModal({
      title: "Choose an image",
      subtitle: "Reuse a recent image from ComfyUI or the media folder.",
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
          "Generate an image first, add one to the media folder, or upload one in the image editor.",
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
                <img src="${escapeHtml(item.thumbnail_url || item.url)}" data-full-src="${escapeHtml(item.url)}" alt="${escapeHtml(item.filename)}" loading="lazy" class="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
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
      modal.body.querySelectorAll("img[data-full-src]").forEach((image) => {
        image.addEventListener("error", () => {
          const fallback = image.dataset.fullSrc;
          if (fallback && image.getAttribute("src") !== fallback) {
            image.src = fallback;
          } else {
            image.hidden = true;
          }
        });
      });
    } catch (error) {
      modal.body.innerHTML = `<p class="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">${escapeHtml(error.message)}</p>`;
    }
  }

  async function openVideoGallery() {
    const modal = openModal({
      title: "Choose a video",
      subtitle: "Reuse a recent video from ComfyUI or the media folder.",
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
          "Generate or upscale a video first, add one to the media folder, or upload one above.",
          "film",
        );
        return;
      }
      modal.body.innerHTML = `<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        ${data.items
          .map(
            (item, itemIndex) => `
            <button class="group overflow-hidden rounded-xl border border-subtle bg-raised text-left transition hover:border-accent-400/40 hover:bg-raised" data-video-item="${itemIndex}">
              <div class="relative aspect-video overflow-hidden bg-ink-950">
                <span class="absolute inset-0 flex items-center justify-center text-slate-600">${icon("film", "h-7 w-7")}</span>
                ${
                  item.thumbnail_url
                    ? `<img src="${escapeHtml(item.thumbnail_url)}" data-thumbnail alt="${escapeHtml(item.filename)}" loading="lazy" class="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105" />`
                    : ""
                }
                <span class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
                  <span class="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white">
                    ${icon("play", "h-4 w-4")}
                  </span>
                </span>
              </div>
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
      modal.body.querySelectorAll("img[data-thumbnail]").forEach((image) => {
        image.addEventListener("error", () => image.remove());
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

  function openCrop(index) {
    const ref = state.images[index];
    if (!ref?.previewUrl) {
      toast("Choose an image first.", "warning");
      return;
    }

    let onResize = null;
    const modal = openModal({
      title: "Crop an input image",
      subtitle:
        "Drag the box to move it, or its handles to resize. Dimensions are rounded to multiples of 8.",
      size: "lg",
      onClose: () => {
        if (onResize) window.removeEventListener("resize", onResize);
      },
      content: `
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-3 rounded-xl border border-subtle bg-raised px-3 py-2">
            <span class="min-w-0 truncate text-[11px] text-slate-500">Source: ${escapeHtml(ref.name || "image")}</span>
            <span class="shrink-0 font-mono text-[11px] text-slate-400" data-crop-size>—</span>
          </div>
          <div class="flex items-center justify-center rounded-xl border border-subtle bg-ink-950 p-2">
            <div class="relative inline-block max-w-full touch-none select-none" data-crop-stage>
              <img src="${escapeHtml(ref.previewUrl)}" alt="Image to crop" draggable="false" class="block max-h-[62vh] max-w-full" data-crop-image />
              <div class="pointer-events-none absolute bg-black/60" data-shade="n"></div>
              <div class="pointer-events-none absolute bg-black/60" data-shade="s"></div>
              <div class="pointer-events-none absolute bg-black/60" data-shade="w"></div>
              <div class="pointer-events-none absolute bg-black/60" data-shade="e"></div>
              <div class="absolute border-2 border-white/90" data-crop-box>
                <span class="absolute inset-0 cursor-move" data-handle="move"></span>
                <span class="absolute left-0 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-sm border border-black/40 bg-white shadow" data-handle="nw"></span>
                <span class="absolute left-1/2 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize rounded-sm border border-black/40 bg-white shadow" data-handle="n"></span>
                <span class="absolute left-full top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize rounded-sm border border-black/40 bg-white shadow" data-handle="ne"></span>
                <span class="absolute left-full top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-sm border border-black/40 bg-white shadow" data-handle="e"></span>
                <span class="absolute left-full top-full h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-sm border border-black/40 bg-white shadow" data-handle="se"></span>
                <span class="absolute left-1/2 top-full h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize rounded-sm border border-black/40 bg-white shadow" data-handle="s"></span>
                <span class="absolute left-0 top-full h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize rounded-sm border border-black/40 bg-white shadow" data-handle="sw"></span>
                <span class="absolute left-0 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-sm border border-black/40 bg-white shadow" data-handle="w"></span>
              </div>
            </div>
          </div>
          <p class="text-[11px] leading-5 text-slate-500">
            The cropped image replaces the selected one in this slot. Crop it again to adjust the result.
          </p>
        </div>
      `,
      footer: `
        <div class="flex w-full items-center justify-end gap-2">
          <button class="btn-secondary" data-crop-cancel>Cancel</button>
          <button class="btn-primary" data-crop-apply>${icon("check", "h-4 w-4")} Use crop</button>
        </div>
      `,
    });

    const img = modal.element.querySelector("[data-crop-image]");
    const box = modal.element.querySelector("[data-crop-box]");
    const sizeLabel = modal.element.querySelector("[data-crop-size]");
    const applyButton = modal.element.querySelector("[data-crop-apply]");
    const shades = {
      n: modal.element.querySelector('[data-shade="n"]'),
      s: modal.element.querySelector('[data-shade="s"]'),
      w: modal.element.querySelector('[data-shade="w"]'),
      e: modal.element.querySelector('[data-shade="e"]'),
    };

    // The selection is stored as fractions of the image so it survives a
    // viewport resize; the crop itself is computed from the natural pixels.
    let selection = null;
    let drag = null;

    const displaySize = () => {
      const rect = img.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    };

    const minSize = (dw, dh) => ({
      width: Math.min(0.5, 24 / Math.max(1, dw)),
      height: Math.min(0.5, 24 / Math.max(1, dh)),
    });

    function naturalRect() {
      if (!selection || !img.naturalWidth || !img.naturalHeight) return null;
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      const width = clamp(Math.round((selection.width * nw) / 8) * 8, 8, nw);
      const height = clamp(Math.round((selection.height * nh) / 8) * 8, 8, nh);
      const x = clamp(Math.round(selection.x * nw), 0, nw - width);
      const y = clamp(Math.round(selection.y * nh), 0, nh - height);
      return { x, y, width, height };
    }

    function render() {
      if (!selection) return;
      const left = selection.x * 100;
      const top = selection.y * 100;
      const width = selection.width * 100;
      const height = selection.height * 100;

      box.style.left = `${left}%`;
      box.style.top = `${top}%`;
      box.style.width = `${width}%`;
      box.style.height = `${height}%`;

      Object.assign(shades.n.style, {
        left: "0%",
        top: "0%",
        width: "100%",
        height: `${top}%`,
      });
      Object.assign(shades.s.style, {
        left: "0%",
        top: `${top + height}%`,
        width: "100%",
        bottom: "0",
      });
      Object.assign(shades.w.style, {
        left: "0%",
        top: `${top}%`,
        width: `${left}%`,
        height: `${height}%`,
      });
      Object.assign(shades.e.style, {
        left: `${left + width}%`,
        top: `${top}%`,
        right: "0",
        height: `${height}%`,
      });

      const rect = naturalRect();
      if (rect && sizeLabel) sizeLabel.textContent = `${rect.width} × ${rect.height}`;
    }

    function initialize() {
      const { width: dw, height: dh } = displaySize();
      if (!dw || !dh) return;
      const side = Math.min(dw, dh) * 0.8;
      selection = {
        x: (dw - side) / 2 / dw,
        y: (dh - side) / 2 / dh,
        width: side / dw,
        height: side / dh,
      };
      render();
    }

    function selectionFrom(mode, start, dx, dy) {
      const { width: dw, height: dh } = displaySize();
      if (!dw || !dh) return start;
      const minimum = minSize(dw, dh);
      const next = { ...start };
      const fx = dx / dw;
      const fy = dy / dh;

      if (mode === "move") {
        next.x = clamp(start.x + fx, 0, 1 - start.width);
        next.y = clamp(start.y + fy, 0, 1 - start.height);
        return next;
      }

      let left = start.x;
      let top = start.y;
      let right = start.x + start.width;
      let bottom = start.y + start.height;
      if (mode.includes("w")) left = clamp(left + fx, 0, Math.max(0, right - minimum.width));
      if (mode.includes("e")) right = clamp(right + fx, Math.min(1, left + minimum.width), 1);
      if (mode.includes("n")) top = clamp(top + fy, 0, Math.max(0, bottom - minimum.height));
      if (mode.includes("s")) bottom = clamp(bottom + fy, Math.min(1, top + minimum.height), 1);

      next.x = left;
      next.y = top;
      next.width = right - left;
      next.height = bottom - top;
      return next;
    }

    box.querySelectorAll("[data-handle]").forEach((handle) => {
      handle.addEventListener("pointerdown", (event) => {
        if (!selection) return;
        event.preventDefault();
        event.stopPropagation();
        handle.setPointerCapture(event.pointerId);
        drag = {
          mode: handle.dataset.handle,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          selection: { ...selection },
        };
      });
      handle.addEventListener("pointermove", (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        selection = selectionFrom(
          drag.mode,
          drag.selection,
          event.clientX - drag.startX,
          event.clientY - drag.startY,
        );
        render();
      });
      const finish = (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        drag = null;
      };
      handle.addEventListener("pointerup", finish);
      handle.addEventListener("pointercancel", finish);
    });

    onResize = () => render();
    window.addEventListener("resize", onResize);

    const start = () => requestAnimationFrame(initialize);
    if (img.complete && img.naturalWidth > 0) start();
    else img.addEventListener("load", start, { once: true });
    img.addEventListener("error", () => {
      if (sizeLabel) sizeLabel.textContent = "Image unavailable";
      if (applyButton) applyButton.disabled = true;
    });

    modal.element
      .querySelector("[data-crop-cancel]")
      ?.addEventListener("click", () => modal.close());

    const mimeType = /\.(jpe?g)$/i.test(ref.name || "")
      ? "image/jpeg"
      : "image/png";

    applyButton.addEventListener("click", () => {
      const rect = naturalRect();
      if (!rect) {
        toast("The image is still loading.", "warning");
        return;
      }
      setButtonBusy(applyButton, true, "Cropping…");
      const canvas = document.createElement("canvas");
      canvas.width = rect.width;
      canvas.height = rect.height;
      const context = canvas.getContext("2d");
      context.drawImage(
        img,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        0,
        0,
        rect.width,
        rect.height,
      );
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            setButtonBusy(applyButton, false);
            toast("Could not export the crop.", "error");
            return;
          }
          const extension = mimeType === "image/jpeg" ? "jpg" : "png";
          try {
            const file = new File([blob], `crop.${extension}`, { type: mimeType });
            const stored = await uploadFile(file);
            state.images[index] = {
              upload: stored.id,
              previewUrl: stored.url,
              name: stored.name || `crop.${extension}`,
            };
            modal.close();
            renderMedia();
            toast("Crop applied.", "success");
          } catch (error) {
            toast(error.message, "error");
            setButtonBusy(applyButton, false);
          }
        },
        mimeType,
        mimeType === "image/jpeg" ? 0.92 : undefined,
      );
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
    // The seed control may be hidden, so look at every candidate rather than
    // only the selected ones.
    const hasSeed = config.candidates.some((candidate) =>
      /(^|_)(noise_)?seed$/.test(candidate.input),
    );
    const randomizeRow = hasSeed
      ? `<label class="flex items-center justify-between gap-3 rounded-xl border border-subtle bg-raised px-3 py-2.5">
           <span><span class="block text-sm font-medium text-slate-200">Randomize seed</span><span class="text-[11px] text-slate-500">Use a fresh seed on every run</span></span>
           <span class="switch"><input type="checkbox" ${randomize ? "checked" : ""} data-randomize /><span></span></span>
         </label>`
      : "";
    const bindRandomize = () => {
      controls.querySelector("[data-randomize]")?.addEventListener("change", (event) => {
        randomize = event.target.checked;
      });
    };

    $("[data-controls-summary]").textContent = `${candidates.length} control${candidates.length === 1 ? "" : "s"} shown`;
    if (!candidates.length) {
      controls.innerHTML = `
        ${emptyState(
          "No inputs selected",
          "Use Choose inputs to pick which workflow parameters appear here.",
          "settings",
        )}
        <div class="mt-4 flex justify-center"><button class="btn-secondary btn-xs" data-empty-choose>Choose inputs</button></div>
        ${randomizeRow ? `<div class="mt-4">${randomizeRow}</div>` : ""}
      `;
      controls.querySelector("[data-empty-choose]")?.addEventListener("click", openInputPicker);
      bindRandomize();
      return;
    }

    for (const candidate of candidates) {
      if (!(candidate.id in state.values) || state.values[candidate.id] === undefined) {
        state.values[candidate.id] = candidate.value;
      }
    }

    controls.innerHTML = `
      <div class="space-y-4">
        ${candidates.map((candidate) => controlHtml(candidate, state.values[candidate.id])).join("")}
      </div>
      ${randomizeRow ? `<div class="mt-4">${randomizeRow}</div>` : ""}
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

    bindRandomize();
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

  function openNotesEditor() {
    if (!config) return;
    const modal = openModal({
      title: "Workflow notes",
      subtitle: `Markdown tips shown on the Generate page for ${config.name}.`,
      size: "lg",
      content: `
        <textarea class="textarea font-mono text-xs" rows="14" data-notes placeholder="### Tips&#10;&#10;- Add workflow-specific tips here.">${escapeHtml(config.notes || "")}</textarea>
      `,
      footer: `
        <div class="flex w-full flex-wrap items-center justify-end gap-2">
          <button class="btn-secondary" data-notes-cancel>Cancel</button>
          <button class="btn-primary" data-notes-save>${icon("check", "h-4 w-4")} Save notes</button>
        </div>
      `,
    });

    modal.element.querySelector("[data-notes-cancel]")?.addEventListener("click", () => modal.close());
    modal.element.querySelector("[data-notes-save]")?.addEventListener("click", async (event) => {
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
        modal.close();
        toast("Notes saved.", "success");
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
      state.elapsedMs = 0;
      if (!job.running) hideProgress();
    }

    renderWorkflowSummary();
    renderPresets();
    renderNotes();
    renderMedia();
    renderControls();
    renderResult();
    // The config render bypasses the job snapshot cache, so force the next
    // snapshot to repaint the result panel.
    lastRenderKey = "";
    renderButtons();
  }

  function renderButtons() {
    if (workflowSelect) workflowSelect.disabled = state.running;
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
    if (!config || job.running) return;

    const payload = {
      workflow: config.name,
      values: candidateValues(config, state.values),
      randomize_seed: randomize,
      images: config.image_nodes.map((_node, index) => refPayload(state.images[index])),
      audio: refPayload(state.audio),
      video: refPayload(state.video),
    };

    await startGeneration(payload);
  }

  async function stopGenerate() {
    if (!job.running) return;
    job.progress = {
      value: job.progress?.value,
      message: "Cancelling…",
      indeterminate: true,
    };
    notifyJob();
    try {
      await api("/api/generate/cancel", { method: "POST" });
      toast("Stopping generation…", "warning", 2200);
      schedulePoll(250);
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

  // Re-attach to the shared run, if any, and repaint progress/result from it.
  state.unsubscribe = subscribeJob(syncFromJob);

  return () => {
    state.unsubscribe?.();
    state.unsubscribe = null;
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    // The run keeps going: navigating away should not cancel it.
  };
}
