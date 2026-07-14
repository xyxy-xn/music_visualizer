import { SpectrumAnalyser, type AudioFrame } from "./analyser";

export class AudioEngine {
  readonly audio = new Audio();
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private analyser: SpectrumAnalyser | null = null;
  private objectUrl: string | null = null;
  private wired = false;

  constructor() {
    // blob: / file upload 不需要 CORS；设 anonymous 反而可能导致部分浏览器分析失败
    this.audio.preload = "auto";
  }

  async ensureContext(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.analyser = new SpectrumAnalyser(this.ctx);
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    return this.ctx;
  }

  private wireGraph(): void {
    if (!this.ctx || !this.analyser || this.wired) return;
    this.source = this.ctx.createMediaElementSource(this.audio);
    this.analyser.connect(this.source);
    this.source.connect(this.ctx.destination);
    this.wired = true;
  }

  async loadFile(file: File): Promise<void> {
    await this.ensureContext();
    this.wireGraph();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    this.audio.src = this.objectUrl;
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("无法加载音频文件"));
      };
      const cleanup = () => {
        this.audio.removeEventListener("canplay", onReady);
        this.audio.removeEventListener("error", onError);
      };
      this.audio.addEventListener("canplay", onReady);
      this.audio.addEventListener("error", onError);
      this.audio.load();
    });
  }

  async play(): Promise<void> {
    await this.ensureContext();
    this.wireGraph();
    await this.audio.play();
  }

  pause(): void {
    this.audio.pause();
  }

  get playing(): boolean {
    return !this.audio.paused && !this.audio.ended;
  }

  get currentTime(): number {
    return this.audio.currentTime;
  }

  get duration(): number {
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
  }

  seek(time: number): void {
    if (!Number.isFinite(this.audio.duration)) return;
    this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, time));
  }

  sample(): AudioFrame | null {
    if (!this.analyser) return null;
    return this.analyser.sample();
  }

  dispose(): void {
    this.pause();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    void this.ctx?.close();
  }
}
