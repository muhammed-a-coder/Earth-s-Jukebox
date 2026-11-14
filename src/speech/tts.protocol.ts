/** Message contract between the UI thread and the neural voice worker. */

export type TtsWorkerRequest =
  | { type: "load"; requestId: number }
  | {
      type: "speak";
      requestId: number;
      text: string;
      voice?: string;
      speed?: number;
    }
  | { type: "cancel"; requestId: number }
  | { type: "unload" };

export type TtsBackend = "kokoro-webgpu" | "kokoro-wasm" | "piper";

export type TtsWorkerResponse =
  | {
      type: "progress";
      progress: number;
      text: string;
    }
  | {
      type: "ready";
      backend: TtsBackend;
      message: string;
    }
  | {
      type: "audio";
      requestId: number;
      samples: Float32Array;
      sampleRate: number;
      text: string;
    }
  | {
      type: "wav";
      requestId: number;
      buffer: ArrayBuffer;
      text: string;
    }
  | {
      type: "done";
      requestId: number;
    }
  | {
      type: "error";
      message: string;
      fatal?: boolean;
    };

export const TTS_MODEL_NOTE =
  "Kokoro, a neural voice, downloads once and runs in a Web Worker on this device. A Piper WASM voice is the backup.";
