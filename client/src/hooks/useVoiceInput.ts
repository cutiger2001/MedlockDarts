import { useState, useRef, useCallback, useEffect } from 'react';

// SpeechRecognition is not in all TS DOM lib versions — use any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecognition = any;

export type VoiceInputState = 'idle' | 'listening' | 'processing' | 'error';

interface UseVoiceInputOptions {
  onResult: (transcript: string) => void;
  onError?: (error: string) => void;
}

function getSpeechRecognitionClass(): (new () => AnyRecognition) | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useVoiceInput({ onResult, onError }: UseVoiceInputOptions) {
  const [state, setState] = useState<VoiceInputState>('idle');
  const recognitionRef = useRef<AnyRecognition>(null);

  const SpeechRecognitionClass = getSpeechRecognitionClass();
  const isSupported = !!SpeechRecognitionClass;

  const start = useCallback(() => {
    const SR = getSpeechRecognitionClass();
    if (!SR) {
      onError?.('Speech recognition is not supported in this browser');
      return;
    }

    // Abort any in-flight session first
    recognitionRef.current?.abort();

    const recognition: AnyRecognition = new SR();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => setState('listening');

    recognition.onresult = (event: AnyRecognition) => {
      setState('processing');
      const transcript: string = event.results[0][0].transcript;
      onResult(transcript);
      setTimeout(() => setState('idle'), 400);
    };

    recognition.onerror = (event: AnyRecognition) => {
      if (event.error === 'no-speech') {
        setState('idle');
      } else {
        setState('error');
        onError?.(String(event.error));
        setTimeout(() => setState('idle'), 2000);
      }
    };

    recognition.onend = () => {
      // Guard: only reset to idle if we haven't moved to 'processing' already
      setState((prev: VoiceInputState) => (prev === 'listening' ? 'idle' : prev));
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setState('idle');
    }
  }, [onResult, onError]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setState('idle');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  return { state, isSupported, start, stop };
}
