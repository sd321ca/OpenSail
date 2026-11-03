() => {
    const SELECTOR = ".slider-readonly [data-testid='number-input']";
    let queued = 0;

    const lock = () => {
        queued = 0;
        document.querySelectorAll(SELECTOR).forEach((input) => {
            if (input.readOnly) return;
            // The box stays visible as a readout of the slider's value, but it
            // cannot be typed into: dragging the slider is the only way to set
            // it. tabIndex keeps keyboard users out; the slider itself stays
            // focusable and arrow keys still work.
            input.readOnly = true;
            input.tabIndex = -1;
            input.setAttribute("aria-readonly", "true");
        });
    };

    // Gradio rebuilds the Generate tab's controls when the workflow or the
    // selected inputs change, so new sliders have to be locked again. Coalesce
    // re-renders into one sweep per frame.
    const schedule = () => {
        if (queued) return;
        queued = requestAnimationFrame(lock);
    };

    lock();
    new MutationObserver(schedule).observe(document.body, {
        childList: true,
        subtree: true,
    });
}
