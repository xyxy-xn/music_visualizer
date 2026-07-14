import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "standalone");

mkdirSync(outDir, { recursive: true });

const result = await build({
  entryPoints: [join(root, "src/main.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  write: false,
  logLevel: "info",
});

const js = result.outputFiles?.[0]?.text ?? "";
const css = readFileSync(join(root, "src/style.css"), "utf8");

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PULSE — Music Visualizer</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Syne:wght@500;700;800&display=swap"
      rel="stylesheet"
    />
    <style>
${css}
    </style>
  </head>
  <body>
    <div id="app">
      <canvas id="stage" aria-label="音乐可视化舞台"></canvas>

      <div class="drop-hint" id="dropHint">
        <p class="drop-hint__title">拖入或选择一首音乐</p>
        <p class="drop-hint__meta">WAV · MP3 · OGG · FLAC · M4A</p>
      </div>

      <footer class="dock" id="dock">
        <button type="button" class="btn icon-btn" id="playBtn" disabled aria-label="播放/暂停">
          <svg id="icon-play" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          <svg id="icon-pause" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display: none;"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
        </button>
        <label class="btn file-btn secondary-btn">
          上传
          <input id="fileInput" type="file" accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac" hidden />
        </label>
        <div class="track">
          <span class="track__name" id="trackName">未选择音频</span>
          <input id="seek" class="seek" type="range" min="0" max="1000" value="0" disabled />
          <div class="track__time">
            <span id="timeCurrent">0:00</span>
            <span id="timeTotal">0:00</span>
          </div>
        </div>
        <div class="controls-group">
          <label class="sens">
            <span>强度</span>
            <input id="sensitivity" type="range" min="0.5" max="2" step="0.05" value="1" />
          </label>
          <label class="sens">
            <span>平滑</span>
            <input id="smoothness" type="range" min="0.1" max="0.9" step="0.05" value="0.7" />
          </label>
        </div>
      </footer>
    </div>
    <script>
${js}
    </script>
  </body>
</html>
`;

writeFileSync(join(outDir, "index.html"), html, "utf8");
writeFileSync(join(root, "双击打开-PULSE.html"), html, "utf8");
console.log("Wrote standalone/index.html and 双击打开-PULSE.html");
