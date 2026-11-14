/** Message contract between the UI thread and the on-device AI worker. */

export type AiRole = "system" | "user" | "assistant";

export interface AiChatMessage {
  role: AiRole;
  content: string;
}

export interface AiModelChoice {
  id: string;
  label: string;
  /** Approximate download size in megabytes, used only for honest status copy. */
  sizeMb: number;
  tier: "high" | "balanced" | "light" | "wasm";
}

export type AiWorkerRequest =
  | {
      type: "load";
      requestId: number;
      modelId: string;
    }
  | {
      type: "chat";
      requestId: number;
      messages: AiChatMessage[];
      temperature: number;
      maxTokens: number;
    }
  | {
      type: "cancel";
      requestId: number;
    }
  | {
      type: "unload";
    };

export type AiWorkerResponse =
  | {
      type: "progress";
      modelId: string;
      progress: number;
      text: string;
    }
  | {
      type: "loaded";
      modelId: string;
      backend: "webllm" | "transformers-wasm";
    }
  | {
      type: "load-error";
      modelId: string;
      message: string;
      unsupported?: boolean;
    }
  | {
      type: "delta";
      requestId: number;
      text: string;
    }
  | {
      type: "done";
      requestId: number;
      text: string;
    }
  | {
      type: "chat-error";
      requestId: number;
      message: string;
    };

/**
 * WebGPU models, largest first. The light model is also the honest fallback if
 * a larger download or the device's GPU memory cannot handle the first choice.
 */
export const AI_MODELS: AiModelChoice[] = [
  {
    id: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 3B",
    sizeMb: 1900,
    tier: "high",
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 1.5B",
    sizeMb: 1000,
    tier: "balanced",
  },
  {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 0.5B",
    sizeMb: 400,
    tier: "light",
  },
  {
    id: "wasm:onnx-community/Qwen2.5-0.5B-Instruct",
    label: "Qwen2.5 0.5B (WASM)",
    sizeMb: 500,
    tier: "wasm",
  },
];

export function pickAiModelCandidates(): AiModelChoice[] {
  const nav = navigator as Navigator & { deviceMemory?: number; gpu?: unknown };
  const memory = nav.deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  const hasWebGpu = Boolean(nav.gpu);
  if (!hasWebGpu) return AI_MODELS.filter((model) => model.tier === "wasm");
  const byTier = (tier: AiModelChoice["tier"]) => AI_MODELS.filter((model) => model.tier === tier);
  const ordered: AiModelChoice[] = [];
  if (memory >= 8 && cores >= 8) ordered.push(...byTier("high"));
  ordered.push(...byTier("balanced"));
  ordered.push(...byTier("light"));
  ordered.push(...byTier("wasm"));
  // Removing duplicates keeps the first (largest viable) choice.
  return ordered.filter((model, index) => ordered.findIndex((entry) => entry.id === model.id) === index);
}
