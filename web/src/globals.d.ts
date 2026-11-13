/**
 * Ambient declarations for browser APIs that ``lib.dom`` still does not ship:
 * the prefixed Web Audio constructor and the Web Speech API.
 */

interface Window {
  webkitAudioContext?: typeof AudioContext;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
  SpeechRecognition?: SpeechRecognitionConstructor;
}

interface SpeechRecognitionEventLike extends Event {
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [index: number]: { transcript: string; confidence: number };
    };
  };
  resultIndex: number;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}
