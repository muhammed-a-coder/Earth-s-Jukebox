import { useRef, type MouseEvent, type PointerEvent, type KeyboardEvent } from "react";
import { MicIcon } from "./Icons";

interface HoldToTalkProps {
  supported: boolean;
  listening: boolean;
  onStart: () => void;
  onStop: () => void;
  onToggle: () => void;
  idleLabel: string;
  listeningLabel?: string;
  className?: string;
  describedBy?: string;
}

export function HoldToTalkButton({
  supported,
  listening,
  onStart,
  onStop,
  onToggle,
  idleLabel,
  listeningLabel = "Listening. Activate again to stop.",
  className,
  describedBy,
}: HoldToTalkProps) {
  const suppressClick = useRef(false);
  const pointerActive = useRef(false);

  if (!supported) return null;

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    suppressClick.current = true;
    pointerActive.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onStart();
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (!pointerActive.current) return;
    pointerActive.current = false;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onStop();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (event.repeat) return;
    suppressClick.current = true;
    onStart();
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    onStop();
  };

  const handleClick = (_event: MouseEvent<HTMLButtonElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onToggle();
  };

  return (
    <button
      type="button"
      className={`mic-button ${listening ? "is-listening" : ""} ${className ?? ""}`.trim()}
      aria-label={listening ? listeningLabel : idleLabel}
      aria-pressed={listening}
      aria-describedby={describedBy}
      title={listening ? "Release or activate again to stop listening" : idleLabel}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onLostPointerCapture={() => {
        if (pointerActive.current) {
          pointerActive.current = false;
          onStop();
        }
      }}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onClick={handleClick}
    >
      <MicIcon width={22} height={22} />
      <span className="mic-ring" aria-hidden="true" />
    </button>
  );
}
