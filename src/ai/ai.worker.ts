import { MLCEngine } from "@mlc-ai/web-llm";
import type { AiChatMessage, AiWorkerRequest, AiWorkerResponse } from "./protocol";

/**
 * The on-device AI lives here so token generation never blocks the interface.
 * WebLLM/WebGPU is preferred; a smaller Transformers.js model on WASM is the
 * last-resort local fallback. No request ever leaves the browser.
 */

const scope = self as unknown as {
  postMessage: (message: AiWorkerResponse) => void;
  onmessage: ((event: MessageEvent<AiWorkerRequest>) => void) | null;
};

let engine: MLCEngine | null = null;
let wasmGenerator: ((input: unknown, options: Record<string, unknown>) => Promise<unknown>) | null = null;
let backend: "webllm" | "transformers-wasm" = "webllm";
let loadedModelId = "";
let activeRequestId: number | null = null;
let disposed = false;

function post(message: AiWorkerResponse): void {
  if (!disposed) scope.postMessage(message);
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

function hasWebGpu(): boolean {
  const nav = navigator as Navigator & { gpu?: unknown };
  return Boolean(nav.gpu);
}

function progressText(progress: number): string {
  const percent = Math.max(1, Math.min(99, Math.round(progress * 100)));
  return `Downloading the on-device AI model… ${percent} percent. You can keep exploring while it loads.`;
}

async function loadWebLlm(modelId: string): Promise<void> {
  if (engine) {
    try {
      await engine.unload();
    } catch {
      // A broken engine is replaced below.
    }
    engine = null;
  }
  const next = new MLCEngine({
    initProgressCallback: (report) => {
      post({
        type: "progress",
        modelId,
        progress: Math.max(0, Math.min(1, report.progress || 0)),
        text: report.progress >= 0.98 ? "Warming up the on-device AI…" : progressText(report.progress || 0),
      });
    },
  });
  try {
    await next.reload(modelId);
  } catch (error) {
    try {
      await next.unload();
    } catch {
      // Ignore cleanup failure; the load error is the useful signal.
    }
    throw error;
  }
  engine = next;
  backend = "webllm";
  loadedModelId = modelId;
}

async function loadWasm(repoId: string): Promise<void> {
  const transformers = await import("@huggingface/transformers");
  transformers.env.allowLocalModels = false;
  const generator = await transformers.pipeline("text-generation", repoId, {
    dtype: "q4",
    device: "wasm",
    progress_callback: (info: { status?: string; progress?: number; file?: string }) => {
      if (info.status === "progress" && typeof info.progress === "number") {
        post({
          type: "progress",
          modelId: `wasm:${repoId}`,
          progress: Math.max(0, Math.min(1, info.progress / 100)),
          text: progressText(info.progress / 100),
        });
      }
    },
  });
  wasmGenerator = generator as unknown as (input: unknown, options: Record<string, unknown>) => Promise<unknown>;
  backend = "transformers-wasm";
  loadedModelId = `wasm:${repoId}`;
}

async function handleLoad(modelId: string): Promise<void> {
  try {
    if (modelId.startsWith("wasm:")) {
      if (!wasmGenerator || loadedModelId !== modelId) await loadWasm(modelId.slice(5));
    } else {
      if (hasWebGpu()) {
        await loadWebLlm(modelId);
      } else {
        // If WebGPU disappears between capability checks, report honestly so
        // the page can move on to the WASM model.
        throw new Error("WebGPU is not available in this browser.");
      }
    }
    post({ type: "loaded", modelId, backend });
  } catch (error) {
    post({
      type: "load-error",
      modelId,
      message: describeError(error),
      unsupported: !hasWebGpu(),
    });
  }
}

function wasmTextFromOutput(output: unknown): string {
  const first = Array.isArray(output) ? output[0] : output;
  if (!first || typeof first !== "object") return "";
  const generated = (first as { generated_text?: unknown }).generated_text;
  if (typeof generated === "string") return generated;
  if (Array.isArray(generated)) {
    const last = generated[generated.length - 1];
    if (typeof last === "string") return last;
    if (last && typeof last === "object") {
      const content = (last as { content?: unknown }).content;
      if (typeof content === "string") return content;
    }
  }
  return "";
}

async function streamWasm(request: Extract<AiWorkerRequest, { type: "chat" }>): Promise<void> {
  if (!wasmGenerator) {
    post({ type: "chat-error", requestId: request.requestId, message: "The local AI is not loaded." });
    return;
  }
  try {
    const output = await wasmGenerator(request.messages as unknown as AiChatMessage[], {
      max_new_tokens: request.maxTokens,
      temperature: Math.max(0.1, request.temperature),
      do_sample: true,
      return_full_text: false,
    });
    if (activeRequestId !== request.requestId) return;
    const text = wasmTextFromOutput(output).trim();
    if (!text) {
      post({ type: "done", requestId: request.requestId, text: "" });
      return;
    }
    // The UI still receives the answer progressively while the WASM model
    // finishes in one pass.
    const words = text.split(/(\s+)/);
    let chunk = "";
    for (const word of words) {
      if (activeRequestId !== request.requestId) return;
      chunk += word;
      if (chunk.length >= 24) {
        post({ type: "delta", requestId: request.requestId, text: chunk });
        chunk = "";
        await new Promise((resolve) => setTimeout(resolve, 8));
      }
    }
    if (chunk) post({ type: "delta", requestId: request.requestId, text: chunk });
    post({ type: "done", requestId: request.requestId, text });
  } catch (error) {
    post({ type: "chat-error", requestId: request.requestId, message: describeError(error) });
  }
}

async function streamWebLlm(request: Extract<AiWorkerRequest, { type: "chat" }>): Promise<void> {
  if (!engine) {
    post({ type: "chat-error", requestId: request.requestId, message: "The local AI is not loaded." });
    return;
  }
  let text = "";
  try {
    const completion = await engine.chat.completions.create({
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: true,
    });
    for await (const chunk of completion) {
      if (activeRequestId !== request.requestId) break;
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        text += delta;
        post({ type: "delta", requestId: request.requestId, text: delta });
      }
    }
    post({ type: "done", requestId: request.requestId, text });
  } catch (error) {
    post({ type: "chat-error", requestId: request.requestId, message: describeError(error) });
  } finally {
    if (activeRequestId === request.requestId) activeRequestId = null;
  }
}

async function handleChat(request: Extract<AiWorkerRequest, { type: "chat" }>): Promise<void> {
  if (!loadedModelId) {
    post({ type: "chat-error", requestId: request.requestId, message: "The local AI is still loading." });
    return;
  }
  activeRequestId = request.requestId;
  if (backend === "transformers-wasm") await streamWasm(request);
  else await streamWebLlm(request);
}

scope.onmessage = (event: MessageEvent<AiWorkerRequest>) => {
  const request = event.data;
  if (!request || typeof request !== "object") return;
  switch (request.type) {
    case "load":
      void handleLoad(request.modelId);
      break;
    case "chat":
      void handleChat(request);
      break;
    case "cancel":
      if (activeRequestId === request.requestId) activeRequestId = null;
      if (engine) void engine.interruptGenerate();
      break;
    case "unload":
      disposed = true;
      if (engine) void engine.unload();
      engine = null;
      wasmGenerator = null;
      break;
    default:
      break;
  }
};
