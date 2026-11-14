import type { TextToSpeech } from "../speech/useTextToSpeech";
import { SpeakerIcon } from "./Icons";

interface AudioToggleProps {
  tts: TextToSpeech;
  onToggle: () => void;
}

export function AudioToggle({ tts, onToggle }: AudioToggleProps) {
  const loading = tts.state.status === "loading";
  const description = !tts.supported
    ? "Voice is unavailable in this browser. All information remains available as text."
    : tts.enabled
      ? "Voice is on. Results and answers are read aloud. Activate to mute and stop speech."
      : "Voice is off. Activate to resume the neural voice.";
  return (
    <div className="audio-dock">
      <button
        type="button"
        className={`audio-toggle ${tts.enabled ? "is-on" : ""} ${tts.speaking ? "is-speaking" : ""} ${loading ? "is-loading" : ""}`}
        aria-pressed={tts.supported ? tts.enabled : undefined}
        aria-label={description}
        aria-disabled={!tts.supported || undefined}
        onClick={() => {
          if (!tts.supported) return;
          onToggle();
        }}
        title={description}
      >
        <span className="audio-icon-wrap">
          <SpeakerIcon width={19} height={19} muted={!tts.enabled} />
          {loading && <span className="audio-loading-ring" aria-hidden="true" />}
          {tts.speaking && <span className="audio-waves" aria-hidden="true" />}
        </span>
      </button>
    </div>
  );
}
