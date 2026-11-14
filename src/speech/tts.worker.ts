import type { GenerateOptions, KokoroTTS } from "kokoro-js";
import type { TtsBackend, TtsWorkerRequest, TtsWorkerResponse } from "./tts.protocol";

/**
 * Neural voice worker. Kokoro runs first on WebGPU, then on WASM. If Kokoro
 * cannot start, Piper (also WASM) is the backup. Audio is returned to the main
 * thread as raw samples or a WAV buffer for smooth sentence-by-sentence play.
 */

const scope = self as unknown as {
  postMessage: (message: TtsWorkerResponse, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<TtsWorkerRequest>) => void) | null;
};

const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const PIPER_VOICE = "en_US-hfc_female-medium";

let kokoro: KokoroTTS | null = null;
let backend: TtsBackend | null = null;
let loading: Promise<void> | null = null;
let activeRequestId: number | null = null;
let disposed = false;

function post(message: TtsWorkerResponse, transfer?: Transferable[]): void {
  if (disposed) return;
  if (transfer?.length) scope.postMessage(message, transfer);
  else scope.postMessage(message);
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

function progressMessage(percent: number): string {
  return `Downloading the neural voice… ${Math.max(1, Math.min(99, Math.round(percent)))} percent. It downloads only once.`;
}

function loadKokoroProgress(info: { status?: string; progress?: number }): void {
  if (info.status === "progress" && typeof info.progress === "number") {
    post({ type: "progress", progress: Math.max(0.01, Math.min(0.99, info.progress / 100)), text: progressMessage(info.progress) });
  } else if (info.status === "done") {
    post({ type: "progress", progress: 0.99, text: "Warming up the neural voice…" });
  }
}

async function loadKokoro(): Promise<void> {
  const module = await import("kokoro-js");
  const webGpuAvailable = Boolean((navigator as Navigator & { gpu?: unknown }).gpu);
  if (webGpuAvailable) {
    try {
      kokoro = await module.KokoroTTS.from_pretrained(KOKORO_MODEL, {
        dtype: "fp32",
        device: "webgpu",
        progress_callback: loadKokoroProgress,
      });
      backend = "kokoro-webgpu";
      return;
    } catch (error) {
      console.warn("Kokoro WebGPU failed; trying WASM.", error);
      post({
        type: "progress",
        progress: 0.05,
        text: "The graphics voice path was unavailable. Loading the WASM neural voice…",
      });
    }
  }
  kokoro = await module.KokoroTTS.from_pretrained(KOKORO_MODEL, {
    dtype: "q8",
    device: "wasm",
    progress_callback: loadKokoroProgress,
  });
  backend = "kokoro-wasm";
}

async function loadPiper(): Promise<void> {
  const vits = await import("@diffusionstudio/vits-web");
  await vits.download(PIPER_VOICE as Parameters<typeof vits.download>[0], (progress) => {
    const fraction = progress.total > 0 ? progress.loaded / progress.total : 0;
    post({
      type: "progress",
      progress: Math.max(0.01, Math.min(0.99, fraction)),
      text: progressMessage(fraction * 100),
    });
  });
  backend = "piper";
}

async function ensureLoaded(): Promise<void> {
  if (backend) return;
  if (loading) return loading;
  post({ type: "progress", progress: 0.01, text: "Starting the neural voice…" });
  loading = (async () => {
    try {
      await loadKokoro();
    } catch (error) {
      console.warn("Kokoro failed; trying Piper.", error);
      post({
        type: "progress",
        progress: 0.02,
        text: "The primary neural voice could not start. Loading the Piper WASM backup…",
      });
      await loadPiper();
    }
    post({
      type: "ready",
      backend: backend ?? "kokoro-wasm",
      message:
        backend === "piper"
          ? "The Piper neural voice is ready and running on this device."
          : "The Kokoro neural voice is ready and running on this device.",
    });
  })()
    .catch((error) => {
      backend = null;
      post({
        type: "error",
        message: `The neural voice could not start. ${describeError(error)}`,
        fatal: true,
      });
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

async function speakKokoro(request: Extract<TtsWorkerRequest, { type: "speak" }>): Promise<void> {
  if (!kokoro) return;
  const voice = (request.voice ?? "af_heart") as GenerateOptions["voice"];
  const audio = await kokoro.generate(request.text, {
    voice,
    speed: request.speed ?? 0.95,
  });
  if (activeRequestId !== request.requestId) return;
  const copy = new Float32Array(audio.audio);
  post(
    {
      type: "audio",
      requestId: request.requestId,
      samples: copy,
      sampleRate: audio.sampling_rate,
      text: request.text,
    },
    [copy.buffer],
  );
}

async function speakPiper(request: Extract<TtsWorkerRequest, { type: "speak" }>): Promise<void> {
  const vits = await import("@diffusionstudio/vits-web");
  const blob = await vits.predict(
    { text: request.text, voiceId: PIPER_VOICE as Parameters<typeof vits.predict>[0]["voiceId"] },
    (progress) => {
      if (progress.total > 0) {
        post({
          type: "progress",
          progress: Math.max(0.01, Math.min(0.99, progress.loaded / progress.total)),
          text: "Generating the spoken answer on this device…",
        });
      }
    },
  );
  if (activeRequestId !== request.requestId) return;
  const buffer = await blob.arrayBuffer();
  if (activeRequestId !== request.requestId) return;
  post({ type: "wav", requestId: request.requestId, buffer, text: request.text }, [buffer]);
}

async function handleSpeak(request: Extract<TtsWorkerRequest, { type: "speak" }>): Promise<void> {
  if (!backend) await ensureLoaded();
  if (!backend) {
    post({ type: "error", message: "The neural voice is not ready.", fatal: true });
    return;
  }
  activeRequestId = request.requestId;
  try {
    if (backend === "piper") await speakPiper(request);
    else await speakKokoro(request);
    if (activeRequestId === request.requestId) {
      post({ type: "done", requestId: request.requestId });
      activeRequestId = null;
    }
  } catch (error) {
    if (activeRequestId === request.requestId) {
      post({ type: "error", message: describeError(error), fatal: true });
      activeRequestId = null;
    }
  }
}

scope.onmessage = (event: MessageEvent<TtsWorkerRequest>) => {
  const request = event.data;
  if (!request || typeof request !== "object") return;
  switch (request.type) {
    case "load":
      void ensureLoaded();
      break;
    case "speak":
      void handleSpeak(request);
      break;
    case "cancel":
      if (activeRequestId === request.requestId) activeRequestId = null;
      break;
    case "unload":
      disposed = true;
      kokoro = null;
      backend = null;
      break;
    default:
      break;
  }
};
