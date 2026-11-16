/** User management: create, disable and remove profiles. */

import { api, errorText } from "../api";
import { setButtonBusy, toast } from "../ui";
import type { RenderContext, UserAccount } from "../types";

interface UsersResponse {
  users: UserAccount[];
  count: number;
}

export async function renderUsers(
  root: HTMLElement,
  ctx: RenderContext,
): Promise<void> {
  const seats = ctx.boot?.licence?.seats ?? 0;
  const unlimited = Boolean(ctx.boot?.licence?.unlimited);

  root.innerHTML = `
    <div class="space-y-4">
      <div class="card flex flex-wrap items-center gap-3 p-4">
        <div class="min-w-0">
          <p class="text-sm font-medium text-slate-200">Profiles on this installation</p>
          <p id="seat-note" class="text-xs text-slate-500">Loading…</p>
        </div>
        <button id="add-user" class="btn-primary ml-auto" type="button">Add profile</button>
      </div>
      <div id="users-list" class="space-y-2"></div>
      <form id="user-form" class="card hidden space-y-3 p-4"></form>
    </div>
  `;

  const list = root.querySelector<HTMLElement>("#users-list");
  const note = root.querySelector<HTMLElement>("#seat-note");
  const form = root.querySelector<HTMLFormElement>("#user-form");
  const addButton = root.querySelector<HTMLButtonElement>("#add-user");
  if (!list || !note || !form || !addButton) return;
  const listEl = list;
  const noteEl = note;

  async function refresh(): Promise<void> {
    try {
      const data = await api<UsersResponse>("/api/users");
      noteEl.textContent = unlimited
        ? `${data.count} profile${data.count === 1 ? "" : "s"} · unlimited seats`
        : seats
          ? `${data.count} of ${seats} licensed user${seats === 1 ? "" : "s"} used`
          : `${data.count} profile${data.count === 1 ? "" : "s"}`;
      renderRows(listEl, data.users, refresh);
    } catch (error) {
      listEl.innerHTML = `<div class="card p-4 text-sm text-rose-300">${errorText(error)}</div>`;
    }
  }

  addButton.addEventListener("click", () => {
    const open = form.classList.toggle("hidden") === false;
    addButton.textContent = open ? "Cancel" : "Add profile";
    if (!open) return;
    form.innerHTML = `
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block text-xs font-medium text-slate-400">Name
          <input name="username" required class="mt-1 w-full rounded-lg border border-subtle bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent-400" />
        </label>
        <label class="block text-xs font-medium text-slate-400">Password (optional)
          <input name="password" type="password" class="mt-1 w-full rounded-lg border border-subtle bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent-400" />
        </label>
        <label class="block text-xs font-medium text-slate-400">PIN (optional)
          <input name="pin" inputmode="numeric" class="mt-1 w-full rounded-lg border border-subtle bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent-400" />
        </label>
        <label class="flex items-center gap-2 self-end text-xs text-slate-400">
          <input name="is_admin" type="checkbox" />
          Administrator
        </label>
      </div>
      <p class="text-xs text-slate-500">Set a password for an office, or a PIN for a quick profile switch at home.</p>
      <button type="submit" class="btn-primary">Create profile</button>
    `;
    form.onsubmit = async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      setButtonBusy(submit, true, "Creating…");
      try {
        await api("/api/users", {
          method: "POST",
          body: {
            username: String(data.get("username") || "").trim(),
            password: String(data.get("password") || ""),
            pin: String(data.get("pin") || ""),
            is_admin: data.get("is_admin") === "on",
          },
        });
        toast("Profile created.", "success");
        form.classList.add("hidden");
        addButton.textContent = "Add profile";
        await refresh();
      } catch (error) {
        toast(errorText(error), "error");
        setButtonBusy(submit, false);
      }
    };
  });

  await refresh();
}

function renderRows(
  list: HTMLElement,
  users: UserAccount[],
  refresh: () => Promise<void>,
): void {
  list.innerHTML = users
    .map(
      (user) => `
      <div class="card flex flex-wrap items-center gap-3 p-3">
        <span class="flex h-9 w-9 items-center justify-center rounded-full bg-accent-500/15 text-xs font-semibold text-accent-300">
          ${user.username.slice(0, 1).toUpperCase()}
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm text-slate-200">${user.username}
            ${user.is_admin ? '<span class="ml-1 text-[11px] text-accent-300">admin</span>' : ""}
            ${user.disabled ? '<span class="ml-1 text-[11px] text-rose-300">disabled</span>' : ""}
          </p>
          <p class="text-[11px] text-slate-500">
            ${user.has_password ? "Password" : ""}${user.has_password && user.has_pin ? " · " : ""}${user.has_pin ? "PIN" : ""}
          </p>
        </div>
        <button class="btn-ghost text-xs" data-toggle="${user.id}">${user.disabled ? "Enable" : "Disable"}</button>
        <button class="btn-ghost text-xs text-rose-300" data-delete="${user.id}">Remove</button>
      </div>
    `,
    )
    .join("");

  list.querySelectorAll<HTMLButtonElement>("[data-toggle]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api("/api/users/disabled", {
          method: "POST",
          body: { user_id: Number(button.dataset.toggle) },
        });
        await refresh();
      } catch (error) {
        toast(errorText(error), "error");
      }
    });
  });

  list.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!window.confirm("Remove this profile? Their files stay on disk.")) return;
      try {
        await api("/api/users/delete", {
          method: "POST",
          body: { user_id: Number(button.dataset.delete) },
        });
        await refresh();
      } catch (error) {
        toast(errorText(error), "error");
      }
    });
  });
}
