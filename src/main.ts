import { AudioEngine } from "./audio/engine";
import { OnsetDetector } from "./audio/onset";
import { VisualRenderer } from "./visual/renderer";

function mustEl<T extends Element>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`缺少元素: ${sel}`);
  return el;
}

const canvas = mustEl<HTMLCanvasElement>("#stage");
const fileInput = mustEl<HTMLInputElement>("#fileInput");
const playBtn = mustEl<HTMLButtonElement>("#playBtn");
const iconPlay = mustEl<SVGElement>("#icon-play");
const iconPause = mustEl<SVGElement>("#icon-pause");
const seek = mustEl<HTMLInputElement>("#seek");
const trackName = mustEl<HTMLElement>("#trackName");
const timeCurrent = mustEl<HTMLElement>("#timeCurrent");
const timeTotal = mustEl<HTMLElement>("#timeTotal");
const sensitivity = mustEl<HTMLInputElement>("#sensitivity");
const smoothness = mustEl<HTMLInputElement>("#smoothness");
const dropHint = mustEl<HTMLElement>("#dropHint");
const dock = mustEl<HTMLElement>("#dock");

const engine = new AudioEngine();
const onset = new OnsetDetector();
const renderer = new VisualRenderer(canvas);

let hasTrack = false;
let seeking = false;
let lastTs = performance.now();

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function setPlayLabel(): void {
  if (engine.playing) {
    iconPlay.style.display = "none";
    iconPause.style.display = "block";
  } else {
    iconPlay.style.display = "block";
    iconPause.style.display = "none";
  }
}

function isAudioFile(file: File): boolean {
  if (file.type.startsWith("audio/")) return true;
  return /\.(mp3|wav|ogg|flac|m4a|aac|opus|webm)$/i.test(file.name);
}

async function loadFile(file: File): Promise<void> {
  if (!isAudioFile(file)) {
    trackName.textContent = "请选择音频文件";
    return;
  }
  await engine.loadFile(file);
  hasTrack = true;
  trackName.textContent = file.name;
  playBtn.disabled = false;
  seek.disabled = false;
  dropHint.classList.add("is-hidden");
  timeTotal.textContent = formatTime(engine.duration);
  seek.value = "0";
  await engine.play();
  setPlayLabel();
  resetHideTimeout();
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  void loadFile(file).catch((err) => {
    console.error(err);
    trackName.textContent = "加载失败，请换一个文件";
  });
});

playBtn.addEventListener("click", () => {
  void (async () => {
    if (!hasTrack) return;
    if (engine.playing) {
      engine.pause();
    } else {
      await engine.play();
    }
    setPlayLabel();
    resetHideTimeout();
  })();
});

seek.addEventListener("pointerdown", () => {
  seeking = true;
});
seek.addEventListener("pointerup", () => {
  seeking = false;
  if (!hasTrack) return;
  const t = (Number(seek.value) / 1000) * engine.duration;
  engine.seek(t);
});
seek.addEventListener("input", () => {
  if (!hasTrack) return;
  const t = (Number(seek.value) / 1000) * engine.duration;
  timeCurrent.textContent = formatTime(t);
});

sensitivity.addEventListener("input", () => {
  onset.setSensitivity(Number(sensitivity.value));
});
onset.setSensitivity(Number(sensitivity.value));

smoothness.addEventListener("input", () => {
  renderer.setSmoothness(Number(smoothness.value));
});
renderer.setSmoothness(Number(smoothness.value));

let hideTimeout = 0;
function resetHideTimeout(): void {
  dock.classList.remove("is-hidden");
  window.clearTimeout(hideTimeout);
  hideTimeout = window.setTimeout(() => {
    if (hasTrack && engine.playing) {
      dock.classList.add("is-hidden");
    }
  }, 2500);
}
window.addEventListener("mousemove", resetHideTimeout);
window.addEventListener("pointerdown", resetHideTimeout);
resetHideTimeout();

engine.audio.addEventListener("ended", () => {
  setPlayLabel();
  dock.classList.remove("is-hidden");
});

engine.audio.addEventListener("loadedmetadata", () => {
  timeTotal.textContent = formatTime(engine.duration);
});

function onDrag(e: Event): void {
  e.preventDefault();
  e.stopPropagation();
}

document.addEventListener("dragenter", onDrag);
document.addEventListener("dragover", onDrag);
document.addEventListener("dragleave", onDrag);
document.addEventListener("drop", onDrag);
window.addEventListener("dragenter", onDrag);
window.addEventListener("dragover", onDrag);
window.addEventListener("dragleave", onDrag);
window.addEventListener("drop", onDrag);

document.addEventListener("drop", (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  void loadFile(file).catch((err) => {
    console.error(err);
    trackName.textContent = "加载失败，请换一个文件";
  });
});

function onResize(): void {
  renderer.resize();
}
window.addEventListener("resize", onResize);
onResize();

function frame(now: number): void {
  const dt = Math.min(0.05, (now - lastTs) / 1000);
  lastTs = now;
  const t = now / 1000;

  const audio = hasTrack ? engine.sample() : null;
  let onsetState = null;
  if (audio && engine.playing) {
    onsetState = onset.update(
      {
        bass: audio.bass,
        lowMid: audio.lowMid,
        mid: audio.mid,
        high: audio.high,
      },
      now,
      dt,
    );
  }

  renderer.render(audio, onsetState, t, dt, engine.playing);

  if (hasTrack && !seeking) {
    const dur = engine.duration || 1;
    seek.value = String(Math.floor((engine.currentTime / dur) * 1000));
    timeCurrent.textContent = formatTime(engine.currentTime);
    timeTotal.textContent = formatTime(engine.duration);
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
