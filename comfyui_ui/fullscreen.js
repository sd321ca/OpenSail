() => {
    const CLASS = "fullscreen-text";
    const OPEN = "fullscreen-text-open";
    // Ignore a focus that arrives right after closing. Some mobile browsers
    // re-focus the textarea once the Done button disappears, which would
    // otherwise reopen the editor the moment it was dismissed.
    const SETTLE_MS = 400;
    let open = null;
    let closedAt = 0;

    const root = document.documentElement;
    const viewport = () => window.visualViewport || null;
    // Phones and other touch devices, including ones wide in landscape.
    const isPhone = () =>
        window.matchMedia("(max-width: 900px)").matches ||
        window.matchMedia("(pointer: coarse)").matches;

    const layout = () => {
        if (!open) return;
        const port = viewport();
        const top = port ? port.offsetTop : 0;
        const height = port ? port.height : window.innerHeight;
        root.style.setProperty("--fullscreen-top", (top + 8) + "px");
        root.style.setProperty(
            "--fullscreen-height", Math.max(140, height - 16) + "px"
        );
    };

    const close = () => {
        if (!open) return;
        const { area, done, height, overflow } = open;
        open = null;
        closedAt = Date.now();
        area.classList.remove(OPEN);
        root.style.removeProperty("--fullscreen-top");
        root.style.removeProperty("--fullscreen-height");
        document.body.style.overflow = overflow;
        if (done) done.remove();
        // Gradio auto-grows the textarea by writing an inline height, and while
        // the editor is full-screen that measurement sees the overlay instead
        // of the inline field. Put the pre-open height back, then let it grow
        // only if the text really needs more room now.
        if (height) area.style.height = height;
        else area.style.removeProperty("height");
        if (area.scrollHeight > area.clientHeight + 1) {
            area.style.height = area.scrollHeight + "px";
        }
        const port = viewport();
        if (port) {
            port.removeEventListener("resize", layout);
            port.removeEventListener("scroll", layout);
        }
        window.removeEventListener("resize", layout);
    };

    const openFullscreen = (area) => {
        if (open || !isPhone()) return;
        if (Date.now() - closedAt < SETTLE_MS) return;
        open = {
            area,
            done: null,
            // Gradio's own inline height, restored when the editor closes.
            height: area.style.height,
            overflow: document.body.style.overflow,
        };
        document.body.style.overflow = "hidden";

        const done = document.createElement("button");
        done.type = "button";
        done.className = "fullscreen-text-done";
        done.textContent = "Done";
        // Keep focus on the textarea while the button is pressed, so the
        // keyboard does not close before the click lands.
        done.addEventListener("mousedown", (e) => e.preventDefault());
        // Close directly rather than waiting for the focusout that blur() is
        // supposed to fire: some mobile keyboards drop focus silently, and
        // then the editor would never be dismissed.
        done.addEventListener("click", () => {
            area.blur();
            close();
        });
        document.body.appendChild(done);
        open.done = done;

        area.classList.add(OPEN);
        layout();
        const port = viewport();
        if (port) {
            port.addEventListener("resize", layout);
            port.addEventListener("scroll", layout);
        }
        window.addEventListener("resize", layout);
    };

    // Delegated, because Gradio re-renders the inputs when switching workflows.
    document.addEventListener("focusin", (event) => {
        const area = event.target;
        if (!(area instanceof HTMLTextAreaElement)) return;
        if (!area.closest("." + CLASS)) return;
        openFullscreen(area);
    });

    document.addEventListener("focusout", (event) => {
        if (open && event.target === open.area) close();
    });

    // Tapping outside the editor dismisses it too, even if focus was already
    // dropped without a focusout (which is what leaves the field stuck open).
    document.addEventListener("pointerdown", (event) => {
        if (!open) return;
        if (open.area.contains(event.target)) return;
        if (open.done && open.done.contains(event.target)) return;
        close();
    }, true);
}
