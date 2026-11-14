import type { AiState } from "../types";
import type { TtsModelState } from "../speech/useTextToSpeech";

interface ModelStatusBarProps {
  aiState: AiState;
  ttsState: TtsModelState;
}

export function ModelStatusBar({ aiState, ttsState }: ModelStatusBarProps) {
  const aiLoading = aiState.status === "loading";
  const ttsLoading = ttsState.status === "loading";
  if (!aiLoading && !ttsLoading) return null;
  const percent = (value: number) => Math.max(2, Math.min(100, Math.round(value * 100)));
  return (
    <div className="model-status" role="status" aria-live="polite" aria-label="On-device model downloads">
      <span className="model-status-label">On-device models</span>
      <div className="model-status-items">
        {aiLoading && (
          <div className="model-status-item">
            <span className="model-status-name">AI</span>
            <span className="model-status-track" aria-hidden="true">
              <span style={{ width: `${percent(aiState.progress)}%` }} />
            </span>
            <span className="model-status-percent">{percent(aiState.progress)}%</span>
          </div>
        )}
        {ttsLoading && (
          <div className="model-status-item">
            <span className="model-status-name">Voice</span>
            <span className="model-status-track" aria-hidden="true">
              <span style={{ width: `${percent(ttsState.progress)}%` }} />
            </span>
            <span className="model-status-percent">{percent(ttsState.progress)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
