import type { Subject } from "../types";

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "of", "to", "in", "on", "at",
  "for", "with", "and", "or", "but", "what", "which", "who", "whom", "whose", "why", "how", "when",
  "where", "do", "does", "did", "can", "could", "would", "should", "will", "shall", "may", "might",
  "i", "you", "it", "its", "this", "that", "these", "those", "me", "my", "we", "our", "us", "about",
  "into", "from", "as", "by", "there", "their", "they", "he", "she", "his", "her", "them", "than",
  "then", "so", "if", "tell", "say", "explain", "please", "really", "very", "much", "many", "some",
  "any", "get", "got", "like", "have", "has", "had", "also", "just", "now", "one", "two",
]);

function firstSentences(text: string, count = 2, maxLength = 420): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [cleaned];
  return sentences.slice(0, count).join(" ").trim().slice(0, maxLength);
}

function queryWords(question: string): string[] {
  const words = question.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return [...new Set(words.filter((word) => word.length > 2 && !STOP_WORDS.has(word)))];
}

interface ScoredText {
  text: string;
  score: number;
  matched: number;
}

function scoreText(text: string, label: string, words: string[]): ScoredText {
  const lowerText = text.toLowerCase();
  const lowerLabel = label.toLowerCase();
  let score = 0;
  let matched = 0;
  for (const word of words) {
    if (lowerLabel.includes(word)) {
      score += 4;
      matched += 1;
    } else if (lowerText.includes(word)) {
      score += 1;
      matched += 1;
    }
  }
  if (words.length > 1 && lowerText.includes(words.join(" "))) score += 6;
  return { text, score, matched };
}

function findDirectAnswer(subject: Subject, question: string): string | null {
  const words = queryWords(question);
  if (!words.length) return null;
  const explanatory = /^(why|how)\b/i.test(question) || /what causes|how does|how do/i.test(question);

  const factCandidates = subject.facts
    .map((fact) => {
      const scored = scoreText(`${fact.label}. ${fact.value}`, fact.label, words);
      return { ...scored, answer: `${fact.label}: ${fact.value}` };
    })
    .sort((a, b) => b.score - a.score);

  const contextCandidates = (subject.context ?? [])
    .map((sentence) => scoreText(sentence, "", words))
    .sort((a, b) => b.score - a.score);

  const bestFact = factCandidates[0];
  const bestContext = contextCandidates[0];
  // One generic word in common, such as "moon" in "next full moon", is not
  // enough to answer a multi-part question. Require real coverage.
  const factIsStrong =
    bestFact &&
    (bestFact.matched >= 2 ||
      (bestFact.matched === 1 && bestFact.score >= 4 && words.length <= 2));
  const contextIsStrong = bestContext && bestContext.matched >= 2;

  // A "why" question with only one incidental keyword should go to the
  // explanatory branch rather than grabbing a nearby fact.
  if (explanatory && bestFact && bestFact.matched < 2 && !contextIsStrong) return null;
  if (factIsStrong) return bestFact.answer;
  if (contextIsStrong) return bestContext.text;
  return null;
}

function bestBriefingSentence(subject: Subject, question: string): string | null {
  const words = queryWords(question);
  if (!words.length) return null;
  const sentences = subject.briefing.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  const ranked = sentences
    .map((sentence) => scoreText(sentence, "", words))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best) return null;
  if (best.matched >= 2 || (best.matched === 1 && words.some((word) => word.length >= 5))) {
    return best.text.trim();
  }
  return null;
}

function matchingFacts(subject: Subject, labels: RegExp): string[] {
  return subject.facts.filter((fact) => labels.test(fact.label)).map((fact) => `${fact.label}: ${fact.value}`);
}

export function buildFallbackAnswer(
  subject: Subject,
  question: string,
  nasaDescription: string,
  viewDescription: string,
): string {
  const q = question.toLowerCase();
  const words = queryWords(question);
  const prefix = "From the built-in NASA guide: ";
  const facts = (pattern: RegExp) => matchingFacts(subject, pattern);
  const join = (lines: string[], fallback: string) => (lines.length ? lines.slice(0, 3).join(" ") : fallback);

  if (/\b(hello|hi|hey|good morning|good evening)\b/.test(q) && q.length < 30) {
    return `${prefix}Hello. You are exploring ${subject.title}. ${subject.suggestedQuestions[0] ?? "Ask me anything about what is on screen."}`;
  }

  if (/\b(who are you|what can you do|how does this work|help)\b/.test(q)) {
    return `${prefix}I can explain ${subject.title}, describe what is on screen, and answer questions using this topic's verified facts. If the on-device AI model is ready, I can also speak more freely. Try asking when something happens, how it works, or why it matters.`;
  }

  if (/\b(what am i looking at|what is on screen|describe|what do you see|scene)\b/.test(q)) {
    return `${prefix}${subject.sceneDescription} ${viewDescription}`;
  }

  // Lifetime and endpoint questions belong with the long-term context, not
  // with an event-date fact.
  const lifetimeQuestion =
    (/\b(how long|life ?span|lifetime|how much longer)\b/.test(q) ||
      /\b(will|when|what happens when)\b[^?]*\b(die|dies|death|end|last|run out)\b/.test(q)) &&
    /\b(sun|star|earth|universe|moon)\b/.test(q) &&
    !/\b(day|year|season|orbit|rotation)\b/.test(q);
  if (lifetimeQuestion) {
    const lifetime = (subject.context ?? []).find((line) =>
      /billion years|million years|red giant|white dwarf|future|will /i.test(line),
    );
    if (lifetime) return `${prefix}${lifetime}`;
  }

  // "What is a black hole?" should start with a definition, not with a
  // nearby detail such as the date of the first image.
  const propertyWords =
    /\b(mass|size|diameter|distance|temperature|hot|cold|age|date|when|why|how|where|made|composed|composition|orbit|day|year|moons?|radius|gravity|density|pressure|speed|brightness|color)\b/;
  const subjectLabel = `${subject.title} ${subject.category}`.toLowerCase();
  const definitionQuestion =
    /^(what|what's)\s+(is|are)\s+/i.test(q) &&
    words.length > 0 &&
    words.length <= 3 &&
    !propertyWords.test(q) &&
    words.every((word) => subjectLabel.includes(word));
  if (definitionQuestion) return `${prefix}${firstSentences(subject.briefing, 2)}`;

  const direct = findDirectAnswer(subject, question);
  if (direct) return `${prefix}${direct}`;

  if (/\b(safe|safety|danger|look at|stare|hurt|damage|glasses)\b/.test(q)) {
    const safety = facts(/safe|safety|protect|never/i);
    if (safety.length) return `${prefix}${safety.join(" ")}`;
    return `${prefix}The built-in guide does not list a special safety warning for this topic. Never look directly at the Sun without certified eclipse glasses. For anything you observe, use a reputable astronomy source for current guidance.`;
  }

  if (/\b(life|living|alive|habitable|humans?|survive|ocean|liquid water)\b/.test(q)) {
    const lifeFacts = facts(/life|ocean|water|habitable|moons?|special|discovered|surface/i).filter((line) =>
      /life|ocean|water|habitable|human|survive|moon|ice/i.test(line),
    );
    const context = (subject.context ?? []).filter((line) =>
      /life|ocean|water|habitable|human|survive|ice/i.test(line),
    );
    if (lifeFacts.length || context.length) {
      return `${prefix}${[...lifeFacts.slice(0, 2), ...context.slice(0, 1)].join(" ")}`;
    }
    return `${prefix}${firstSentences(subject.briefing, 2)} The built-in guide does not go further than that on the question of life.`;
  }

  if (/\b(when|what date|which date|next|last|how often|how long|season|opposition|eclipse|peak)\b/.test(q)) {
    const dateFacts = facts(/\b(next|last|date|when|season|opposition|occurrence|peak|cycle|began|begins|image)\b/i);
    if (dateFacts.length) return `${prefix}${join(dateFacts, subject.briefing)}`;
    return `${prefix}This topic does not have a fixed date in the built-in guide. ${subject.facts[0] ? `${subject.facts[0].label}: ${subject.facts[0].value}` : ""}`;
  }

  if (/\b(how big|size|large|diameter|how far|distance|temperature|hot|cold|mass|deep|deepest|tall|wide|heavy)\b/.test(q)) {
    const sizeFacts = facts(/size|diameter|distance|temperature|depth|deepest|peak|tall|coverage|mass|pressure|day|orbit/i);
    return `${prefix}${join(sizeFacts, subject.briefing)}`;
  }

  if (/\b(why|how does|how do|how is|what causes|what makes|works|happen)\b/.test(q)) {
    const explanatory = facts(/why|how|cause|matters|special|works|happens|makes/i);
    const briefingLine = bestBriefingSentence(subject, question);
    const nasa = firstSentences(nasaDescription, 1, 260);
    const parts = [briefingLine, explanatory[0], nasa].filter(Boolean);
    return `${prefix}${parts.length ? parts.join(" ") : subject.briefing}`.replace(/\s+/g, " ").trim();
  }

  if (/\b(where|location|visible|see it|find it|watch|view)\b/.test(q)) {
    const whereFacts = facts(/where|visible|located|location|watch|view|coverage|region|atlantic|latitude|orbit|distance/i);
    return `${prefix}${join(whereFacts, subject.sceneDescription)}`;
  }

  if (/\b(nasa|source|more|learn|detail)\b/.test(q)) {
    const nasaText = firstSentences(nasaDescription, 3, 520);
    if (nasaText) return `${prefix}NASA's archive describes it this way: ${nasaText}`;
    return `${prefix}${subject.briefing} ${subject.facts[0] ? `${subject.facts[0].label}: ${subject.facts[0].value}` : ""}`;
  }

  const briefingLine = bestBriefingSentence(subject, question);
  if (briefingLine) return `${prefix}${briefingLine}`;

  const usefulFact = subject.facts.find((fact) => !/search|about this view|next step/i.test(fact.label));
  const nasaText = firstSentences(nasaDescription, 1, 240);
  return `${prefix}${firstSentences(subject.briefing, 2)} ${usefulFact ? `${usefulFact.label}: ${usefulFact.value}` : ""} ${nasaText}`
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSearchAnnouncement(subject: Subject): string {
  return `Now showing ${subject.title}. ${subject.sceneDescription}`;
}

export function buildSpeechText(subject: Subject, briefing: string, sceneDescription: string): string {
  return `${subject.title}. ${briefing} On screen: ${sceneDescription}`;
}
