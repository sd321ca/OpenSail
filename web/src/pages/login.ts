/**
 * Sign-in screen.
 *
 * Households pick their profile from a grid and type a short PIN; offices see
 * a normal password box. Both come from the same ``/api/profiles`` payload, so
 * the screen adapts without a separate household mode.
 */

import { api, errorText } from "../api";
import { icon, setButtonBusy, spinner, toast } from "../ui";
import type { Profile } from "../types";

let overlay: HTMLElement | null = null;

export function openLogin(onSuccess: () => void): void {
  if (overlay) return;

  overlay = document.createElement("div");
  overlay.className =
    "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/95 px-4 py-10 backdrop-blur";
  overlay.innerHTML = `
    <div class="w-full max-w-sm">
      <div class="mb-6 flex items-center gap-3">
        <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-500/15 text-accent-300">
          ${icon("generate", "h-5 w-5")}
        </span>
        <div>
          <p class="text-sm font-semibold text-slate-100">OpenSail</p>
          <p class="text-xs text-slate-500">Sign in to continue</p>
        </div>
      </div>
      <div id="login-body" class="card p-5">
        <div class="flex justify-center py-6">${spinner("h-6 w-6")}</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const body = overlay.querySelector<HTMLElement>("#login-body");
  if (body) void loadProfiles(body, onSuccess);
}

function close(onSuccess: () => void): void {
  overlay?.remove();
  overlay = null;
  onSuccess();
}

async function loadProfiles(body: HTMLElement, onSuccess: () => void): Promise<void> {
  try {
    const data = await api<{ profiles: Profile[] }>("/api/profiles");
    renderPicker(body, data.profiles, onSuccess);
  } catch {
    // Accounts may not be active (community edition, or a first run where the
    // profile list is unavailable). Fall back to a plain sign-in form.
    renderForm(body, "", null, onSuccess);
  }
}

function renderPicker(
  body: HTMLElement,
  profiles: Profile[],
  onSuccess: () => void,
): void {
  if (!profiles.length) {
    renderForm(body, "", null, onSuccess);
    return;
  }

  body.innerHTML = `
    <p class="mb-4 text-sm font-medium text-slate-200">Who's using OpenSail?</p>
    <div class="space-y-2">
      ${profiles
        .map(
          (profile, index) => `
        <button class="flex w-full items-center gap-3 rounded-xl border border-subtle bg-raised px-3 py-2.5 text-left transition hover:border-strong" data-profile="${index}">
          <span class="flex h-8 w-8 items-center justify-center rounded-full bg-accent-500/15 text-xs font-semibold text-accent-300">
            ${profile.username.slice(0, 1).toUpperCase()}
          </span>
          <span class="min-w-0 flex-1 truncate text-sm text-slate-200">${profile.username}</span>
          ${profile.has_pin ? '<span class="text-[11px] text-slate-500">PIN</span>' : ""}
          ${profile.has_password ? '<span class="text-[11px] text-slate-500">Password</span>' : ""}
        </button>
      `,
        )
        .join("")}
    </div>
    <button id="login-other" class="mt-4 text-xs text-slate-500 hover:text-slate-300">Sign in with another name</button>
  `;

  body.querySelectorAll<HTMLButtonElement>("[data-profile]").forEach((button) => {
    button.addEventListener("click", () => {
      const profile = profiles[Number(button.dataset.profile)] ?? null;
      renderForm(body, profile?.username ?? "", profile, onSuccess);
    });
  });
  body.querySelector("#login-other")?.addEventListener("click", () => {
    renderForm(body, "", null, onSuccess);
  });
}

function renderForm(
  body: HTMLElement,
  username: string,
  profile: Profile | null,
  onSuccess: () => void,
): void {
  const usesPin = Boolean(profile && !profile.has_password && profile.has_pin);
  const secretLabel = usesPin ? "PIN" : "Password";

  body.innerHTML = `
    <form id="login-form" class="space-y-3">
      <div class="flex items-center justify-between">
        <p class="text-sm font-medium text-slate-200">${profile ? `Sign in as ${profile.username}` : "Sign in"}</p>
        ${profile ? '<button type="button" id="login-back" class="text-xs text-slate-500 hover:text-slate-300">Change</button>' : ""}
      </div>
      ${
        profile
          ? `<input type="hidden" name="username" value="${profile.username}" />`
          : `<label class="block text-xs font-medium text-slate-400">Name
               <input name="username" autocomplete="username" required
                      class="mt-1 w-full rounded-lg border border-subtle bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent-400" />
             </label>`
      }
      <label class="block text-xs font-medium text-slate-400">${secretLabel}
        <input name="secret" type="password" required autocomplete="current-password" inputmode="${usesPin ? "numeric" : "text"}"
               class="mt-1 w-full rounded-lg border border-subtle bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent-400" />
      </label>
      <p id="login-error" class="hidden text-xs text-rose-300"></p>
      <button type="submit" class="btn-primary w-full">Sign in</button>
    </form>
  `;

  body.querySelector("#login-back")?.addEventListener("click", () => {
    void loadProfiles(body, onSuccess);
  });

  const form = body.querySelector<HTMLFormElement>("#login-form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const data = new FormData(form);
    const name = String(data.get("username") || "").trim();
    const secret = String(data.get("secret") || "");
    const errorEl = body.querySelector<HTMLElement>("#login-error");
    setButtonBusy(submit, true, "Signing in…");
    try {
      await api("/api/login", {
        method: "POST",
        body: { username: name, secret },
      });
      close(onSuccess);
    } catch (error) {
      if (errorEl) {
        errorEl.textContent = errorText(error);
        errorEl.classList.remove("hidden");
      }
      setButtonBusy(submit, false);
      toast(errorText(error), "error");
    }
  });

  const secretInput = form?.querySelector<HTMLInputElement>('input[name="secret"]');
  secretInput?.focus();
}
