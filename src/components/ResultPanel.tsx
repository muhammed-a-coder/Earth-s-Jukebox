import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { AiState, ChatMessage, ImageState, NasaImage, Subject, SvsResult } from "../types";
import type { JplTelemetry } from "../data/nasa";
import { buildSources } from "../data/nasa";
import { useSpeechRecognition } from "../speech/useSpeechRecognition";
import { HoldToTalkButton } from "./HoldToTalkButton";
import {
  CloseIcon,
  ExternalIcon,
  InfoIcon,
  PlayIcon,
  SendIcon,
  SparkIcon,
  SpeakerIcon,
} from "./Icons";

interface ResultPanelProps {
  open: boolean;
  subject: Subject;
  imageState: ImageState;
  svs: SvsResult | null;
  jpl: JplTelemetry | null;
  aiState: AiState;
  briefing: string;
  sceneDescription: string;
  briefingSource: "built-in" | "ai";
  fallbackImage: NasaImage | null;
  messages: ChatMessage[];
  chatPending: boolean;
  onClose: () => void;
  onAsk: (question: string) => void;
  onSpeak: (text: string) => void;
  onSpeakScene: () => void;
  onDescribeView: () => void;
  onRetryAi: () => void;
  onReadResult: () => void;
}

function formatArchiveDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(date);
}

export function ResultPanel({
  open,
  subject,
  imageState,
  svs,
  jpl,
  aiState,
  briefing,
  sceneDescription,
  briefingSource,
  fallbackImage,
  messages,
  chatPending,
  onClose,
  onAsk,
  onSpeak,
  onSpeakScene,
  onDescribeView,
  onRetryAi,
  onReadResult,
}: ResultPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [question, setQuestion] = useState("");
  const [useThumb, setUseThumb] = useState(false);
  const [imageSource, setImageSource] = useState<"primary" | "fallback" | "none">("primary");
  const [voiceSubmitLock, setVoiceSubmitLock] = useState(false);

  const chatSpeech = useSpeechRecognition((transcript) => {
    if (voiceSubmitLock || chatPending) return;
    const cleaned = transcript.trim();
    if (!cleaned) return;
    setQuestion("");
    setVoiceSubmitLock(true);
    onAsk(cleaned);
    window.setTimeout(() => setVoiceSubmitLock(false), 400);
  });

  useEffect(() => {
    setUseThumb(false);
    setImageSource("primary");
  }, [imageState.image?.url, fallbackImage?.url]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (panel) panel.scrollTop = 0;
    const timer = window.setTimeout(() => headingRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, [open, subject.id, subject.query]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, chatPending]);

  useEffect(() => {
    if (chatSpeech.interim) setQuestion(chatSpeech.interim);
  }, [chatSpeech.interim]);

  useEffect(() => {
    if (!chatSpeech.error) return;
    const timer = window.setTimeout(() => chatSpeech.clearError(), 9000);
    return () => window.clearTimeout(timer);
  }, [chatSpeech.error]);

  const sources = useMemo(() => {
    const list = buildSources(subject);
    if (imageState.image) {
      list.unshift({
        label: "This NASA photograph",
        url: imageState.image.pageUrl,
        note: `${imageState.image.title} — ${imageState.image.credit}`,
      });
    }
    return list;
  }, [subject, imageState.image]);

  const submitQuestion = (event: FormEvent) => {
    event.preventDefault();
    const value = question.trim();
    if (!value || chatPending) return;
    setQuestion("");
    chatSpeech.clearError();
    onAsk(value);
  };

  const handleAskFromChip = (value: string) => {
    if (chatPending) return;
    setQuestion("");
    onAsk(value);
  };

  const primaryImage = imageState.image;
  const activeImage =
    imageSource === "primary"
      ? primaryImage
      : imageSource === "fallback"
        ? fallbackImage
        : null;
  const activeUrl = activeImage
    ? useThumb && imageSource === "primary"
      ? activeImage.thumbUrl
      : activeImage.url
    : "/nasa-fallback-space.jpg";
  const captionTitle = activeImage?.title ?? "NASA archive imagery";
  const captionCredit = activeImage?.credit ?? "NASA";
  const captionDate = formatArchiveDate(activeImage?.date ?? "");
  const pendingMessage = messages.find((message) => message.pending);
  const showThinking = chatPending && (!pendingMessage || pendingMessage.content === "Thinking about that…" || !pendingMessage.content);
  const spokenBriefing =
    briefingSource === "ai" ? "AI briefing. " : "Built-in briefing. ";
  const aiBadge =
    briefingSource === "ai"
      ? "AI briefing"
      : aiState.status === "ready"
        ? "Built-in briefing · AI version pending"
        : "Built-in briefing";

  return (
    <section
      ref={panelRef}
      className={`result-panel ${open ? "is-open" : ""}`}
      role="region"
      aria-labelledby="result-title"
      aria-hidden={!open}
      hidden={!open}
    >
      <div className="panel-surface">
        <div className="panel-topbar">
          <span className="eyebrow">
            <span className="eyebrow-dot" aria-hidden="true" />
            {subject.category}
          </span>
          <div className="topbar-actions">
            <button type="button" className="icon-text-button" onClick={onReadResult}>
              <PlayIcon width={18} height={18} />
              <span>Read result</span>
            </button>
            <button type="button" className="icon-text-button" onClick={onClose} aria-label="Close result panel">
              <CloseIcon width={18} height={18} />
              <span>Close</span>
            </button>
          </div>
        </div>

        <header className="result-header">
          <h2 id="result-title" ref={headingRef} tabIndex={-1} className="result-title">
            {subject.title}
          </h2>
          <p className="result-query">
            NASA archive search: <span>“{subject.query || subject.title}”</span>
          </p>
        </header>

        <figure className="result-figure" aria-busy={imageState.status === "loading" || undefined}>
          <img
            src={activeUrl}
            alt={`NASA photograph: ${captionTitle}`}
            className="result-image"
            onError={() => {
              if (imageSource === "primary") {
                if (!useThumb && primaryImage && primaryImage.thumbUrl !== primaryImage.url) {
                  setUseThumb(true);
                  return;
                }
                setImageSource(fallbackImage ? "fallback" : "none");
              } else if (imageSource === "fallback") {
                setImageSource("none");
              }
            }}
            referrerPolicy="no-referrer"
          />
          {imageState.status === "loading" && (
            <div className="image-skeleton" role="status">
              <span className="skeleton-orbit" aria-hidden="true" />
              <span>Looking through NASA's image archive…</span>
            </div>
          )}
          <figcaption className="image-caption">
            <span>{captionTitle}</span>
            <span className="image-credit">
              {captionCredit}
              {captionDate ? ` · ${captionDate}` : ""}
            </span>
          </figcaption>
          {activeImage && imageSource !== "none" && (
            <a className="image-link" href={activeImage.pageUrl} target="_blank" rel="noopener noreferrer">
              Open in NASA Images <ExternalIcon width={14} height={14} />
            </a>
          )}
        </figure>

        <section className="facts-block" aria-labelledby="facts-heading">
          <h3 id="facts-heading">Key facts</h3>
          <dl className="facts-list">
            {subject.facts.map((fact) => (
              <div className="fact" key={`${fact.label}-${fact.value.slice(0, 20)}`}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
            {jpl?.distance && (
              <div className="fact fact--live">
                <dt>Live from JPL Horizons</dt>
                <dd>
                  Today this world is about {jpl.distance}. Measured {formatArchiveDate(jpl.date)}. JPL's API normally
                  blocks browser reads; this value appears only when the live request succeeds.
                </dd>
              </div>
            )}
          </dl>
        </section>

        <section className="scene-block" aria-labelledby="scene-heading">
          <div className="section-heading-row">
            <h3 id="scene-heading">On screen</h3>
          </div>
          <p className="scene-description">{sceneDescription}</p>
          <div className="button-row">
            <button type="button" className="soft-button" onClick={onSpeakScene}>
              <SpeakerIcon width={17} height={17} />
              Read scene aloud
            </button>
            <button type="button" className="soft-button" onClick={onDescribeView}>
              <InfoIcon width={17} height={17} />
              Describe the view
            </button>
          </div>
        </section>

        <section className="briefing-block" aria-labelledby="briefing-heading">
          <div className="section-heading-row">
            <h3 id="briefing-heading">Briefing</h3>
            <span className={`source-badge ${briefingSource === "ai" ? "source-badge--ai" : ""}`}>
              {briefingSource === "ai" && <SparkIcon width={13} height={13} />}
              {aiBadge}
            </span>
          </div>
          <p className="briefing-text">{briefing}</p>
          <div className="button-row">
            <button type="button" className="soft-button" onClick={() => onSpeak(`${spokenBriefing}${briefing}`)}>
              <SpeakerIcon width={17} height={17} />
              Read briefing
            </button>
            {aiState.status === "loading" && (
              <span className="ai-inline-status" role="status">
                Writing an AI version on this device… {Math.round(aiState.progress * 100)}%
              </span>
            )}
          </div>
        </section>

        <div className={`ai-status ai-status--${aiState.status}`} aria-live="polite">
          <div className="ai-status-head">
            <span className="ai-status-dot" aria-hidden="true" />
            <strong>
              {aiState.status === "ready"
                ? "On-device AI ready"
                : aiState.status === "loading"
                  ? "On-device AI is loading"
                  : aiState.status === "unsupported"
                    ? "AI is unavailable in this browser"
                    : aiState.status === "error"
                      ? "AI could not start"
                      : "On-device AI"}
            </strong>
            {aiState.status === "ready" && (
              <span className="ai-model">{aiState.modelLabel ?? "Local model"} · private</span>
            )}
            {(aiState.status === "error" || aiState.status === "unsupported") && (
              <button type="button" className="link-button" onClick={onRetryAi}>
                Try again
              </button>
            )}
          </div>
          <p>{aiState.message}</p>
          {aiState.status === "loading" && (
            <div
              className="progress-track"
              role="progressbar"
              aria-label="On-device AI model download progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(aiState.progress * 100)}
            >
              <span style={{ width: `${Math.max(2, Math.round(aiState.progress * 100))}%` }} />
            </div>
          )}
        </div>

        <section className="chat-block" aria-labelledby="chat-heading">
          <div className="section-heading-row">
            <h3 id="chat-heading">Ask a follow-up</h3>
            <span className="source-badge">
              {chatPending ? "thinking…" : aiState.status === "ready" ? "on-device AI" : "built-in guide"}
            </span>
          </div>

          {messages.length <= 1 && (
            <div className="suggested-questions" aria-label="Suggested questions">
              {subject.suggestedQuestions.map((suggestion) => (
                <button
                  type="button"
                  key={suggestion}
                  className="suggestion-chip"
                  onClick={() => handleAskFromChip(suggestion)}
                  disabled={chatPending}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <div className="chat-log" role="log" aria-live="polite" aria-relevant="additions text" aria-label="Conversation">
            {messages.map((message) => {
              if (message.pending && showThinking) return null;
              return (
                <article key={message.id} className={`chat-message chat-message--${message.role}`}>
                  <div className="chat-meta">
                    <span>
                      {message.role === "user"
                        ? "You"
                        : message.source === "ai"
                          ? "Earth Jukebox · on-device AI"
                          : message.source === "nasa"
                            ? "Earth Jukebox · NASA"
                            : "Earth Jukebox · built-in guide"}
                    </span>
                    {message.role === "assistant" && !message.pending && (
                      <button
                        type="button"
                        className="inline-speak"
                        onClick={() => onSpeak(message.content)}
                        aria-label="Read this answer aloud"
                      >
                        <SpeakerIcon width={14} height={14} />
                        <span className="visually-hidden">Read this answer aloud</span>
                      </button>
                    )}
                  </div>
                  <p>{message.content}</p>
                </article>
              );
            })}
            {showThinking && (
              <div className="chat-thinking" role="status">
                <span className="thinking-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span>Earth Jukebox is thinking</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {(chatSpeech.listening || chatSpeech.interim) && (
            <p className="chat-listening" aria-live="polite">
              <span className="voice-live-dot" aria-hidden="true" />
              {chatSpeech.interim || "Listening… release when you finish speaking."}
            </p>
          )}
          {chatSpeech.error && (
            <p className="inline-error" role="alert">
              {chatSpeech.error}
            </p>
          )}

          <form className="chat-form" onSubmit={submitQuestion}>
            <label htmlFor="chat-question" className="visually-hidden">
              Ask a follow-up question about {subject.title}
            </label>
            <input
              id="chat-question"
              className="chat-input"
              type="text"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={`Ask about ${subject.title}…`}
              autoComplete="off"
              maxLength={280}
              disabled={chatPending}
              aria-describedby="chat-voice-help"
            />
            <HoldToTalkButton
              supported={chatSpeech.supported}
              listening={chatSpeech.listening}
              onStart={() => {
                if (!chatPending) chatSpeech.start();
              }}
              onStop={chatSpeech.stop}
              onToggle={chatSpeech.listening ? chatSpeech.stop : chatSpeech.start}
              idleLabel="Hold to ask a question by voice"
              listeningLabel="Listening for your question. Release to stop."
              className="mic-button--chat"
              describedBy="chat-voice-help"
            />
            <button
              type="submit"
              className="chat-send"
              aria-label="Send question"
              disabled={chatPending || !question.trim()}
            >
              <SendIcon width={19} height={19} />
            </button>
          </form>
          <p id="chat-voice-help" className="visually-hidden">
            Hold the microphone, speak your question, and release. Keyboard users can hold Space or Enter. Screen readers
            can activate the button once to start and again to stop.
          </p>
        </section>

        <section className="sources-block" aria-labelledby="sources-heading">
          <h3 id="sources-heading">Sources & further exploration</h3>
          <ul className="sources-list">
            {svs && (
              <li>
                <a href={svs.url} target="_blank" rel="noopener noreferrer">
                  NASA SVS: {svs.title} <ExternalIcon width={14} height={14} />
                </a>
                <p>{svs.description || "A NASA Scientific Visualization Studio production."}</p>
              </li>
            )}
            {sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.label} <ExternalIcon width={14} height={14} />
                </a>
                {source.note && <p>{source.note}</p>}
              </li>
            ))}
          </ul>
          <p className="data-note">
            NASA imagery and descriptions are loaded live at runtime. Earth textures come from NASA GIBS. Bathymetry,
            cloud, and city-light images are visualizations, not photographs of a single moment.
          </p>
        </section>

        <p className="panel-credit">
          Earth Jukebox is an independent NASA Space Apps 2026 concept. It is not an official NASA product.
        </p>
      </div>
    </section>
  );
}
