import type { AiState, Subject } from "../types";
import {
  pickAiModelCandidates,
  type AiChatMessage,
  type AiModelChoice,
  type AiWorkerRequest,
  type AiWorkerResponse,
} from "./protocol";

export const AI_MODEL_NOTE =
  "The on-device AI chooses a small model that fits this device, downloads it once, and keeps every word in the browser.";

export interface AiGrounding {
  /** Caption from the NASA Images result shown in the panel. */
  nasaDescription?: string;
  nasaSvsTitle?: string;
  nasaSvsDescription?: string;
  jplDistance?: string;
  /** Plain-language camera position from the scene engine. */
  viewDescription?: string;
}

export interface BriefingEnhancement {
  briefing: string;
  sceneDescription: string;
  followUp: string;
}

const SYSTEM_PROMPT = [
  "You are Earth Jukebox, a friendly space and Earth science guide for blind and low-vision listeners.",
  "You speak in clear, natural spoken language and address the listener directly.",
  "Keep answers short unless the listener asks for more detail.",
  "Use only the verified context provided for specific facts, dates, names, and numbers.",
  "If the context does not contain the answer, say plainly that you are not sure instead of guessing.",
  "Never use markdown, bullet points, emoji, tables, or symbols.",
  "Never mention that you are an AI language model or talk about prompts.",
].join(" ");

function cleanModelText(text: string): string {
  return text
    .replace(/```(?:json|text)?/gi, "")
    .replace(/```/g, "")
    .replace(/^\s*(?:assistant|earth jukebox)\s*:\s*/i, "")
    .replace(/[*_#>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBriefing(raw: string): BriefingEnhancement | null {
  const cleaned = raw.replace(/```(?:json|text)?/gi, "").replace(/```/g, "").trim();
  const briefingMatch = cleaned.match(/(?:^|\n)\s*BRIEFING\s*:\s*([\s\S]*?)(?=\n\s*(?:SCENE|FOLLOWUP|FOLLOW-UP)\s*:|$)/i);
  const sceneMatch = cleaned.match(/(?:^|\n)\s*SCENE\s*:\s*([\s\S]*?)(?=\n\s*(?:BRIEFING|FOLLOWUP|FOLLOW-UP)\s*:|$)/i);
  const followMatch = cleaned.match(/(?:^|\n)\s*FOLLOW(?:UP|-UP)\s*:\s*([\s\S]*?)$/i);
  const briefing = cleanModelText(briefingMatch?.[1] ?? "");
  const sceneDescription = cleanModelText(sceneMatch?.[1] ?? "");
  const followUp = cleanModelText(followMatch?.[1] ?? "");
  if (briefing.length < 40) return null;
  return {
    briefing: briefing.slice(0, 900),
    sceneDescription: sceneDescription.slice(0, 600),
    followUp: followUp.slice(0, 160),
  };
}

function groundingText(subject: Subject, grounding: AiGrounding): string {
  const facts = subject.facts.map((fact) => `${fact.label}: ${fact.value}`).join("\n");
  const lines = [
    `Topic: ${subject.title}`,
    `Category: ${subject.category}`,
    `Today's date: ${new Date().toISOString().slice(0, 10)}`,
    subject.closestMatch
      ? `This is the closest real NASA subject to the query. ${subject.matchNote ?? ""}`
      : "",
    `Verified facts:\n${facts}`,
    `Plain-language guide:\n${subject.briefing}`,
    `What is on screen:\n${subject.sceneDescription}`,
    grounding.viewDescription ? `Camera position:\n${grounding.viewDescription}` : "",
    subject.context?.length ? `Additional verified context:\n${subject.context.join(" ")}` : "",
    grounding.nasaDescription ? `NASA archive caption:\n${grounding.nasaDescription.slice(0, 1200)}` : "",
    grounding.nasaSvsTitle
      ? `NASA Scientific Visualization Studio item: ${grounding.nasaSvsTitle}. ${grounding.nasaSvsDescription ?? ""}`
      : "",
    grounding.jplDistance ? `Live JPL Horizons distance from Earth today: ${grounding.jplDistance}` : "",
  ];
  return lines.filter(Boolean).join("\n\n");
}

interface PendingRequest {
  onDelta?: (text: string) => void;
  onDone: (text: string) => void;
  onError: (message: string) => void;
}

class LocalAi {
  private worker: Worker | null = null;
  private state: AiState = {
    status: "idle",
    progress: 0,
    message: "The on-device AI is ready to load when you search.",
  };
  private listener: ((state: AiState) => void) | null = null;
  private loadPromise: Promise<boolean> | null = null;
  private loadResolve: ((ok: boolean) => void) | null = null;
  private loadReject: ((error: Error) => void) | null = null;
  private candidates: AiModelChoice[] = [];
  private pending = new Map<number, PendingRequest>();
  private requestSeq = 0;
  private activeRequestId: number | null = null;
  private briefingCache = new Map<string, Promise<BriefingEnhancement | null>>();
  private disposed = false;

  setListener(listener: ((state: AiState) => void) | null): void {
    this.listener = listener;
    if (listener) listener(this.state);
  }

  getState(): AiState {
    return this.state;
  }

  private update(patch: Partial<AiState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.listener?.(this.state);
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./ai.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<AiWorkerResponse>) => this.handleMessage(event.data);
    worker.onerror = (event) => {
      const message = event.message || "The on-device AI worker stopped unexpectedly.";
      this.loadReject?.(new Error(message));
      this.loadReject = null;
      this.loadResolve = null;
      for (const pending of this.pending.values()) pending.onError(message);
      this.pending.clear();
      this.update({
        status: "error",
        progress: 1,
        message: "The on-device AI could not start. The built-in NASA guide is answering instead.",
        error: message,
      });
    };
    this.worker = worker;
    return worker;
  }

  private post(message: AiWorkerRequest): void {
    this.ensureWorker().postMessage(message);
  }

  private handleMessage(message: AiWorkerResponse): void {
    switch (message.type) {
      case "progress":
        this.update({
          status: "loading",
          progress: Math.max(0.01, Math.min(0.99, message.progress)),
          message: message.text,
        });
        break;
      case "loaded":
        this.update({
          status: "ready",
          progress: 1,
          message:
            message.backend === "transformers-wasm"
              ? "On-device AI is ready using the smaller WASM model. Answers stay on this device."
              : "On-device AI is ready. Briefings and answers are generated locally.",
          modelLabel: this.currentChoice(message.modelId)?.label,
          error: undefined,
        });
        this.loadResolve?.(true);
        this.loadResolve = null;
        this.loadReject = null;
        break;
      case "load-error":
        this.loadReject?.(new Error(message.message));
        this.loadReject = null;
        this.loadResolve = null;
        break;
      case "delta": {
        const pending = this.pending.get(message.requestId);
        pending?.onDelta?.(message.text);
        break;
      }
      case "done": {
        const pending = this.pending.get(message.requestId);
        this.pending.delete(message.requestId);
        if (this.activeRequestId === message.requestId) this.activeRequestId = null;
        pending?.onDone(message.text);
        break;
      }
      case "chat-error": {
        const pending = this.pending.get(message.requestId);
        this.pending.delete(message.requestId);
        if (this.activeRequestId === message.requestId) this.activeRequestId = null;
        pending?.onError(message.message);
        break;
      }
      default:
        break;
    }
  }

  private currentChoice(modelId: string): AiModelChoice | undefined {
    return this.candidates.find((candidate) => candidate.id === modelId);
  }

  private waitForLoad(): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.loadResolve = resolve;
      this.loadReject = reject;
    });
  }

  async load(): Promise<boolean> {
    if (this.state.status === "ready") return true;
    if (this.loadPromise) return this.loadPromise;
    this.update({
      status: "loading",
      progress: 0,
      message: "Preparing the on-device AI…",
      error: undefined,
    });
    this.loadPromise = (async () => {
      this.candidates = pickAiModelCandidates();
      const failures: string[] = [];
      for (const candidate of this.candidates) {
        if (this.disposed) return false;
        const loadingWasm = candidate.tier === "wasm";
        this.update({
          status: "loading",
          progress: 0.01,
          message: loadingWasm
            ? "WebGPU could not run the larger model. Trying a smaller WASM AI that works without it…"
            : `Loading ${candidate.label} on this device. You can keep exploring while it downloads.`,
          modelLabel: candidate.label,
        });
        try {
          const ready = this.waitForLoad();
          this.post({ type: "load", requestId: Date.now(), modelId: candidate.id });
          await ready;
          return true;
        } catch (error) {
          failures.push(`${candidate.label}: ${error instanceof Error ? error.message : String(error)}`);
          this.update({
            status: "loading",
            progress: 0,
            message: `${candidate.label} could not start on this device. Trying the next local option…`,
          });
        }
      }
      this.update({
        status: "error",
        progress: 1,
        message:
          "The on-device AI could not start on this device. The built-in NASA guide will answer, so every search still works.",
        error: failures.join(" | ").slice(0, 500),
      });
      return false;
    })().finally(() => {
      this.loadPromise = null;
      this.loadResolve = null;
      this.loadReject = null;
    });
    return this.loadPromise;
  }

  retry(): Promise<boolean> {
    if (this.loadPromise) return this.loadPromise;
    if (this.worker) {
      try {
        this.worker.postMessage({ type: "unload" } satisfies AiWorkerRequest);
      } catch {
        // A terminated worker needs no cleanup.
      }
      this.worker = null;
    }
    this.update({ status: "idle", progress: 0, message: "Ready to try the on-device AI again.", error: undefined });
    return this.load();
  }

  cancel(): void {
    const requestId = this.activeRequestId;
    if (requestId !== null) {
      try {
        this.post({ type: "cancel", requestId });
      } catch {
        // The worker may already be gone.
      }
    }
    this.activeRequestId = null;
    for (const pending of this.pending.values()) pending.onError("cancelled");
    this.pending.clear();
  }

  private request(
    messages: AiChatMessage[],
    options: { temperature: number; maxTokens: number; timeoutMs: number; onDelta?: (text: string) => void },
  ): Promise<string | null> {
    if (this.state.status !== "ready" || !this.worker) return Promise.resolve(null);
    const requestId = ++this.requestSeq;
    this.activeRequestId = requestId;
    return new Promise<string | null>((resolve) => {
      let text = "";
      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        this.pending.delete(requestId);
        if (this.activeRequestId === requestId) this.activeRequestId = null;
        resolve(value);
      };
      const timer = window.setTimeout(() => {
        try {
          this.post({ type: "cancel", requestId });
        } catch {
          // Ignore cancellation failure.
        }
        finish(cleanModelText(text) || null);
      }, options.timeoutMs);
      this.pending.set(requestId, {
        onDelta: (delta) => {
          text += delta;
          options.onDelta?.(text);
        },
        onDone: (final) => finish(cleanModelText(final || text) || null),
        onError: () => finish(cleanModelText(text) || null),
      });
      this.post({
        type: "chat",
        requestId,
        messages,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      });
    });
  }

  async enhanceBriefing(subject: Subject, grounding: AiGrounding): Promise<BriefingEnhancement | null> {
    if (this.state.status !== "ready") return null;
    const cacheKey = `${subject.id}:${subject.query}:${new Date().toISOString().slice(0, 10)}`;
    const cached = this.briefingCache.get(cacheKey);
    if (cached) return cached;
    const promise = this.generateBriefing(subject, grounding);
    this.briefingCache.set(cacheKey, promise);
    return promise;
  }

  private async generateBriefing(subject: Subject, grounding: AiGrounding): Promise<BriefingEnhancement | null> {
    const prompt = [
      groundingText(subject, grounding),
      "",
      "Write three short parts for a blind listener. Stay completely faithful to the verified material above.",
      "BRIEFING: 45 to 70 words on what this is, how it works, and why it matters. Speak it naturally, with short sentences.",
      "SCENE: 25 to 45 words describing what is on screen right now, including that the camera circles the subject and the scale is illustrative.",
      "FOLLOWUP: one short, friendly follow-up question.",
      "Use the exact labels BRIEFING, SCENE, and FOLLOWUP. No markdown. No lists. No symbols. No extra text.",
    ].join("\n");
    const raw = await this.request(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      { temperature: 0.3, maxTokens: 320, timeoutMs: 90_000 },
    );
    if (!raw) return null;
    const parsed = parseBriefing(raw);
    if (parsed) return parsed;
    const fallback = cleanModelText(raw);
    if (fallback.length >= 60) {
      return {
        briefing: fallback.slice(0, 900),
        sceneDescription: subject.sceneDescription,
        followUp: "",
      };
    }
    return null;
  }

  /** Stream a grounded chat answer. Calls onDelta with the partial answer. */
  async streamAnswer(
    subject: Subject,
    history: Array<{ role: "user" | "assistant"; content: string }>,
    question: string,
    grounding: AiGrounding,
    onDelta?: (text: string) => void,
  ): Promise<string | null> {
    if (this.state.status !== "ready") return null;
    const recent: AiChatMessage[] = history.slice(-6).map((message) => ({
      role: message.role,
      content: message.content.slice(0, 900),
    }));
    const context = groundingText(subject, grounding);
    const messages: AiChatMessage[] = [
      {
        role: "system",
        content: `${SYSTEM_PROMPT}\n\nVerified context for this search. Treat it as the only source of specific facts:\n\n${context}`,
      },
      ...recent,
      {
        role: "user",
        content: `${question}\n\nAnswer in two to four short, speakable sentences. If the context above does not answer this, say you are not sure and offer what the context does say.`,
      },
    ];
    return this.request(messages, {
      temperature: 0.4,
      maxTokens: 240,
      timeoutMs: 45_000,
      onDelta: (text) => onDelta?.(cleanModelText(text)),
    });
  }

  /** Backwards-compatible non-streaming answer. */
  async answer(
    subject: Subject,
    history: Array<{ role: "user" | "assistant"; content: string }>,
    question: string,
    grounding: AiGrounding,
  ): Promise<string | null> {
    return this.streamAnswer(subject, history, question, grounding);
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
    if (this.worker) {
      try {
        this.worker.postMessage({ type: "unload" } satisfies AiWorkerRequest);
      } catch {
        // Ignore.
      }
      this.worker.terminate();
      this.worker = null;
    }
  }
}

export const localAi = new LocalAi();
