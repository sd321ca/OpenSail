/** Client-side audio trimming dialog. */

import {
  escapeHtml,
  icon,
  openModal,
  setButtonBusy,
  spinner,
  toast,
} from "./ui.js";

const MIN_DURATION = 0.05;

function formatTime(value) {
  const seconds = Math.max(0, value);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${minutes}:${remainder.toFixed(1).padStart(4, "0")}`;
}

function trimmedName(name) {
  const base = String(name || "audio").replace(/\.[^./\\]+$/, "") || "audio";
  return `${base}-trim.wav`;
}

function writeText(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

/** Encode the selected part of a decoded buffer as 16-bit PCM WAV. */
function encodeWav(buffer, startTime, endTime) {
  const start = Math.max(0, Math.floor(startTime * buffer.sampleRate));
  const end = Math.min(buffer.length, Math.ceil(endTime * buffer.sampleRate));
  const frames = Math.max(1, end - start);
  const channels = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const sampleRate = buffer.sampleRate;
  const blockAlign = channels * 2;
  const dataSize = frames * blockAlign;
  const data = new ArrayBuffer(44 + dataSize);
  const view = new DataView(data);

  writeText(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeText(view, 8, "WAVE");
  writeText(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeText(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const channelData = [];
  for (let channel = 0; channel < channels; channel += 1) {
    channelData.push(buffer.getChannelData(channel));
  }

  let offset = 44;
  for (let frame = start; frame < start + frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(
        -1,
        Math.min(1, channelData[channel][frame] || 0),
      );
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true,
      );
      offset += 2;
    }
  }
  return new Blob([data], { type: "audio/wav" });
}

function waveformPeaks(buffer, width) {
  const channelCount = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const channels = [];
  for (let channel = 0; channel < channelCount; channel += 1) {
    channels.push(buffer.getChannelData(channel));
  }
  const samples = channels[0];
  const perPixel = Math.max(1, Math.floor(samples.length / width));
  const peaks = [];
  for (let pixel = 0; pixel < width; pixel += 1) {
    const start = pixel * perPixel;
    const end = Math.min(samples.length, start + perPixel);
    let minimum = 0;
    let maximum = 0;
    for (let index = start; index < end; index += 1) {
      for (let channel = 0; channel < channels.length; channel += 1) {
        const sample = channels[channel][index];
        if (sample < minimum) minimum = sample;
        if (sample > maximum) maximum = sample;
      }
    }
    peaks.push([minimum, maximum]);
  }
  return peaks;
}

function drawWaveform(canvas, peaks, startRatio, endRatio) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const devicePixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * devicePixelRatio);
  canvas.height = Math.round(height * devicePixelRatio);

  const context = canvas.getContext("2d");
  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  const middle = height / 2;
  const scale = Math.max(1, height / 2 - 2);

  const drawRange = (from, to, color) => {
    context.strokeStyle = color;
    context.beginPath();
    for (let pixel = Math.max(0, from); pixel < to; pixel += 1) {
      const [minimum, maximum] = peaks[pixel] || [0, 0];
      context.moveTo(pixel + 0.5, middle + minimum * scale);
      context.lineTo(pixel + 0.5, middle + maximum * scale);
    }
    context.stroke();
  };

  drawRange(0, width, "rgba(148, 163, 184, 0.42)");
  drawRange(
    Math.round(startRatio * width),
    Math.round(endRatio * width),
    "#818cf8",
  );

  context.strokeStyle = "rgba(148, 163, 184, 0.16)";
  context.beginPath();
  context.moveTo(0, middle + 0.5);
  context.lineTo(width, middle + 0.5);
  context.stroke();
}

/**
 * Open a dialog for trimming uploaded or already uploaded audio.
 *
 * `source` is a File/Blob or a URL. `onApply(file)` receives the original file
 * when the full clip is kept, or a WAV File for the selected range.
 */
export async function openAudioTrimmer({
  source,
  name = "audio",
  title = "Trim audio",
  subtitle = "Choose the part of the clip to keep before uploading.",
  onApply,
}) {
  const isBlob = source instanceof Blob;
  const previewUrl = isBlob ? URL.createObjectURL(source) : source;
  let revokePreview = isBlob;

  let buffer = null;
  let fallbackFile = null;
  let duration = 0;
  let startRange = null;
  let endRange = null;
  let startLabel = null;
  let endLabel = null;
  let shadeLeft = null;
  let shadeRight = null;
  let selection = null;
  let canvas = null;
  let peaks = null;
  let start = 0;
  let end = 0;
  let preview = null;
  let playSelection = false;
  let onResize = null;
  let closed = false;

  const modal = openModal({
    title,
    subtitle,
    size: "lg",
    content: `<div class="flex min-h-40 items-center justify-center text-slate-500">${spinner("h-6 w-6")}</div>`,
    footer: `
      <div class="flex w-full flex-wrap items-center justify-end gap-2">
        <button class="btn-secondary" data-audio-cancel>Cancel</button>
        <button class="btn-primary" data-audio-apply disabled>${icon("check", "h-4 w-4")} Apply trim</button>
      </div>
    `,
    onClose: () => {
      closed = true;
      preview?.pause();
      if (playSelection) playSelection = false;
      if (revokePreview && previewUrl) URL.revokeObjectURL(previewUrl);
      revokePreview = false;
      if (onResize) window.removeEventListener("resize", onResize);
      onResize = null;
    },
  });

  const applyButton = modal.element.querySelector("[data-audio-apply]");
  modal.element
    .querySelector("[data-audio-cancel]")
    ?.addEventListener("click", () => modal.close());

  applyButton?.addEventListener("click", async () => {
    if (!onApply) return;
    setButtonBusy(applyButton, true, "Applying…");
    try {
      let file = null;
      if (!buffer) {
        file = fallbackFile;
      } else {
        const gap = Math.min(MIN_DURATION, duration || MIN_DURATION);
        const selectedStart = Math.max(0, Math.min(start, duration));
        const selectedEnd = Math.min(duration, Math.max(end, selectedStart));
        if (selectedEnd - selectedStart < gap) {
          toast("Choose a longer section to keep.", "warning");
          setButtonBusy(applyButton, false);
          return;
        }
        const keepsEverything =
          selectedStart <= 0.005 && selectedEnd >= duration - 0.005;
        if (keepsEverything && source instanceof File) {
          file = source;
        } else {
          const blob = encodeWav(buffer, selectedStart, selectedEnd);
          file = new File([blob], trimmedName(name), { type: "audio/wav" });
        }
      }
      if (!file) {
        setButtonBusy(applyButton, false);
        return;
      }

      await onApply(file);
      modal.close();
    } catch (error) {
      toast(error?.message || "Could not use the trimmed audio.", "error");
      setButtonBusy(applyButton, false);
    }
  });

  const setFallback = (file, message) => {
    fallbackFile = file;
    modal.body.innerHTML = `
      <div class="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm leading-6 text-rose-200">
        <p class="font-medium">Could not decode this audio for trimming.</p>
        <p class="mt-1 text-xs text-rose-200/80">${escapeHtml(message)}</p>
        ${
          file
            ? `<p class="mt-2 text-xs text-rose-200/80">You can still use the original file without trimming.</p>`
            : `<p class="mt-2 text-xs text-rose-200/80">Choose another file, or use a WAV, MP3, OGG or M4A clip.</p>`
        }
      </div>
    `;
    if (applyButton && file) {
      applyButton.disabled = false;
      applyButton.innerHTML = `${icon("upload", "h-4 w-4")} Use original`;
    }
  };

  try {
    const data = isBlob
      ? await source.arrayBuffer()
      : await (await fetch(source)).arrayBuffer();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("Web Audio is not available in this browser.");
    }
    const context = new AudioContextClass();
    try {
      buffer = await context.decodeAudioData(data);
    } finally {
      context.close?.().catch(() => {});
    }
    duration = buffer.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("The audio file is empty.");
    }
  } catch (error) {
    if (closed) return;
    fallbackFile = isBlob
      ? source instanceof File
        ? source
        : new File([source], name, {
            type: source.type || "application/octet-stream",
          })
      : null;
    setFallback(
      fallbackFile,
      error?.message || "The browser could not read this file.",
    );
    return;
  }

  if (closed) return;

  modal.body.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between gap-3 rounded-xl border border-subtle bg-raised px-3 py-2">
        <span class="min-w-0 truncate text-[11px] text-slate-500">Source: ${escapeHtml(name)}</span>
        <span class="shrink-0 font-mono text-[11px] text-slate-400">${formatTime(duration)}</span>
      </div>
      <audio class="w-full" controls preload="metadata" src="${escapeHtml(previewUrl)}" data-audio-preview></audio>
      <div class="relative overflow-hidden rounded-xl border border-subtle bg-ink-950">
        <canvas class="block h-24 w-full" data-audio-waveform></canvas>
        <div class="pointer-events-none absolute inset-y-0 left-0 bg-black/55" data-shade-left></div>
        <div class="pointer-events-none absolute inset-y-0 right-0 bg-black/55" data-shade-right></div>
        <div class="pointer-events-none absolute inset-y-0 border-x-2 border-accent-400/80" data-audio-selection></div>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="mb-1 flex items-center justify-between text-[11px] text-slate-500"><span>Start</span><span class="font-mono text-slate-300" data-start-label></span></span>
          <input type="range" min="0" step="0.01" class="w-full accent-accent-500" data-start />
        </label>
        <label class="block">
          <span class="mb-1 flex items-center justify-between text-[11px] text-slate-500"><span>End</span><span class="font-mono text-slate-300" data-end-label></span></span>
          <input type="range" min="0" step="0.01" class="w-full accent-accent-500" data-end />
        </label>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="btn-ghost btn-xs" data-play-selection>${icon("play", "h-3.5 w-3.5")} Play selection</button>
        <button type="button" class="btn-ghost btn-xs" data-reset-selection>${icon("refresh", "h-3.5 w-3.5")} Reset</button>
        <span class="ml-auto text-[11px] text-slate-500" data-selection-length></span>
      </div>
    </div>
  `;

  preview = modal.body.querySelector("[data-audio-preview]");
  canvas = modal.body.querySelector("[data-audio-waveform]");
  startRange = modal.body.querySelector("[data-start]");
  endRange = modal.body.querySelector("[data-end]");
  startLabel = modal.body.querySelector("[data-start-label]");
  endLabel = modal.body.querySelector("[data-end-label]");
  shadeLeft = modal.body.querySelector("[data-shade-left]");
  shadeRight = modal.body.querySelector("[data-shade-right]");
  selection = modal.body.querySelector("[data-audio-selection]");
  const lengthLabel = modal.body.querySelector("[data-selection-length]");

  const minimumGap = Math.min(MIN_DURATION, duration);
  startRange.max = String(Math.max(0, duration - minimumGap));
  endRange.max = String(duration);
  startRange.value = "0";
  endRange.value = String(duration);
  start = 0;
  end = duration;

  const renderWaveform = () => {
    if (!canvas) return;
    const width = Math.max(1, Math.round(canvas.getBoundingClientRect().width));
    if (!peaks || peaks.width !== width) {
      peaks = { width, values: waveformPeaks(buffer, width) };
    }
    drawWaveform(
      canvas,
      peaks.values,
      duration ? start / duration : 0,
      duration ? end / duration : 1,
    );
  };

  const updateSelection = () => {
    const left = duration ? (start / duration) * 100 : 0;
    const right = duration ? (end / duration) * 100 : 100;
    if (shadeLeft) shadeLeft.style.width = `${left}%`;
    if (shadeRight) shadeRight.style.left = `${right}%`;
    if (selection) {
      selection.style.left = `${left}%`;
      selection.style.width = `${Math.max(0, right - left)}%`;
    }
    if (startLabel) startLabel.textContent = formatTime(start);
    if (endLabel) endLabel.textContent = formatTime(end);
    if (lengthLabel) {
      lengthLabel.textContent = `Keeping ${formatTime(Math.max(0, end - start))}`;
    }
    renderWaveform();
  };

  startRange.addEventListener("input", () => {
    start = Math.max(
      0,
      Math.min(Number(startRange.value), end - minimumGap),
    );
    startRange.value = String(start);
    updateSelection();
  });
  endRange.addEventListener("input", () => {
    end = Math.min(duration, Math.max(Number(endRange.value), start + minimumGap));
    endRange.value = String(end);
    updateSelection();
  });

  modal.body.querySelector("[data-reset-selection]")?.addEventListener("click", () => {
    start = 0;
    end = duration;
    startRange.value = "0";
    endRange.value = String(duration);
    updateSelection();
  });

  modal.body.querySelector("[data-play-selection]")?.addEventListener("click", async () => {
    if (!preview) return;
    playSelection = true;
    preview.currentTime = start;
    try {
      await preview.play();
    } catch (error) {
      playSelection = false;
      toast(error?.message || "Could not play the clip.", "error");
    }
  });
  preview?.addEventListener("timeupdate", () => {
    if (!playSelection) return;
    if (preview.currentTime >= end - 0.02) {
      playSelection = false;
      preview.pause();
      preview.currentTime = Math.min(end, duration);
    }
  });
  preview?.addEventListener("pause", () => {
    playSelection = false;
  });
  preview?.addEventListener("ended", () => {
    playSelection = false;
  });

  applyButton.innerHTML = `${icon("check", "h-4 w-4")} Apply trim`;
  applyButton.disabled = false;

  updateSelection();
  onResize = () => {
    peaks = null;
    renderWaveform();
  };
  window.addEventListener("resize", onResize);
}
