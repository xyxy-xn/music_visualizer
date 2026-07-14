export type BandEnergies = {
  bass: number;
  lowMid: number;
  mid: number;
  high: number;
  overall: number;
  rms: number;
};

export type AudioFrame = BandEnergies & {
  frequency: Uint8Array;
  waveform: Uint8Array;
  sampleRate: number;
};

const FFT_SIZE = 2048;

function hzToBin(hz: number, sampleRate: number, binCount: number): number {
  return Math.min(binCount - 1, Math.max(0, Math.round((hz * binCount * 2) / sampleRate)));
}

function bandEnergy(
  data: Uint8Array,
  sampleRate: number,
  lowHz: number,
  highHz: number,
): number {
  const bins = data.length;
  const start = hzToBin(lowHz, sampleRate, bins);
  const end = Math.max(start + 1, hzToBin(highHz, sampleRate, bins));
  let sum = 0;
  for (let i = start; i < end; i++) sum += data[i];
  return sum / ((end - start) * 255);
}

export class SpectrumAnalyser {
  readonly analyser: AnalyserNode;
  private readonly freq: Uint8Array;
  private readonly wave: Uint8Array;

  constructor(ctx: AudioContext) {
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = 0.72;
    this.analyser.minDecibels = -90;
    this.analyser.maxDecibels = -20;
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.wave = new Uint8Array(this.analyser.fftSize);
  }

  connect(source: AudioNode): void {
    source.connect(this.analyser);
  }

  sample(): AudioFrame {
    this.analyser.getByteFrequencyData(this.freq);
    this.analyser.getByteTimeDomainData(this.wave);
    const sampleRate = this.analyser.context.sampleRate;
    const bass = bandEnergy(this.freq, sampleRate, 20, 100);
    const lowMid = bandEnergy(this.freq, sampleRate, 100, 500);
    const mid = bandEnergy(this.freq, sampleRate, 500, 2000);
    const high = bandEnergy(this.freq, sampleRate, 2000, 12000);
    const overall = bass * 0.35 + lowMid * 0.3 + mid * 0.2 + high * 0.15;

    let sumSq = 0;
    for (let i = 0; i < this.wave.length; i++) {
      const v = (this.wave[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / this.wave.length);

    return {
      bass,
      lowMid,
      mid,
      high,
      overall,
      rms,
      frequency: this.freq,
      waveform: this.wave,
      sampleRate,
    };
  }
}
