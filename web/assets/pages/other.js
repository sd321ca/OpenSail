import { api } from "../api.js";
import { confirmDialog, icon, setButtonBusy, toast } from "../ui.js";

export async function renderOther(root) {
  root.innerHTML = `
    <div class="mx-auto max-w-2xl space-y-5">
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
    </div>
  `;

  const button = root.querySelector("[data-clear]");

  button.addEventListener("click", async () => {
    const okay = await confirmDialog(
      "This removes every entry from ComfyUI's generation history. Generated files on disk are not deleted.",
      {
        title: "Clear history?",
        confirmLabel: "Clear History",
        danger: true,
      },
    );
    if (!okay) return;

    setButtonBusy(button, true, "Clearing…");
    try {
      const result = await api("/history", { method: "POST" });
      toast(result?.status || "History cleared.", "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });

  return () => {};
}
