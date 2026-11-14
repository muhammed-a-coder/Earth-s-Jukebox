import { useEffect, useRef, useState } from "react";

interface RecognitionResultAlternative {
  transcript: string;
}

interface RecognitionResult {
  isFinal: boolean;
  0: RecognitionResultAlternative;
}

interface RecognitionResultList {
  length: number;
  [index: number]: RecognitionResult;
}

interface RecognitionEventLike extends Event {
  results: RecognitionResultList;
  resultIndex: number;
}

interface RecognitionErrorEventLike extends Event {
  error?: string;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type RecognitionConstructor = new () => RecognitionLike;

function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

function friendlyError(code: string | undefined): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Allow it in your browser settings, or type your question instead.";
    case "no-speech":
      return "I didn't hear anything. Try again, a little closer to the microphone.";
    case "audio-capture":
      return "No microphone was found. You can still type your question.";
    case "network":
      return "Voice recognition needs a network connection in this browser. You can still type.";
    case "aborted":
      return "";
    default:
      return "Voice input stopped unexpectedly. You can try again or type instead.";
  }
}

export interface SpeechRecognitionControls {
  supported: boolean;
  listening: boolean;
  interim: string;
  error: string;
  start: () => void;
  stop: () => void;
  clearError: () => void;
}

export function useSpeechRecognition(
  onFinal: (transcript: string) => void,
  lang = "en-US",
): SpeechRecognitionControls {
  const [supported] = useState(() => getRecognitionConstructor() !== null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const finalCallbackRef = useRef(onFinal);
  const listeningRef = useRef(false);

  useEffect(() => {
    finalCallbackRef.current = onFinal;
  }, [onFinal]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const start = () => {
    if (!supported || listeningRef.current) return;
    const Constructor = getRecognitionConstructor();
    if (!Constructor) return;
    setError("");
    setInterim("");
    const recognition = new Constructor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    let finalTranscript = "";
    recognition.onstart = () => {
      listeningRef.current = true;
      setListening(true);
    };
    recognition.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalTranscript += ` ${transcript}`;
        else interimText += transcript;
      }
      setInterim(interimText);
      if (finalTranscript.trim()) {
        finalCallbackRef.current(finalTranscript.trim());
      }
    };
    recognition.onerror = (event) => {
      const message = friendlyError(event.error);
      if (message) setError(message);
    };
    recognition.onend = () => {
      listeningRef.current = false;
      setListening(false);
      setInterim("");
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setError("Voice input could not start. Please try again or type instead.");
      listeningRef.current = false;
      setListening(false);
    }
  };

  const stop = () => {
    recognitionRef.current?.stop();
  };

  const clearError = () => setError("");

  return { supported, listening, interim, error, start, stop, clearError };
}
