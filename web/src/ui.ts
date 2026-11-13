/** Shared UI helpers: escaping, icons, Markdown, modals and toasts. */

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const ICONS = {
  generate: '<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3.5"/>',
  chat: '<path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.5-5.6A8.5 8.5 0 1 1 21 12Z"/><path d="M8 11h8M8 15h5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 16-4.5-4.5L7 21"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  upload: '<path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/>',
  gallery: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m21 16-5-5L7 21"/><circle cx="8.5" cy="9.5" r="1.4"/>',
  trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 13H8L7 7"/><path d="M10 11v5m4-5v5"/>',
  pencil: '<path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m13.5 7.5 3 3"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M2 6h14a2 2 0 0 1 2 2v14"/>',
  scissors: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8.2 7.4 20 18M8.2 16.6 20 6"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  download: '<path d="M12 4v12m0 0 5-5m-5 5-5-5"/><path d="M5 20h14"/>',
  external: '<path d="M14 4h6v6m0-6-9 9"/><path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="m4 4 17 8-17 8 3-8-3-8Z"/><path d="M7 12h14"/>',
  attach: '<path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v3m6-3v3M9 20v3m6-3v3M1 9h3m-3 6h3m16-6h3m-3 6h3"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/>',
  wand: '<path d="m4 20 10-10m-3-3 6 6"/><path d="M15 3v3m0 0v3m0-3h3m-3 0h-3M5 5v2m0 0v2m0-2h2M5 5H3"/>',
  save: '<path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h9V3M7 21v-8h10v8"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  palette: '<path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h4.5A4.5 4.5 0 0 0 21 8.5C21 5.5 17 3 12 3Z"/><circle cx="7.5" cy="10" r="1"/><circle cx="10" cy="6.5" r="1"/><circle cx="14.5" cy="6.5" r="1"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>',
  sparkles: '<path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z"/>',
};

export function icon(name, className = "h-5 w-5") {
  const path = ICONS[name] || ICONS.info;
  return `<svg viewBox="0 0 24 24" class="${className}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export function spinner(className = "h-4 w-4") {
  return `<svg class="${className} animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity=".2" stroke-width="3"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;
}

/* ------------------------------------------------------------------ */
/* Markdown (small, dependency-free subset)                            */
/* ------------------------------------------------------------------ */

function inlineMarkdown(text) {
  let value = escapeHtml(text);
  const codes = [];
  value = value.replace(/`([^`]+)`/g, (_match, code) => {
    const token = `\u0000INLINE${codes.length}\u0000`;
    codes.push(`<code>${code}</code>`);
    return token;
  });
  value = value.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  value = value.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  value = value.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  value = value.replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>");
  value = value.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  value = value.replace(/\u0000INLINE(\d+)\u0000/g, (_match, index) => codes[Number(index)]);
  return value;
}

export function renderMarkdown(source) {
  if (!source) return "";
  const codeBlocks = [];
  let text = String(source).replace(/```([\w+-]*)\r?\n?([\s\S]*?)```/g, (_match, _lang, code) => {
    const token = `\u0000BLOCK${codeBlocks.length}\u0000`;
    codeBlocks.push(`<pre><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`);
    return token;
  });

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let listType = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    const blockMatch = line.match(/^\u0000BLOCK(\d+)\u0000$/);
    if (blockMatch) {
      flushParagraph();
      closeList();
      html.push(codeBlocks[Number(blockMatch[1])]);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      flushParagraph();
      closeList();
      html.push("<hr>");
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      closeList();
      html.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    const listItem = line.match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
    if (listItem) {
      flushParagraph();
      const type = /\d+\./.test(listItem[1]) ? "ol" : "ul";
      if (listType !== type) {
        closeList();
        listType = type;
        html.push(`<${type}>`);
      }
      html.push(`<li>${inlineMarkdown(listItem[2])}</li>`);
      continue;
    }

    closeList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  closeList();
  return html.join("");
}

export function plainText(value) {
  return escapeHtml(value || "").replace(/\n/g, "<br>");
}

/* ------------------------------------------------------------------ */
/* Toasts and modals                                                   */
/* ------------------------------------------------------------------ */

export function toast(message, type = "info", timeout = 4800) {
  const root = document.getElementById("toast-root");
  if (!root) return;
  const styles = {
    info: "border-sky-400/20 bg-sky-400/10 text-sky-100",
    success: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
    warning: "border-amber-400/20 bg-amber-400/10 text-amber-100",
    error: "border-rose-400/20 bg-rose-400/10 text-rose-100",
  };
  const iconNames = { info: "info", success: "check", warning: "alert", error: "alert" };
  const node = document.createElement("div");
  node.className = "toast";
  node.setAttribute("role", type === "error" ? "alert" : "status");
  node.innerHTML = `
    <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${styles[type] || styles.info}">
      ${icon(iconNames[type] || "info", "h-4 w-4")}
    </span>
    <p class="min-w-0 flex-1 whitespace-pre-wrap break-words">${escapeHtml(message)}</p>
    <button class="icon-btn -mr-1 -mt-1 h-7 w-7" aria-label="Dismiss">${icon("close", "h-4 w-4")}</button>
  `;
  const remove = () => {
    node.classList.add("opacity-0", "translate-y-1");
    node.style.transition = "opacity 160ms ease, transform 160ms ease";
    setTimeout(() => node.remove(), 180);
  };
  node.querySelector("button")?.addEventListener("click", remove);
  root.appendChild(node);
  if (timeout) setTimeout(remove, timeout);
}

export function openModal({
  title = "",
  subtitle = "",
  content = "",
  footer = null,
  size = "md",
  onClose = null,
} = {}) {
  const root = document.getElementById("modal-root");
  const wrapper = document.createElement("div");
  wrapper.className = "modal-backdrop";
  wrapper.innerHTML = `
    <div class="modal-panel ${size === "lg" ? "modal-panel-lg" : ""}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="flex shrink-0 items-start gap-3 border-b border-subtle px-4 py-4 sm:px-6">
        <div class="min-w-0 flex-1">
          <h2 class="text-base font-semibold tracking-tight text-slate-100">${escapeHtml(title)}</h2>
          ${subtitle ? `<p class="mt-0.5 text-xs leading-5 text-slate-400">${escapeHtml(subtitle)}</p>` : ""}
        </div>
        <button class="icon-btn -mr-2 h-10 w-10 shrink-0 touch-manipulation sm:h-9 sm:w-9" data-modal-close aria-label="Close">${icon("close")}</button>
      </div>
      <div class="modal-body" data-modal-body></div>
    </div>
  `;
  const panel = wrapper.querySelector(".modal-panel");
  const body = wrapper.querySelector("[data-modal-body]");
  if (content instanceof Node) body.appendChild(content);
  else body.innerHTML = content;

  if (footer) {
    const foot = document.createElement("div");
    foot.className = "flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-subtle bg-ink-900/95 px-4 py-3 sm:px-6";
    if (footer instanceof Node) foot.appendChild(footer);
    else foot.innerHTML = footer;
    panel.appendChild(foot);
  }

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    document.body.classList.remove("overflow-hidden");
    wrapper.remove();
    onClose?.();
  };
  const onKey = (event) => {
    if (event.key === "Escape") close();
  };

  wrapper.querySelector("[data-modal-close]")?.addEventListener("click", close);
  wrapper.addEventListener("mousedown", (event) => {
    if (event.target === wrapper) close();
  });
  document.addEventListener("keydown", onKey);
  document.body.classList.add("overflow-hidden");
  root.appendChild(wrapper);
  setTimeout(() => {
    const focusTarget = wrapper.querySelector("input, textarea, select, button:not([data-modal-close])");
    focusTarget?.focus?.({ preventScroll: true });
  }, 30);
  return { close, element: wrapper, body, panel };
}

export function confirmDialog(message, { title = "Are you sure?", confirmLabel = "Confirm", danger = false } = {}) {
  return new Promise((resolve) => {
    const footer = document.createElement("div");
    footer.className = "flex items-center justify-end gap-2";
    footer.innerHTML = `
      <button class="btn-secondary" data-cancel>Cancel</button>
      <button class="${danger ? "btn-danger" : "btn-primary"}" data-confirm>${escapeHtml(confirmLabel)}</button>
    `;
    let settled = false;
    const modal = openModal({
      title,
      content: `<p class="text-sm leading-6 text-slate-300">${escapeHtml(message)}</p>`,
      footer,
      onClose: () => {
        if (!settled) resolve(false);
      },
    });
    footer.querySelector("[data-cancel]").addEventListener("click", () => {
      settled = true;
      modal.close();
      resolve(false);
    });
    footer.querySelector("[data-confirm]").addEventListener("click", () => {
      settled = true;
      modal.close();
      resolve(true);
    });
  });
}

export function setButtonBusy(button, busy, label = "Working…") {
  if (!button) return;
  if (busy) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `${spinner("h-4 w-4")}<span>${escapeHtml(label)}</span>`;
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }
}

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function debounce(fn, wait = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function emptyState(title, message, iconName = "info") {
  return `
    <div class="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div class="flex h-12 w-12 items-center justify-center rounded-2xl border border-subtle bg-raised text-slate-500">
        ${icon(iconName, "h-6 w-6")}
      </div>
      <div>
        <p class="text-sm font-semibold text-slate-200">${escapeHtml(title)}</p>
        <p class="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">${escapeHtml(message)}</p>
      </div>
    </div>
  `;
}
