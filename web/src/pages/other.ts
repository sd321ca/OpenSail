import { api, errorText } from "../api";
import { confirmDialog, icon, setButtonBusy, toast } from "../ui";

interface PostActionOptions {
  busyLabel: string;
  successMessage: string;
  confirm?: {
    message: string;
    options?: { title?: string; confirmLabel?: string; danger?: boolean };
  };
  body?: unknown;
}

export async function renderOther(root: HTMLElement): Promise<() => void> {
  root.innerHTML = `
    <div class="mx-auto max-w-2xl space-y-5">
      <section class="card">
        <div class="card-header">
          <div class="flex items-center gap-2.5">
            <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-300">${icon("cpu", "h-4 w-4")}</span>
            <div>
              <h2 class="card-title">Memory</h2>
              <p class="card-subtitle">Unload ComfyUI models and reclaim VRAM and RAM</p>
            </div>
          </div>
        </div>
        <div class="space-y-4 p-4 sm:p-5">
          <p class="rounded-xl border border-subtle bg-raised p-3 text-xs leading-5 text-slate-500">
            Ask ComfyUI to unload its loaded models or free cached memory. The next generation reloads the models automatically.
          </p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-secondary" data-unload-models>${icon("cpu", "h-4 w-4")} Unload Models</button>
            <button type="button" class="btn-secondary" data-free-memory>${icon("sparkles", "h-4 w-4")} Free Memory</button>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <div class="flex items-center gap-2.5">
            <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-300">${icon("trash", "h-4 w-4")}</span>
            <div>
              <h2 class="card-title">History</h2>
              <p class="card-subtitle">Manage the generation history recorded by ComfyUI</p>
            </div>
          </div>
        </div>
        <div class="space-y-4 p-4 sm:p-5">
          <div class="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs leading-5 text-rose-200">
            Clearing the history removes every recorded generation and empties the image, audio and video galleries. Generated files already saved on disk are not deleted.
          </div>
          <button type="button" class="btn-danger" data-clear>${icon("trash", "h-4 w-4")} Clear History</button>
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <div class="flex items-center gap-2.5">
            <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-300">${icon("folder", "h-4 w-4")}</span>
            <div>
              <h2 class="card-title">ComfyUI Generations</h2>
              <p class="card-subtitle">Delete media files saved by ComfyUI</p>
            </div>
          </div>
        </div>
        <div class="space-y-4 p-4 sm:p-5">
          <div class="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs leading-5 text-rose-200">
            This permanently deletes every file in ComfyUI's <span class="font-mono">output</span>, <span class="font-mono">input</span> and <span class="font-mono">temp</span> folders, including generated media and uploaded inputs. The dashboard's <span class="font-mono">media/</span> folder and saved workflows are not touched. Gallery history entries may remain until you also clear the history.
          </div>
          <button type="button" class="btn-danger" data-clear-media>${icon("trash", "h-4 w-4")} Clear ComfyUI Generations</button>
        </div>
      </section>
    </div>
  `;

  async function postAction(
    button: HTMLElement,
    path: string,
    { busyLabel, successMessage, confirm, body }: PostActionOptions,
  ): Promise<void> {
    if (confirm) {
      const okay = await confirmDialog(confirm.message, confirm.options);
      if (!okay) return;
    }

    setButtonBusy(button, true, busyLabel);
    try {
      const result = await api<{ status?: string }>(path, { method: "POST", body });
      toast(result?.status || successMessage, "success");
    } catch (error) {
      toast(errorText(error), "error");
    } finally {
      setButtonBusy(button, false);
    }
  }

  const unloadButton = root.querySelector<HTMLElement>("[data-unload-models]");
  unloadButton?.addEventListener("click", () => {
    void postAction(unloadButton, "/free", {
      busyLabel: "Unloading…",
      successMessage: "Models unloaded.",
      body: { unload_models: true, free_memory: false },
    });
  });

  const freeButton = root.querySelector<HTMLElement>("[data-free-memory]");
  freeButton?.addEventListener("click", () => {
    void postAction(freeButton, "/free", {
      busyLabel: "Freeing…",
      successMessage: "Memory freed.",
      body: { unload_models: false, free_memory: true },
    });
  });

  const clearButton = root.querySelector<HTMLElement>("[data-clear]");
  clearButton?.addEventListener("click", () => {
    void postAction(clearButton, "/history", {
      busyLabel: "Clearing…",
      successMessage: "History cleared.",
      confirm: {
        message:
          "This removes every entry from ComfyUI's generation history. Generated files on disk are not deleted.",
        options: {
          title: "Clear history?",
          confirmLabel: "Clear History",
          danger: true,
        },
      },
    });
  });

  const clearMediaButton = root.querySelector<HTMLElement>("[data-clear-media]");
  clearMediaButton?.addEventListener("click", () => {
    void postAction(clearMediaButton, "/api/comfy/media/clear", {
      busyLabel: "Deleting…",
      successMessage: "ComfyUI media deleted.",
      confirm: {
        message:
          "This permanently deletes every file in ComfyUI's output, input and temp folders, including generated media and uploaded inputs. The media/ folder and saved workflows are not touched.",
        options: {
          title: "Clear ComfyUI generations?",
          confirmLabel: "Clear Generations",
          danger: true,
        },
      },
    });
  });

  return () => {};
}
