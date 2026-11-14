import { useEffect, useRef, useState } from "react";
import { normalizeForSpeech } from "./normalize";
import type { TtsWorkerRequest, TtsWorkerResponse } from "./tts.protocol";

type SpeechState = "idle" | "speaking";

export interface TtsModelState {
  status: "idle" | "loading" | "ready" | "fallback";
  progress: number;
  message: string;
  backend?: string;
}

function splitForSpeech(text: string, maxLength = 220): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const sentences = cleaned.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) ?? [cleaned];
  const chunks: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxLength) {
      if (sentence.trim()) chunks.push(sentence.trim());
      continue;
    }
    const clauses = sentence.split(/(?<=[,;:])\s+/);
    let current = "";
    for (const clause of clauses) {
      if (!clause.trim()) continue;
      if (`${current} ${clause}`.trim().length > maxLength && current.trim()) {
        chunks.push(current.trim());
        current = clause;
      } else {
        current = `${current} ${clause}`;
      }
    }
    if (current.trim()) chunks.push(current.trim());
  }
  return chunks;
}

class SpeechEngine {
  enabled = false;
  supported: boolean;

  private worker: Worker | null = null;
  private audio: AudioContext | null = null;
  private master: GainNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private synth: SpeechSynthesis | null = null;
  private fallbackVoices: SpeechSynthesisVoice[] = [];
  private job = 0;
  private sentences: string[] = [];
  private index = 0;
  private generating = false;
  private doneSending = true;
  private nextStart = 0;
  private modelReady = false;
  private modelFailed = false;
  private loading = false;
  private lastText = "";
  private resumeText = "";
  private pendingText = "";
  private modelState: TtsModelState = {
    status: "idle",
    progress: 0,
    message: "The neural voice is ready to load when you first listen.",
  };
  private onSpeaking: (state: SpeechState) => void;
  private onModelState: (state: TtsModelState) => void;

  constructor(onSpeaking: (state: SpeechState) => void, onModelState: (state: TtsModelState) => void) {
    this.onSpeaking = onSpeaking;
    this.onModelState = onModelState;
    this.supported =
      typeof window !== "undefined" &&
      (typeof window.AudioContext !== "undefined" ||
        typeof (window as Window & { webkitAudioContext?: unknown }).webkitAudioContext !== "undefined" ||
        "speechSynthesis" in window);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      this.synth = window.speechSynthesis;
      this.loadVoices();
      this.synth.addEventListener?.("voiceschanged", this.loadVoices);
    }
  }

  private loadVoices = () => {
    if (!this.synth) return;
    this.fallbackVoices = this.synth.getVoices();
  };

  private setSpeaking(state: SpeechState): void {
    this.onSpeaking(state);
  }

  private updateModel(patch: Partial<TtsModelState>): void {
    this.modelState = { ...this.modelState, ...patch };
    this.onModelState(this.modelState);
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./tts.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<TtsWorkerResponse>) => this.handleMessage(event.data);
    worker.onerror = (event) => {
      this.modelFailed = true;
      this.modelReady = false;
      this.loading = false;
      this.updateModel({
        status: "fallback",
        progress: 1,
        message: "The neural voice worker stopped. Using the best installed voice on this device.",
        backend: undefined,
      });
      console.warn("Neural voice worker failed", event.message);
      if (this.pendingText) this.fallbackSpeak(this.pendingText);
    };
    this.worker = worker;
    return worker;
  }

  private post(message: TtsWorkerRequest): void {
    this.ensureWorker().postMessage(message);
  }

  private ensureAudio(): AudioContext | null {
    if (this.audio) return this.audio;
    const Ctor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.audio = new Ctor({ latencyHint: "interactive" });
      this.master = this.audio.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.audio.destination);
      return this.audio;
    } catch {
      this.audio = null;
      return null;
    }
  }

  private ensureLoaded(): void {
    if (this.modelReady || this.modelFailed || this.loading) return;
    this.loading = true;
    this.updateModel({
      status: "loading",
      progress: 0.01,
      message: "Starting the neural voice. You can keep searching while it loads.",
    });
    this.post({ type: "load", requestId: 0 });
  }

  private handleMessage(message: TtsWorkerResponse): void {
    switch (message.type) {
      case "progress":
        this.updateModel({
          status: "loading",
          progress: Math.max(0.01, Math.min(0.99, message.progress)),
          message: message.text,
        });
        break;
      case "ready":
        this.loading = false;
        this.modelReady = true;
        this.modelFailed = false;
        this.updateModel({
          status: "ready",
          progress: 1,
          message: message.message,
          backend: message.backend,
        });
        this.pendingText = "";
        break;
      case "audio":
        if (message.requestId !== this.job) return;
        this.scheduleSamples(message.samples, message.sampleRate, message.text);
        break;
      case "wav":
        if (message.requestId !== this.job) return;
        void this.scheduleWav(message.buffer, message.text);
        break;
      case "done":
        if (message.requestId !== this.job) return;
        this.generating = false;
        this.requestNext();
        break;
      case "error":
        this.loading = false;
        if (message.fatal) {
          this.modelReady = false;
          this.modelFailed = true;
          this.updateModel({
            status: "fallback",
            progress: 1,
            message: "The neural voice could not start. Using the best installed voice on this device.",
            backend: undefined,
          });
          const text = this.pendingText || this.lastText;
          if (text) this.fallbackSpeak(text);
        }
        break;
      default:
        break;
    }
  }

  private pauseAfter(text: string): number {
    const trimmed = text.trim();
    if (/[.!?]["')\]]?$/.test(trimmed)) return 0.26;
    if (/[;:]$/.test(trimmed)) return 0.17;
    if (/,$/.test(trimmed)) return 0.09;
    return 0.12;
  }

  private startAudioClock(): void {
    const context = this.ensureAudio();
    if (!context) return;
    if (context.state === "suspended") void context.resume();
    this.nextStart = context.currentTime + 0.06;
  }

  private scheduleBuffer(buffer: AudioBuffer, text: string): void {
    const context = this.ensureAudio();
    if (!context || !this.master) {
      this.fallbackSpeak(text);
      return;
    }
    const start = Math.max(context.currentTime + 0.04, this.nextStart || context.currentTime + 0.04);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    const end = start + buffer.duration;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(1, start + 0.025);
    gain.gain.setValueAtTime(1, Math.max(start + 0.03, end - 0.035));
    gain.gain.linearRampToValueAtTime(0.0001, end);
    source.connect(gain);
    gain.connect(this.master);
    source.start(start);
    const pause = this.pauseAfter(text);
    this.nextStart = end - 0.02 + pause;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      this.maybeFinish();
    };
    this.setSpeaking("speaking");
  }

  private scheduleSamples(samples: Float32Array, sampleRate: number, text: string): void {
    const context = this.ensureAudio();
    if (!context) {
      this.fallbackSpeak(text);
      return;
    }
    const buffer = context.createBuffer(1, samples.length, sampleRate);
    const channel = new Float32Array(samples.length);
    channel.set(samples);
    buffer.copyToChannel(channel, 0);
    this.scheduleBuffer(buffer, text);
  }

  private async scheduleWav(arrayBuffer: ArrayBuffer, text: string): Promise<void> {
    const context = this.ensureAudio();
    if (!context) {
      this.fallbackSpeak(text);
      return;
    }
    try {
      const buffer = await context.decodeAudioData(arrayBuffer);
      this.scheduleBuffer(buffer, text);
    } catch {
      this.fallbackSpeak(text);
    }
  }

  private requestNext(): void {
    if (this.sentences.length === 0) {
      this.doneSending = true;
      this.maybeFinish();
      return;
    }
    if (this.index >= this.sentences.length) {
      this.doneSending = true;
      this.maybeFinish();
      return;
    }
    const sentence = this.sentences[this.index];
    this.index += 1;
    this.generating = true;
    this.post({
      type: "speak",
      requestId: this.job,
      text: sentence,
      voice: "af_heart",
      speed: 0.95,
    });
  }

  private maybeFinish(): void {
    if (this.generating || !this.doneSending || this.sources.size > 0) return;
    this.setSpeaking("idle");
    this.resumeText = "";
  }

  private halt(): void {
    const previousJob = this.job;
    this.job += 1;
    if (this.worker) {
      try {
        this.worker.postMessage({ type: "cancel", requestId: previousJob } satisfies TtsWorkerRequest);
      } catch {
        // The worker may already be gone.
      }
    }
    this.sentences = [];
    this.index = 0;
    this.generating = false;
    this.doneSending = true;
    this.nextStart = 0;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.sources.clear();
    this.synth?.cancel();
  }

  private fallbackSpeak(text: string): void {
    if (!this.synth) {
      this.setSpeaking("idle");
      return;
    }
    this.synth.cancel();
    const chunks = splitForSpeech(text);
    if (!chunks.length) return;
    const voice = this.pickFallbackVoice();
    chunks.forEach((chunk, index) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = "en-US";
      }
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onstart = () => this.setSpeaking("speaking");
      utterance.onerror = () => {
        if (index === chunks.length - 1) this.setSpeaking("idle");
      };
      utterance.onend = () => {
        if (index === chunks.length - 1) this.setSpeaking("idle");
      };
      this.synth?.speak(utterance);
    });
  }

  private pickFallbackVoice(): SpeechSynthesisVoice | null {
    if (!this.fallbackVoices.length) this.loadVoices();
    if (!this.fallbackVoices.length) return null;
    const english = this.fallbackVoices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
    const available = english.length ? english : this.fallbackVoices;
    const score = (voice: SpeechSynthesisVoice) => {
      let value = 0;
      if (/natural|neural|premium|enhanced|siri/i.test(voice.name)) value += 12;
      if (/aria|jenny|guy|sonia|libby|samantha|google us english|google uk english/i.test(voice.name)) value += 6;
      if (voice.lang === "en-US") value += 4;
      if (voice.lang === "en-GB") value += 3;
      if (voice.localService) value += 2;
      if (/espeak|robot|compact|festival|pico/i.test(voice.name)) value -= 8;
      return value;
    };
    return [...available].sort((a, b) => score(b) - score(a))[0] ?? null;
  }

  speak(rawText: string, interrupt = true): void {
    if (!this.enabled) return;
    const text = normalizeForSpeech(rawText);
    if (!text) return;
    this.lastText = text;
    this.resumeText = "";
    if (interrupt) this.halt();
    this.ensureLoaded();
    if (this.modelReady) {
      this.startNeural(text);
      return;
    }
    if (this.modelFailed) {
      this.fallbackSpeak(text);
      return;
    }
    // While the neural voice downloads, the listener still hears the result
    // through the best installed voice. The next result uses Kokoro.
    this.pendingText = text;
    this.fallbackSpeak(text);
  }

  private startNeural(text: string): void {
    const context = this.ensureAudio();
    if (!context) {
      this.fallbackSpeak(text);
      return;
    }
    this.sentences = splitForSpeech(text);
    if (!this.sentences.length) return;
    this.index = 0;
    this.generating = false;
    this.doneSending = false;
    this.startAudioClock();
    this.requestNext();
  }

  stop(): void {
    this.resumeText = "";
    this.pendingText = "";
    this.halt();
    this.setSpeaking("idle");
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      const remaining = this.sentences.slice(Math.max(0, this.index - 1)).join(" ").trim();
      this.resumeText = remaining || (this.synth?.speaking ? this.lastText : "");
      this.pendingText = "";
      this.halt();
      this.setSpeaking("idle");
      return;
    }
    if (this.resumeText) {
      const text = this.resumeText;
      this.resumeText = "";
      this.speak(text, true);
    }
  }

  dispose(): void {
    this.halt();
    if (this.worker) {
      try {
        this.worker.postMessage({ type: "unload" } satisfies TtsWorkerRequest);
      } catch {
        // Ignore.
      }
      this.worker.terminate();
      this.worker = null;
    }
    if (this.audio) {
      void this.audio.close();
      this.audio = null;
      this.master = null;
    }
    this.synth?.removeEventListener?.("voiceschanged", this.loadVoices);
    this.synth?.cancel();
  }
}

const STORAGE_KEY = "earth-jukebox:voice";

export interface TextToSpeech {
  enabled: boolean;
  supported: boolean;
  speaking: boolean;
  state: TtsModelState;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
  speak: (text: string, interrupt?: boolean) => void;
  stop: () => void;
}

export function useTextToSpeech(): TextToSpeech {
  const [enabled, setEnabledState] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const [speaking, setSpeaking] = useState(false);
  const [state, setState] = useState<TtsModelState>({
    status: "idle",
    progress: 0,
    message: "The neural voice is ready to load when you first listen.",
  });
  const engineRef = useRef<SpeechEngine | null>(null);

  if (!engineRef.current) {
    engineRef.current = new SpeechEngine((state) => setSpeaking(state === "speaking"), setState);
  }

  useEffect(() => {
    engineRef.current?.setEnabled(enabled);
  }, [enabled]);

  useEffect(() => {
    return () => engineRef.current?.dispose();
  }, []);

  const setEnabled = (value: boolean) => {
    setEnabledState(value);
    engineRef.current?.setEnabled(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
    } catch {
      // Local storage can be unavailable in private browsing.
    }
  };

  const toggle = () => setEnabled(!enabled);
  const speak = (text: string, interrupt = true) => {
    engineRef.current?.speak(text, interrupt);
  };
  const stop = () => engineRef.current?.stop();

  return {
    enabled,
    supported: engineRef.current.supported,
    speaking,
    state,
    setEnabled,
    toggle,
    speak,
    stop,
  };
}
