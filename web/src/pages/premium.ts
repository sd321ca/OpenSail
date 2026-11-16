/**
 * Licence status and activation, preceded by the upgrade pitch until a licence
 * is installed. The page itself is always present; only its content changes:
 * a valid licence shows who it belongs to and a replace form, and no licence
 * shows the upgrade pitch above the activation form.
 */

import { api, errorText } from "../api";
import { setButtonBusy, toast } from "../ui";
import type { RenderContext } from "../types";

/**
 * Checkout page for licence sales. Left blank until the store is live, in
 * which case the price card shows "Coming soon" instead of a checkout button.
 */
const PURCHASE_URL = "";

/** The store sells one product: lifetime access with unlimited seats. */
const PRICE = "$9.99";

const FEATURES = [
  "A profile for everyone on the machine, with private presets, voices and galleries",
  "Sign in with a password, or a short PIN for a quick profile switch at home",
  "A fair place in line on the shared GPU, with your own cancellable job",
  "Admin controls: add people, reset a PIN and disable a profile",
];

/**
 * What Premium adds and what it costs. Shown whenever no licence is installed,
 * so the upgrade path is in front of anyone still on the community edition.
 */
function upgradeSections(): string {
  return `
      <div class="card p-5">
        <p class="text-xs font-medium uppercase tracking-wider text-accent-300">OpenSail Premium</p>
        <h2 class="mt-2 text-lg font-semibold text-slate-100">Everyone on this machine gets their own OpenSail.</h2>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          The community edition is for one person. Premium adds accounts, so a
          household or a small team can share one GPU without sharing one
          identity.
        </p>
        <ul class="mt-4 space-y-2 text-sm text-slate-300">
          ${FEATURES.map(
            (feature) => `
            <li class="flex gap-2">
              <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400"></span>
              <span>${feature}</span>
            </li>`,
          ).join("")}
        </ul>
      </div>

      <div class="card p-5">
        <p class="text-sm font-medium text-slate-200">One payment. Everyone included.</p>
        <p class="mt-1 text-xs text-slate-500">
          A lifetime licence with unlimited seats. No subscription, no expiry,
          all future updates included.
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-subtle bg-raised p-4">
          <div>
            <p class="text-xs text-slate-500">OpenSail Premium</p>
            <p class="mt-1 text-2xl font-semibold text-slate-100">${PRICE}</p>
          </div>
          <p class="text-xs text-slate-500">Lifetime access · Unlimited people</p>
          ${
            PURCHASE_URL
              ? `<a class="btn-primary sm:ml-auto" href="${PURCHASE_URL}" target="_blank" rel="noopener noreferrer">Get a licence</a>`
              : `<span class="chip sm:ml-auto">Coming soon</span>`
          }
        </div>
      </div>
  `;
}

export async function renderPremium(
  root: HTMLElement,
  ctx: RenderContext,
): Promise<void> {
  const licence = ctx.boot?.licence;
  const valid = Boolean(licence?.valid);

  root.innerHTML = `
    <div class="space-y-4">
      <div class="card p-5">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium text-slate-200">OpenSail Premium</p>
            <p class="text-xs text-slate-500">${
              valid
                ? `Licensed to ${licence?.holder || "you"} · ${licence?.unlimited ? "Unlimited users" : `${licence?.seats ?? 0} user${licence?.seats === 1 ? "" : "s"}`} · bought ${licence?.issued || "—"}`
                : "No licence installed — this installation runs as the community edition."
            }</p>
          </div>
          <span class="chip ${valid ? "chip-success" : "chip-warn"}">
            ${valid ? "Active" : "Community"}
          </span>
        </div>
        ${!valid && licence?.installed ? `<p class="mt-3 text-xs text-slate-400">${licence.reason}</p>` : ""}
      </div>

      ${valid ? "" : upgradeSections()}

      <form id="licence-form" class="card space-y-3 p-5">
        <p class="text-sm font-medium text-slate-200">${valid ? "Replace licence" : "Already have a licence? Activate it here"}</p>
        <label class="block text-xs font-medium text-slate-400">Licence key
          <input name="key" type="text" required spellcheck="false" autocomplete="off"
            class="mt-1 w-full rounded-lg border border-subtle bg-ink-900 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-accent-400"
            placeholder="Enter your LemonSqueezy licence key" />
        </label>
        <div id="admin-fields" class="${valid ? "hidden" : ""} grid gap-3 sm:grid-cols-2">
          <label class="block text-xs font-medium text-slate-400">Administrator name
            <input name="username" class="mt-1 w-full rounded-lg border border-subtle bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent-400" />
          </label>
          <label class="block text-xs font-medium text-slate-400">Administrator password
            <input name="password" type="password" class="mt-1 w-full rounded-lg border border-subtle bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent-400" />
          </label>
        </div>
        <button type="submit" class="btn-primary">${valid ? "Replace licence" : "Activate"}</button>
        <p class="text-xs text-slate-500">Your licence key is validated with LemonSqueezy and stored locally to enable Premium.</p>
      </form>
    </div>
  `;

  const form = root.querySelector<HTMLFormElement>("#licence-form");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const submit = form.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    setButtonBusy(submit, true, "Activating…");
    try {
      const result = await api<{ admin_created: boolean }>("/api/licence", {
        method: "POST",
        body: {
          key: String(data.get("key") || ""),
          username: String(data.get("username") || ""),
          password: String(data.get("password") || ""),
        },
      });
      toast(
        result.admin_created
          ? "Licence activated. Reloading to sign in as your administrator."
          : "Licence updated.",
        "success",
      );
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      toast(errorText(error), "error");
      setButtonBusy(submit, false);
    }
  });
}
