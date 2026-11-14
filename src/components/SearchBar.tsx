import { useEffect, useRef, type FormEvent, type RefObject } from "react";
import { useSpeechRecognition } from "../speech/useSpeechRecognition";
import { HoldToTalkButton } from "./HoldToTalkButton";
import { ArrowRightIcon, SearchIcon } from "./Icons";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (query: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  searching?: boolean;
}

export function SearchBar({ value, onChange, onSearch, inputRef, searching }: SearchBarProps) {
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  const speech = useSpeechRecognition((transcript) => {
    onChange(transcript);
    onSearch(transcript);
  });

  useEffect(() => {
    if (!speech.error) return;
    const timer = window.setTimeout(() => speech.clearError(), 9000);
    return () => window.clearTimeout(timer);
  }, [speech.error, speech]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const query = value.trim();
    if (!query) {
      ref.current?.focus();
      return;
    }
    onSearch(query);
  };

  return (
    <div className="search-dock">
      {(speech.listening || speech.interim) && (
        <div className="voice-live" aria-live="polite">
          <span className="voice-live-dot" aria-hidden="true" />
          <span>{speech.interim || "Listening… speak now, then release."}</span>
        </div>
      )}
      <form className="search-form" role="search" aria-label="Search the universe" onSubmit={submit}>
        <span className="search-leading" aria-hidden="true">
          <SearchIcon width={22} height={22} />
        </span>
        <label htmlFor="universe-search" className="visually-hidden">
          Search for a place or phenomenon in the universe
        </label>
        <input
          ref={ref}
          id="universe-search"
          className="search-input"
          type="search"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            if (speech.error) speech.clearError();
          }}
          placeholder="Search the universe — try “solar eclipse”"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={120}
          aria-describedby="search-hint"
        />
        <HoldToTalkButton
          supported={speech.supported}
          listening={speech.listening}
          onStart={speech.start}
          onStop={speech.stop}
          onToggle={speech.listening ? speech.stop : speech.start}
          idleLabel="Hold to speak your search"
          listeningLabel="Listening for your search. Release to stop."
          className="mic-button--search"
          describedBy="voice-help"
        />
        <button
          type="submit"
          className="search-submit"
          aria-label="Search"
          aria-busy={searching || undefined}
        >
          {searching ? <span className="spinner" aria-hidden="true" /> : <ArrowRightIcon width={22} height={22} />}
        </button>
      </form>
      <p id="search-hint" className="visually-hidden">
        Search for a place, mission, or natural phenomenon. Press the slash key from anywhere to focus this field.
      </p>
      <span className="visually-hidden" role="status">
        {searching ? "Searching NASA's archive." : ""}
      </span>
      <p id="voice-help" className="visually-hidden">
        Voice input: hold the microphone button, speak your search, then release. Keyboard users can hold Space or Enter
        on the microphone. Screen readers can activate the button once to start and again to stop.
      </p>
      {speech.error && (
        <p className="inline-error" role="alert">
          {speech.error}
        </p>
      )}
    </div>
  );
}
