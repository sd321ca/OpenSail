import { api } from "../api.js";
import {
  confirmDialog,
  emptyState,
  escapeHtml,
  icon,
  openModal,
  spinner,
  toast,
} from "../ui.js";

const PAGE_META = {
  images: { icon: "image", noun: "image", endpoint: "/api/gallery/images", empty: "Generate an image in the Generate page or add one to the media folder, then press Refresh." },
  audio: { icon: "music", noun: "audio clip", endpoint: "/api/gallery/audio", empty: "Generate music or speech in ComfyUI or add audio to the media folder, then press Refresh." },
  videos: { icon: "film", noun: "video", endpoint: "/api/gallery/videos", empty: "Generate or upscale a video in ComfyUI or add one to the media folder, then press Refresh." },
};

function promptLabel(item) {
  return (item.prompt || "").trim();
}

function sourceLabel(item, fallback) {
  return item.type === "local" ? "From the media folder" : fallback;
}

function itemLabel(item) {
  return item.subfolder ? `${item.subfolder}/${item.filename}` : item.filename;
}

function itemKey(item) {
  return [item.type || "", item.subfolder || "", item.filename, item.prompt_id || ""].join("\u0000");
}

function sourceBadge(item, className = "") {
  const local = item.type === "local";
  return `<span class="pointer-events-none inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur-sm ${className}">${icon(local ? "folder" : "cpu", "h-3 w-3")}${local ? "Media" : "ComfyUI"}</span>`;
}

function formatMetadataValue(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch (_error) {
    return String(value);
  }
}

function metadataDetails(label, value) {
  return `<details class="group mt-2 overflow-hidden rounded-xl border border-subtle bg-ink-950/60">
    <summary class="flex cursor-pointer list-none select-none items-center justify-between gap-2 px-3 py-2 text-[11px] font-medium text-slate-300">
      <span>${escapeHtml(label)}</span>
      <span class="text-slate-500 transition group-open:rotate-180">${icon("chevron", "h-3.5 w-3.5")}</span>
    </summary>
    <pre class="max-h-72 overflow-auto border-t border-subtle p-3 font-mono text-[11px] leading-5 text-slate-300">${escapeHtml(formatMetadataValue(value))}</pre>
  </details>`;
}

function metadataPanel() {
  return `<section class="rounded-2xl border border-subtle bg-raised p-4" data-image-metadata>
    <div class="flex items-center gap-2 text-xs text-slate-500">${spinner("h-4 w-4")} Reading ComfyUI metadata…</div>
  </section>`;
}

async function loadImageMetadata(item, container) {
  if (!container) return;
  const params = new URLSearchParams({
    filename: item.filename || "",
    subfolder: item.subfolder || "",
    type: item.type || "output",
  });
  try {
    const data = await api(`/api/gallery/image-metadata?${params.toString()}`);
    if (!container.isConnected) return;

    const metadata = data?.metadata || {};
    const rows = (Array.isArray(metadata.summary) ? metadata.summary : []).filter(
      (row) => row && row.label && row.value !== undefined && row.value !== null && row.value !== "",
    );
    const detailEntries = [
      ["Prompt (API format)", metadata.prompt],
      ["Workflow (UI format)", metadata.workflow],
      ["Parameters", metadata.parameters],
      ["Comment", metadata.comment],
      ["Description", metadata.description],
      ["Title", metadata.title],
    ].filter(([, value]) => value !== undefined && value !== null && value !== "");
    const summary = rows.length
      ? `<dl class="mt-3 space-y-3">${rows
          .map(
            (row) => `<div>
              <dt class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">${escapeHtml(row.label)}</dt>
              <dd class="mt-0.5 whitespace-pre-wrap break-words text-xs leading-5 text-slate-200">${escapeHtml(row.value)}</dd>
            </div>`,
          )
          .join("")}</dl>`
      : "";
    const details = detailEntries
      .map(([label, value]) => metadataDetails(label, value))
      .join("");
    const hasMetadata = Boolean(summary || details);

    container.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">ComfyUI metadata</h3>
        ${hasMetadata ? `<span class="text-[10px] text-slate-500">Embedded in this image</span>` : ""}
      </div>
      ${hasMetadata ? `${summary}${details}` : `<p class="mt-2 text-xs text-slate-500">No ComfyUI metadata is embedded in this image.</p>`}
    `;
  } catch (error) {
    if (!container.isConnected) return;
    container.innerHTML = `<p class="text-xs leading-5 text-rose-300">Could not read metadata: ${escapeHtml(error.message)}</p>`;
  }
}

export async function renderGallery(root, ctx, kind) {
  const meta = PAGE_META[kind];
  let items = [];
  const selected = new Set();
  let loading = false;

  root.innerHTML = `
    <div class="space-y-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold tracking-tight text-slate-100">Recent ${kind}</h2>
          <p class="mt-0.5 text-xs text-slate-500" data-count>Loading from ComfyUI history and the media folder…</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button class="btn-secondary btn-xs hidden" data-move-selected>${icon("folder", "h-4 w-4")} Move to media</button>
          <button class="btn-danger btn-xs hidden" data-delete-selected>${icon("trash", "h-4 w-4")} Delete selected</button>
          <button class="btn-secondary btn-xs" data-refresh>${icon("refresh", "h-4 w-4")} Refresh</button>
        </div>
      </div>
      <div data-grid></div>
    </div>
  `;

  const grid = root.querySelector("[data-grid]");
  const count = root.querySelector("[data-count]");
  const refreshButton = root.querySelector("[data-refresh]");
  const deleteButton = root.querySelector("[data-delete-selected]");
  const moveButton = root.querySelector("[data-move-selected]");

  function updateSelection() {
    const chosen = items.filter((item) => selected.has(itemKey(item)));
    const total = chosen.length;
    const movable = chosen.filter(
      (item) => item.type !== "local" && item.prompt_id,
    ).length;
    deleteButton.classList.toggle("hidden", total === 0);
    deleteButton.disabled = loading || total === 0;
    deleteButton.innerHTML = `${icon("trash", "h-4 w-4")} Delete selected${total ? ` (${total})` : ""}`;
    moveButton.classList.toggle("hidden", movable === 0);
    moveButton.disabled = loading || movable === 0;
    moveButton.innerHTML = `${icon("folder", "h-4 w-4")} Move to media${movable ? ` (${movable})` : ""}`;
  }

  function selectionControl(index, item) {
    return `<label class="absolute bottom-2 right-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border border-white/20 bg-black/55 backdrop-blur-sm transition hover:bg-black/75" title="Select ${escapeHtml(itemLabel(item))}">
      <input type="checkbox" class="h-4 w-4 cursor-pointer rounded border-white/40 bg-transparent accent-accent-500" data-select-item="${index}" ${selected.has(itemKey(item)) ? "checked" : ""} aria-label="Select ${escapeHtml(itemLabel(item))}" />
    </label>`;
  }

  function wireSelection() {
    grid.querySelectorAll("[data-select-item]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const item = items[Number(checkbox.dataset.selectItem)];
        if (!item) return;
        if (checkbox.checked) {
          selected.add(itemKey(item));
        } else {
          selected.delete(itemKey(item));
        }
        const container = checkbox.closest("[data-selectable]");
        if (container) {
          container.classList.toggle("ring-2", checkbox.checked);
          container.classList.toggle("ring-accent-400", checkbox.checked);
        }
        updateSelection();
      });
    });
  }

  function skeleton() {
    if (kind === "audio") {
      return `<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        ${Array.from({ length: 8 })
          .map(() => `<div class="skeleton h-28 rounded-2xl"></div>`)
          .join("")}
      </div>`;
    }
    return `<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      ${Array.from({ length: 10 })
        .map(() => `<div class="skeleton aspect-square rounded-2xl"></div>`)
        .join("")}
    </div>`;
  }

  function openLightbox(item) {
    const prompt = promptLabel(item);
    const modal = openModal({
      title: itemLabel(item) || "Image",
      subtitle: prompt || sourceLabel(item, "Generated by ComfyUI"),
      size: "lg",
      content: `<div class="space-y-4">
        <div class="flex items-center justify-center overflow-hidden rounded-2xl border border-subtle bg-ink-950">
          <img src="${escapeHtml(item.url)}" alt="${escapeHtml(itemLabel(item))}" class="max-h-[72vh] w-full object-contain" />
        </div>
        ${metadataPanel()}
      </div>`,
      footer: `<div class="flex w-full items-center justify-between gap-3">
        <a class="btn-ghost btn-xs" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${icon("external", "h-4 w-4")} Open original</a>
        <a class="btn-secondary btn-xs" href="${escapeHtml(item.url)}" download>${icon("download", "h-4 w-4")} Download</a>
      </div>`,
    });
    loadImageMetadata(item, modal.body.querySelector("[data-image-metadata]"));
    return modal;
  }

  function openVideo(item) {
    const prompt = promptLabel(item);
    openModal({
      title: itemLabel(item) || "Video",
      subtitle: prompt || sourceLabel(item, "Generated by ComfyUI"),
      size: "lg",
      content: `<div class="flex items-center justify-center overflow-hidden rounded-2xl border border-subtle bg-ink-950">
        <video class="max-h-[72vh] w-full" controls autoplay playsinline src="${escapeHtml(item.url)}"${item.thumbnail_url ? ` poster="${escapeHtml(item.thumbnail_url)}"` : ""}></video>
      </div>`,
      footer: `<div class="flex w-full items-center justify-between gap-3">
        <a class="btn-ghost btn-xs" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${icon("external", "h-4 w-4")} Open original</a>
        <a class="btn-secondary btn-xs" href="${escapeHtml(item.url)}" download>${icon("download", "h-4 w-4")} Download</a>
      </div>`,
    });
  }

  function render() {
    count.textContent = `${items.length} ${meta.noun}${items.length === 1 ? "" : "s"} in recent history and the media folder`;
    if (!items.length) {
      grid.innerHTML = `<div class="card">${emptyState(`No ${kind} yet`, meta.empty, meta.icon)}</div>`;
      return;
    }

    if (kind === "images") {
      grid.innerHTML = `<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
        ${items
          .map(
            (item, index) => `
            <div class="relative rounded-2xl transition" data-selectable>
              <button class="gallery-tile group block aspect-square w-full text-left" data-image="${index}" title="${escapeHtml(itemLabel(item))}">
                <img src="${escapeHtml(item.thumbnail_url || item.url)}" data-full-src="${escapeHtml(item.url)}" alt="${escapeHtml(itemLabel(item))}" loading="lazy" class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                <span class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent p-3 opacity-0 transition group-hover:opacity-100">
                  <span class="block truncate text-[11px] font-medium text-white">${escapeHtml(itemLabel(item))}</span>
                  ${promptLabel(item) ? `<span class="mt-0.5 line-clamp-2 text-[10px] leading-4 text-white/60">${escapeHtml(promptLabel(item))}</span>` : ""}
                </span>
              </button>
              ${sourceBadge(item, "absolute left-2 top-2 z-10")}
              ${selectionControl(index, item)}
            </div>
          `,
          )
          .join("")}
      </div>`;
      grid.querySelectorAll("[data-image]").forEach((button) => {
        button.addEventListener("click", () => openLightbox(items[Number(button.dataset.image)]));
      });
      grid.querySelectorAll("img[data-full-src]").forEach((image) => {
        image.addEventListener("error", () => {
          const fallback = image.dataset.fullSrc;
          if (fallback && image.getAttribute("src") !== fallback) {
            image.src = fallback;
          } else {
            image.hidden = true;
          }
        });
      });
      wireSelection();
      return;
    }

    if (kind === "audio") {
      grid.innerHTML = `<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        ${items
          .map(
            (item, index) => `
            <div class="card-soft p-4 transition" data-selectable>
              <div class="mb-3 flex items-center gap-3">
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">${icon("music", "h-4 w-4")}</span>
                <div class="min-w-0">
                  <p class="truncate text-xs font-semibold text-slate-200">${escapeHtml(itemLabel(item))}</p>
                  <p class="truncate text-[11px] text-slate-500">${escapeHtml(promptLabel(item) || sourceLabel(item, "Generated audio"))}</p>
                </div>
                ${sourceBadge(item, "ml-auto shrink-0")}
              </div>
              <audio class="w-full" controls preload="none" src="${escapeHtml(item.url)}"></audio>
              <div class="mt-3 flex items-center justify-between gap-3">
                <a class="btn-ghost btn-xs" href="${escapeHtml(item.url)}" download>${icon("download", "h-4 w-4")} Download</a>
                <label class="flex cursor-pointer items-center gap-2 text-[11px] text-slate-500" title="Select ${escapeHtml(itemLabel(item))}">
                  <span>Select</span>
                  <input type="checkbox" class="h-4 w-4 cursor-pointer rounded border-white/30 bg-transparent accent-accent-500" data-select-item="${index}" ${selected.has(itemKey(item)) ? "checked" : ""} aria-label="Select ${escapeHtml(itemLabel(item))}" />
                </label>
              </div>
            </div>
          `,
          )
          .join("")}
      </div>`;
      wireSelection();
      return;
    }

    grid.innerHTML = `<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      ${items
        .map(
          (item, index) => `
          <div class="relative rounded-2xl transition" data-selectable>
            <button class="gallery-tile group block aspect-square w-full text-left" data-video="${index}" title="${escapeHtml(itemLabel(item))}">
              <span class="absolute inset-0 flex items-center justify-center text-slate-600">${icon("film", "h-8 w-8")}</span>
              ${
                item.thumbnail_url
                  ? `<img src="${escapeHtml(item.thumbnail_url)}" data-thumbnail alt="${escapeHtml(itemLabel(item))}" loading="lazy" class="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />`
                  : ""
              }
              <span class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10 transition group-hover:bg-black/25">
                <span class="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm">
                  ${icon("play", "h-5 w-5")}
                </span>
              </span>
              <span class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent p-3 opacity-0 transition group-hover:opacity-100">
                <span class="block truncate text-[11px] font-medium text-white">${escapeHtml(itemLabel(item))}</span>
                ${promptLabel(item) ? `<span class="mt-0.5 line-clamp-2 text-[10px] leading-4 text-white/60">${escapeHtml(promptLabel(item))}</span>` : ""}
              </span>
            </button>
            ${sourceBadge(item, "absolute left-2 top-2 z-10")}
            ${selectionControl(index, item)}
          </div>
        `,
        )
        .join("")}
    </div>`;
    grid.querySelectorAll("[data-video]").forEach((button) => {
      button.addEventListener("click", () => openVideo(items[Number(button.dataset.video)]));
    });
    grid.querySelectorAll("img[data-thumbnail]").forEach((image) => {
      image.addEventListener("error", () => image.remove());
    });
    wireSelection();
  }

  async function moveSelected() {
    if (loading) return;
    const chosen = items.filter((item) => selected.has(itemKey(item)));
    const movable = chosen.filter(
      (item) => item.type !== "local" && item.prompt_id,
    );
    const localCount = chosen.length - movable.length;
    if (!movable.length) return;

    const promptIds = new Set(movable.map((item) => item.prompt_id));
    let message = `Move ${movable.length} selected item${movable.length === 1 ? "" : "s"} to the media folder? This copies all outputs from ${promptIds.size} ComfyUI generation${promptIds.size === 1 ? "" : "s"} and removes those history entries.`;
    if (localCount) {
      message += ` ${localCount} local item${localCount === 1 ? "" : "s"} in the selection are already in the media folder and will be left untouched.`;
    }

    const okay = await confirmDialog(message, {
      title: "Move selected media?",
      confirmLabel: "Move",
    });
    if (!okay) return;

    moveButton.disabled = true;
    moveButton.innerHTML = `${spinner("h-4 w-4")} Moving…`;
    try {
      const result = await api("/api/gallery/move", {
        method: "POST",
        body: {
          items: movable.map((item) => ({
            filename: item.filename,
            subfolder: item.subfolder || "",
            type: item.type || "",
            prompt_id: item.prompt_id,
          })),
        },
      });
      const parts = [];
      if (result?.moved) {
        parts.push(`${result.moved} file${result.moved === 1 ? "" : "s"} moved`);
      }
      if (result?.deleted_history) {
        parts.push(`${result.deleted_history} history entr${result.deleted_history === 1 ? "y" : "ies"} removed`);
      }
      if (result?.failed) {
        parts.push(`${result.failed} entr${result.failed === 1 ? "y" : "ies"} could not be completed`);
      }
      toast(
        parts.length ? `${parts.join(", ")}.` : "Move complete.",
        result?.failed ? "warning" : "success",
      );
      selected.clear();
      await load();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      moveButton.disabled = loading || selected.size === 0;
      updateSelection();
    }
  }

  async function deleteSelected() {
    if (loading || !selected.size) return;
    const chosen = items.filter((item) => selected.has(itemKey(item)));
    if (!chosen.length) {
      selected.clear();
      updateSelection();
      return;
    }

    const promptIds = new Set(
      chosen.filter((item) => item.prompt_id).map((item) => item.prompt_id),
    );
    const localCount = chosen.filter((item) => item.type === "local").length;
    let message = `Delete ${chosen.length} selected item${chosen.length === 1 ? "" : "s"}?`;
    if (promptIds.size) {
      message += ` This removes ${promptIds.size} ComfyUI history ${promptIds.size === 1 ? "entry" : "entries"}; all outputs from those entries are removed.`;
    }
    if (localCount) {
      message += ` ${localCount} local media file${localCount === 1 ? "" : "s"} will be permanently deleted from the media folder.`;
    }

    const okay = await confirmDialog(message, {
      title: "Delete selected media?",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!okay) return;

    deleteButton.disabled = true;
    deleteButton.innerHTML = `${spinner("h-4 w-4")} Deleting…`;
    try {
      const result = await api("/api/gallery/delete", {
        method: "POST",
        body: {
          items: chosen.map((item) => ({
            filename: item.filename,
            subfolder: item.subfolder || "",
            type: item.type || "",
            prompt_id: item.prompt_id || "",
          })),
        },
      });
      const parts = [];
      if (result?.deleted_history) {
        parts.push(`${result.deleted_history} history ${result.deleted_history === 1 ? "entry" : "entries"}`);
      }
      if (result?.deleted_local) {
        parts.push(`${result.deleted_local} local ${result.deleted_local === 1 ? "file" : "files"}`);
      }
      toast(parts.length ? `Deleted ${parts.join(" and ")}.` : "Deleted selected items.", "success");
      selected.clear();
      await load();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      deleteButton.disabled = loading || selected.size === 0;
      updateSelection();
    }
  }

  async function load() {
    if (loading) return;
    loading = true;
    selected.clear();
    updateSelection();
    refreshButton.disabled = true;
    refreshButton.innerHTML = `${spinner("h-4 w-4")} Loading`;
    grid.innerHTML = skeleton();
    try {
      const data = await api(`${meta.endpoint}?limit=300`);
      items = data.items || [];
      render();
    } catch (error) {
      grid.innerHTML = `<div class="card p-6 text-center">
        <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-300">${icon("alert", "h-6 w-6")}</div>
        <p class="text-sm font-semibold text-slate-100">Could not load ${kind}</p>
        <p class="mx-auto mt-2 max-w-lg whitespace-pre-wrap text-xs leading-5 text-slate-400">${escapeHtml(error.message)}</p>
        <button class="btn-secondary btn-xs mt-4" data-retry>Try again</button>
      </div>`;
      grid.querySelector("[data-retry]")?.addEventListener("click", load);
      toast(error.message, "error");
    } finally {
      loading = false;
      refreshButton.disabled = false;
      refreshButton.innerHTML = `${icon("refresh", "h-4 w-4")} Refresh`;
      updateSelection();
    }
  }

  refreshButton.addEventListener("click", load);
  moveButton.addEventListener("click", moveSelected);
  deleteButton.addEventListener("click", deleteSelected);
  await load();

  return () => {};
}
