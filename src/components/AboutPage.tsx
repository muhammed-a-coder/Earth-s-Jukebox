import { useEffect, useRef } from "react";
import { ChevronLeftIcon, ExternalIcon, SparkIcon } from "./Icons";

interface AboutPageProps {
  open: boolean;
  onClose: () => void;
}

const SOURCES = [
  {
    label: "NASA Image and Video Library API",
    url: "https://images.nasa.gov/",
    note: "Live photographs, titles, descriptions, and credits. The app searches it at runtime and stores no imagery.",
  },
  {
    label: "NASA GIBS — Global Imagery Browse Services",
    url: "https://earthdata.nasa.gov/gibs",
    note: "Blue Marble and city-lights Earth textures, streamed live and used as 3D surface maps.",
  },
  {
    label: "NASA Scientific Visualization Studio",
    url: "https://svs.gsfc.nasa.gov/",
    note: "Visualization search and links. SVS does not always allow browser reads, so the app shows a direct link when it cannot fetch metadata.",
  },
  {
    label: "NASA/JPL Horizons",
    url: "https://ssd.jpl.nasa.gov/",
    note: "Solar System Dynamics positions and orbits, plus a live link to the Horizons tool. The Horizons API normally blocks browser reads, so live telemetry appears only when it succeeds.",
  },
  {
    label: "NASA Eclipse Catalog",
    url: "https://eclipse.gsfc.nasa.gov/eclipse.html",
    note: "Dates, types, durations, and visibility for solar and lunar eclipses. The static pages do not send CORS headers, so the app carries a small verified snapshot and always links to the live catalog.",
  },
];

export function AboutPage({ open, onClose }: AboutPageProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => headingRef.current?.focus(), 80);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="about-overlay">
      <main className="about-page" aria-labelledby="about-title">
        <div className="about-topbar">
          <button type="button" className="icon-text-button" onClick={onClose}>
            <ChevronLeftIcon width={19} height={19} />
            <span>Back to the jukebox</span>
          </button>
          <span className="eyebrow">
            <span className="eyebrow-dot" aria-hidden="true" />
            About
          </span>
        </div>

        <header className="about-header">
          <p className="about-kicker">NASA Space Apps Challenge 2026</p>
          <h1 id="about-title" ref={headingRef} tabIndex={-1}>
            The Earth Information Jukebox
          </h1>
          <p className="about-lede">
            A voice-first way to wander the universe. Search a world or a phenomenon, hear what NASA knows about it, and
            let a camera orbit a 3D impression while you listen. Designed for blind and low-vision explorers from the
            first line of code.
          </p>
        </header>

        <section aria-labelledby="challenge-heading">
          <h2 id="challenge-heading">The challenge</h2>
          <p>
            NASA's 2026 Space Apps challenge asks teams to turn Earth and space information into something people can
            explore the way they explore music: search for a feeling, a place, or a question, and let the experience play.
            Earth Jukebox takes that literally. Every result is a track: a NASA photograph, a spoken briefing, a 3D
            scene, and an open conversation.
          </p>
          <p>
            This is an independent concept built for the challenge. It is not an official NASA product, and NASA has not
            endorsed it.
          </p>
        </section>

        <section aria-labelledby="how-heading">
          <h2 id="how-heading">How the AI works</h2>
          <div className="about-callout">
            <SparkIcon width={21} height={21} />
            <div>
              <strong>No API key. No server. No cloud AI.</strong>
              <p>
                The briefing writer and chat assistant run in a Web Worker with WebLLM. The app picks Qwen2.5 1.5B or 3B
                from your device's memory and graphics capability, and falls back to a smaller WASM model when WebGPU is
                unavailable. The model downloads once and the browser caches it. Nothing you type is sent to an AI
                company, and there is no application backend to maintain.
              </p>
            </div>
          </div>
          <p>
            If no local model can start, the site still works. It switches to carefully written built-in briefings for
            the main topics and grounded answers assembled from the same verified facts. The panel always says which
            answer source you are hearing.
          </p>
          <p>
            The AI receives NASA image captions, JPL data, event dates, and the verified facts for the current subject
            as grounding. It can describe the scene and answer follow-ups, but it never controls the camera or invents a
            date. Answers stream into the chat as they are generated.
          </p>
        </section>

        <section aria-labelledby="voice-heading">
          <h2 id="voice-heading">Voice and sound</h2>
          <p>
            The primary voice is Kokoro, a neural text-to-speech model that runs in a Web Worker on your device. It
            downloads once, speaks sentence by sentence, and starts as soon as the first sentence is ready. A Piper WASM
            voice is the backup. If neither neural voice can start, the app chooses the most natural installed system
            voice rather than the default robotic one.
          </p>
          <p>
            The speaker button at the bottom right mutes and stops speech, then resumes where it left off when you turn
            it back on. A new search interrupts the current sentence immediately. Numbers, dates, units, and
            abbreviations are rewritten into natural spoken words before synthesis. Every spoken item is also on screen
            as selectable text, and every chat answer has its own Read aloud button.
          </p>
        </section>

        <section aria-labelledby="access-heading">
          <h2 id="access-heading">Built for blind and low-vision explorers</h2>
          <ul className="about-list">
            <li>Semantic landmarks, one clear heading per result, and visible focus rings throughout.</li>
            <li>ARIA live announcements for new results, scene changes, chat answers, and AI status.</li>
            <li>A plain-language scene description that is always available as text and read aloud.</li>
            <li>Push-to-talk for both search and follow-up questions, with a keyboard hold-to-talk equivalent.</li>
            <li>
              A camera that never demands precise pointing: it circles the subject automatically. Hold and drag, or
              hold the arrow keys, to scrub along the same circular path.
            </li>
            <li>
              Reduced-motion support slows the orbit rather than removing it, so motion remains predictable without
              becoming static or disorienting.
            </li>
            <li>High-contrast text, large type, and controls that state their meaning in words.</li>
          </ul>
        </section>

        <section aria-labelledby="sources-heading-about">
          <h2 id="sources-heading-about">NASA sources</h2>
          <p>
            Earth imagery is not stored with this site. NASA photographs, Earth textures, and metadata are fetched live
            from NASA hosts when you use the app. Some NASA services deliberately block browser cross-origin reads; the
            app degrades gracefully, labels what is local, and keeps a link to the primary source.
          </p>
          <ul className="about-sources">
            {SOURCES.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.label} <ExternalIcon width={14} height={14} />
                </a>
                <p>{source.note}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="keys-heading">
          <h2 id="keys-heading">Keyboard shortcuts</h2>
          <dl className="shortcut-list">
            <div>
              <dt>/</dt>
              <dd>Focus the search field</dd>
            </div>
            <div>
              <dt>Hold ← or →</dt>
              <dd>Scrub the camera around its orbit</dd>
            </div>
            <div>
              <dt>Esc</dt>
              <dd>Close the result panel or this page</dd>
            </div>
            <div>
              <dt>Space or Enter on a microphone</dt>
              <dd>Hold to talk; release to finish</dd>
            </div>
          </dl>
        </section>

        <footer className="about-footer">
          <p>
            Earth Jukebox — a concept for the NASA Space Apps Challenge 2026, “The Earth Information Jukebox.” Built with
            Vite, React, Three.js, WebLLM, Kokoro, and Piper. NASA data courtesy of NASA's public services. All other code
            and words are the project's own.
          </p>
          <button type="button" className="primary-button" onClick={onClose}>
            Back to the universe
          </button>
        </footer>
      </main>
    </div>
  );
}
