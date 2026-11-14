import { useCallback, useEffect, useRef, useState } from "react";
import type { AiState, ChatMessage, ImageState, NasaImage, ScenePlan, Subject, SvsResult } from "./types";
import type { SceneEngine } from "./three/SceneEngine";
import type { AiGrounding } from "./ai/localAi";
import type { JplTelemetry } from "./data/nasa";
import {
  fallbackImageForSubject,
  fetchJplTelemetry,
  searchNasaImage,
  searchNasaSvs,
  searchScienceImage,
} from "./data/nasa";
import { resolveSubject, SEARCH_SUGGESTIONS } from "./data/topics";
import { localAi } from "./ai/localAi";
import { buildFallbackAnswer, buildSearchAnnouncement, buildSpeechText } from "./ai/localGuide";
import { useTextToSpeech } from "./speech/useTextToSpeech";
import { SceneView } from "./components/SceneView";
import { SearchBar } from "./components/SearchBar";
import { ResultPanel } from "./components/ResultPanel";
import { AudioToggle } from "./components/AudioToggle";
import { ModelStatusBar } from "./components/ModelStatusBar";
import { AboutPage } from "./components/AboutPage";
import { InfoIcon, OrbitIcon, SparkIcon } from "./components/Icons";

const DEFAULT_PLAN: ScenePlan = { type: "earth" };
const DEFAULT_SCENE_DESCRIPTION =
  "A realistic Earth turns slowly in the center of a dark star field. Sunlight catches the oceans and clouds on one side while the night side glows with city lights. The camera circles slowly, so the day and night hemispheres take turns facing you.";
const DEFAULT_VIEW =
  "You are looking at Earth from a constant distance. The camera circles automatically; hold and drag the scene, or hold the left and right arrow keys, to scrub along the orbit.";

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || element.isContentEditable;
}

export default function App() {
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState<Subject | null>(null);
  const subjectRef = useRef<Subject | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [imageState, setImageState] = useState<ImageState>({ status: "loading", image: null });
  const [svs, setSvs] = useState<SvsResult | null>(null);
  const [jpl, setJpl] = useState<JplTelemetry | null>(null);
  const [searching, setSearching] = useState(false);
  const [briefing, setBriefing] = useState("");
  const [sceneDescription, setSceneDescription] = useState("");
  const [briefingSource, setBriefingSource] = useState<"built-in" | "ai">("built-in");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatPending, setChatPending] = useState(false);
  const [aiState, setAiState] = useState<AiState>(localAi.getState());
  const [announcement, setAnnouncement] = useState({ id: 0, text: "" });
  const [scenePulse, setScenePulse] = useState(0);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutReturnFocus, setAboutReturnFocus] = useState<HTMLElement | null>(null);

  const engineRef = useRef<SceneEngine | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const aboutButtonRef = useRef<HTMLButtonElement>(null);
  const searchSeq = useRef(0);
  const imageDescriptionRef = useRef("");
  const svsRef = useRef<SvsResult | null>(null);
  const jplRef = useRef<JplTelemetry | null>(null);
  const enhancedForRef = useRef<string | null>(null);
  const searchBusyTimer = useRef<number | null>(null);

  const tts = useTextToSpeech();
  const ttsRef = useRef(tts);
  ttsRef.current = tts;

  const buildGrounding = useCallback((): AiGrounding => ({
    nasaDescription: imageDescriptionRef.current,
    nasaSvsTitle: svsRef.current?.title,
    nasaSvsDescription: svsRef.current?.description,
    jplDistance: jplRef.current?.distance,
    viewDescription: engineRef.current?.describeView(),
  }), []);

  const announce = useCallback((text: string) => {
    setAnnouncement((current) => ({ id: current.id + 1, text }));
  }, []);

  const handleEngine = useCallback((engine: SceneEngine | null) => {
    engineRef.current = engine;
  }, []);

  useEffect(() => {
    localAi.setListener(setAiState);
    return () => localAi.setListener(null);
  }, []);

  useEffect(() => {
    const syncHash = () => {
      const about = window.location.hash === "#about";
      setAboutOpen(about);
      if (about) {
        setAboutReturnFocus(document.activeElement instanceof HTMLElement ? document.activeElement : null);
      }
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("popstate", syncHash);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("popstate", syncHash);
    };
  }, []);

  useEffect(() => {
    if (aiState.status !== "ready" || !subject || !panelOpen) return;
    if (imageState.status === "loading") return;
    const seq = searchSeq.current;
    const key = `${subject.id}:${subject.query}:${seq}:${imageState.status}`;
    if (enhancedForRef.current === key) return;
    enhancedForRef.current = key;
    let cancelled = false;
    void localAi.enhanceBriefing(subject, buildGrounding()).then((enhancement) => {
      if (cancelled || !enhancement || seq !== searchSeq.current) return;
      setBriefing(enhancement.briefing);
      if (enhancement.sceneDescription) setSceneDescription(enhancement.sceneDescription);
      setBriefingSource("ai");
      announce(`An on-device AI briefing is ready for ${subject.title}. Press Read briefing to hear it.`);
    });
    return () => {
      cancelled = true;
    };
  }, [aiState.status, subject, panelOpen, imageState.status, buildGrounding, announce]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (aboutOpen) {
          closeAbout();
          return;
        }
        if (panelOpen) {
          closePanel();
          return;
        }
      }
      if (event.key === "/" && !aboutOpen && !isTypingTarget(event.target) && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    return () => {
      if (searchBusyTimer.current) window.clearTimeout(searchBusyTimer.current);
    };
  }, []);

  const speakResult = (current: Subject, currentBriefing: string, currentScene: string) => {
    tts.speak(buildSpeechText(current, currentBriefing, currentScene));
  };

  const handleSearch = (rawQuery: string) => {
    const cleaned = rawQuery.trim();
    if (!cleaned) return;
    const nextSubject = resolveSubject(cleaned, new Date());
    const seq = searchSeq.current + 1;
    searchSeq.current = seq;
    subjectRef.current = nextSubject;
    imageDescriptionRef.current = "";
    svsRef.current = null;
    jplRef.current = null;
    enhancedForRef.current = null;

    localAi.cancel();
    setQuery(cleaned);
    setSubject(nextSubject);
    setPanelOpen(true);
    setImageState({ status: "loading", image: null });
    setSvs(null);
    setJpl(null);
    setBriefing(nextSubject.briefing);
    setSceneDescription(nextSubject.sceneDescription);
    setBriefingSource("built-in");
    setChatPending(false);
    setMessages([
      {
        id: makeId(),
        role: "assistant",
        source: "fallback",
        content: `You're exploring ${nextSubject.title}. Ask me anything about it, or choose a suggested question below.`,
      },
    ]);
    setScenePulse((value) => value + 1);
    setSearching(true);
    if (searchBusyTimer.current) window.clearTimeout(searchBusyTimer.current);
    searchBusyTimer.current = window.setTimeout(() => setSearching(false), 1200);

    const announcementText = buildSearchAnnouncement(nextSubject);
    announce(announcementText);
    // A new search interrupts the current sentence immediately and starts the
    // new result in the neural voice (or the installed fallback while it loads).
    speakResult(nextSubject, nextSubject.briefing, nextSubject.sceneDescription);

    void localAi.load();

    void (async () => {
      let image = await searchNasaImage(nextSubject.nasaQuery);
      if (seq !== searchSeq.current) return;
      if (image) {
        imageDescriptionRef.current = image.description;
        setImageState({ status: "ready", image });
        announce(`NASA photograph loaded: ${image.title}.`);
        return;
      }
      image = await searchScienceImage(nextSubject.nasaQuery);
      if (seq !== searchSeq.current) return;
      if (image) {
        imageDescriptionRef.current = image.description;
        setImageState({ status: "ready", image });
        announce(`NASA Science photograph loaded: ${image.title}.`);
        return;
      }
      const fallback = fallbackImageForSubject(nextSubject);
      imageDescriptionRef.current = fallback.description;
      setImageState({ status: "ready", image: fallback });
      announce(`Showing a real NASA image of ${nextSubject.title}.`);
    })();

    void searchNasaSvs(nextSubject.svsQuery ?? nextSubject.nasaQuery).then((result) => {
      if (seq !== searchSeq.current) return;
      svsRef.current = result;
      setSvs(result);
    });

    if (nextSubject.horizonsTarget) {
      void fetchJplTelemetry(nextSubject.horizonsTarget).then((telemetry) => {
        if (seq !== searchSeq.current) return;
        jplRef.current = telemetry;
        setJpl(telemetry);
      });
    }
  };

  const closePanel = () => {
    setPanelOpen(false);
    tts.stop();
    window.setTimeout(() => searchInputRef.current?.focus(), 60);
  };

  const reopenPanel = () => {
    if (!subjectRef.current) return;
    setPanelOpen(true);
  };

  const openAbout = () => {
    setAboutReturnFocus(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (window.location.hash !== "#about") {
      window.history.pushState({ about: true }, "", "#about");
    }
    setAboutOpen(true);
    tts.stop();
  };

  const closeAbout = () => {
    setAboutOpen(false);
    if (window.location.hash === "#about") {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    tts.stop();
    window.setTimeout(() => {
      if (aboutReturnFocus?.isConnected) aboutReturnFocus.focus();
      else aboutButtonRef.current?.focus();
    }, 50);
  };

  const handleAsk = async (question: string) => {
    const current = subjectRef.current;
    const trimmed = question.trim();
    if (!current || !trimmed) return;

    const navigateMatch = trimmed.match(/^(?:show(?:\s+me)?|take\s+me\s+to|go\s+to|switch\s+to|search(?:\s+for)?)\s+(.+)$/i);
    if (navigateMatch) {
      const destination = resolveSubject(navigateMatch[1], new Date());
      if (!destination.closestMatch && destination.id !== current.id) {
        announce(`Switching the scene to ${destination.title}.`);
        handleSearch(navigateMatch[1]);
        return;
      }
    }

    const seq = searchSeq.current;
    const history = messages
      .filter((message) => !message.pending && message.role && message.content)
      .map((message) => ({ role: message.role, content: message.content }));
    const fallback = buildFallbackAnswer(
      current,
      trimmed,
      imageDescriptionRef.current,
      engineRef.current?.describeView() ?? DEFAULT_VIEW,
    );
    const pendingId = makeId();
    setMessages((previous) => [
      ...previous,
      { id: makeId(), role: "user", content: trimmed },
      { id: pendingId, role: "assistant", content: "Thinking about that…", source: "fallback", pending: true },
    ]);
    setChatPending(true);

    let answer = fallback;
    let source: "ai" | "fallback" = "fallback";
    try {
      if (aiState.status === "ready") {
        const aiAnswer = await localAi.streamAnswer(
          current,
          history,
          trimmed,
          buildGrounding(),
          (partial) => {
            if (seq !== searchSeq.current) return;
            setMessages((previous) =>
              previous.map((message) =>
                message.id === pendingId
                  ? { ...message, role: "assistant", content: partial, source: "ai", pending: true }
                  : message,
              ),
            );
          },
        );
        if (aiAnswer) {
          answer = aiAnswer;
          source = "ai";
        }
      } else {
        void localAi.load();
      }
    } catch (error) {
      console.warn("Chat failed", error);
    }

    if (seq !== searchSeq.current) {
      return;
    }
    setMessages((previous) =>
      previous.map((message) =>
        message.id === pendingId
          ? { id: message.id, role: "assistant", content: answer, source, pending: false }
          : message,
      ),
    );
    setChatPending(false);
    ttsRef.current.speak(answer);
  };

  const handleRetryAi = () => {
    void localAi.retry();
  };

  const handleSpeakScene = () => {
    const current = subjectRef.current;
    if (!current) return;
    const text = `${current.title}. On screen: ${sceneDescription}. ${engineRef.current?.describeView() ?? ""}`;
    announce(text);
    tts.speak(text);
  };

  const handleDescribeView = () => {
    const current = subjectRef.current;
    const view = engineRef.current?.describeView() ?? DEFAULT_VIEW;
    const text = current ? `${sceneDescription} ${view}` : `${DEFAULT_SCENE_DESCRIPTION} ${view}`;
    announce(text);
    ttsRef.current.speak(text);
  };

  const handleReadResult = () => {
    const current = subjectRef.current;
    if (!current) return;
    speakResult(current, briefing, sceneDescription);
  };

  const handleAudioToggle = () => {
    if (!tts.supported) {
      announce("Speech is not supported in this browser. All information remains available as text.");
      return;
    }
    if (tts.enabled) {
      tts.setEnabled(false);
      announce("Voice muted and stopped. Activate the speaker again to resume.");
    } else {
      tts.setEnabled(true);
      announce("Voice on. Results and answers will be read aloud.");
    }
  };

  const handleSuggestion = (suggestion: string) => {
    setQuery(suggestion);
    handleSearch(suggestion);
  };

  const scenePlan = subject?.scene ?? DEFAULT_PLAN;
  const hasPanel = Boolean(panelOpen && subject);
  const panelFallback: NasaImage | null = subject ? fallbackImageForSubject(subject) : null;

  return (
    <div className={`app-shell ${hasPanel ? "has-panel" : ""}`}>
      <a
        className="skip-link"
        href="#universe-search"
        onClick={(event) => {
          event.preventDefault();
          searchInputRef.current?.focus();
        }}
      >
        Skip to search
      </a>

      <SceneView plan={scenePlan} onEngine={handleEngine} />
      {scenePulse > 0 && <div className="scene-warp" key={`warp-${scenePulse}`} aria-hidden="true" />}

      <header className="site-header">
        <div className="brand" aria-label="Earth Jukebox">
          <span className="brand-mark" aria-hidden="true">
            <OrbitIcon width={30} height={30} />
          </span>
          <span className="brand-text">
            <span className="brand-name">Earth Jukebox</span>
            <span className="brand-sub">A voice-first tour of the universe</span>
          </span>
        </div>
        <div className="header-actions">
          <span className="live-badge">
            <span className="live-dot" aria-hidden="true" />
            NASA data · live
          </span>
          {subject && !panelOpen && (
            <button type="button" className="header-button" onClick={reopenPanel} aria-controls="result-region">
              <SparkIcon width={17} height={17} />
              <span>Reopen {subject.title}</span>
            </button>
          )}
          <button
            ref={aboutButtonRef}
            type="button"
            className="header-button"
            onClick={openAbout}
            aria-expanded={aboutOpen}
            aria-controls="about-page"
          >
            <InfoIcon width={17} height={17} />
            <span>About</span>
          </button>
        </div>
      </header>

      <main className="explore-main">
        <h1 className="visually-hidden">
          Earth Jukebox — a voice-first way to explore NASA's universe, Earth, and beyond.
        </h1>
        <p className="visually-hidden" id="opening-scene-description">
          {DEFAULT_SCENE_DESCRIPTION}
        </p>

        {!hasPanel && (
          <div className="landing">
            <p className="landing-kicker">
              <span className="eyebrow-dot" aria-hidden="true" />
              Search a world. Hear its story.
            </p>
            <div className="landing-suggestions" aria-label="Suggested searches">
              <span className="suggestions-label" aria-hidden="true">
                Start with
              </span>
              {SEARCH_SUGGESTIONS.slice(0, 6).map((suggestion) => (
                <button
                  type="button"
                  key={suggestion}
                  className="landing-chip"
                  onClick={() => handleSuggestion(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      <div className="bottom-ui">
        <ModelStatusBar aiState={aiState} ttsState={tts.state} />
        <SearchBar
          value={query}
          onChange={setQuery}
          onSearch={handleSearch}
          inputRef={searchInputRef}
          searching={searching}
        />
      </div>

      <AudioToggle tts={tts} onToggle={handleAudioToggle} />

      {subject && (
        <div id="result-region">
          <ResultPanel
            open={panelOpen}
            subject={subject}
            imageState={imageState}
            svs={svs}
            jpl={jpl}
            aiState={aiState}
            briefing={briefing}
            sceneDescription={sceneDescription}
            briefingSource={briefingSource}
            fallbackImage={panelFallback}
            messages={messages}
            chatPending={chatPending}
            onClose={closePanel}
            onAsk={handleAsk}
            onSpeak={(text) => tts.speak(text)}
            onSpeakScene={handleSpeakScene}
            onDescribeView={handleDescribeView}
            onRetryAi={handleRetryAi}
            onReadResult={handleReadResult}
          />
        </div>
      )}

      <AboutPage open={aboutOpen} onClose={closeAbout} />

      <div className="visually-hidden" aria-live="polite" aria-atomic="true" key={`announce-${announcement.id}`}>
        {announcement.text}
      </div>
    </div>
  );
}
