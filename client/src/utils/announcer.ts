/**
 * Audio Announcer — Uses Web Speech API (SpeechSynthesis) for game commentary.
 * All calls are fire-and-forget; no-ops when speech synthesis is unavailable or disabled.
 */

/* ------------------------------------------------------------------ */
/*  Settings persistence                                               */
/* ------------------------------------------------------------------ */

const AUDIO_KEY = 'darts-audio-enabled';

export function isAudioEnabled(): boolean {
  try {
    const raw = localStorage.getItem(AUDIO_KEY);
    return raw === null ? true : raw === 'true'; // default ON
  } catch {
    return true;
  }
}

export function setAudioEnabled(enabled: boolean): void {
  localStorage.setItem(AUDIO_KEY, String(enabled));
}

/* ------------------------------------------------------------------ */
/*  Core speak helper — queue-based to avoid clipping                  */
/* ------------------------------------------------------------------ */

let isSpeaking = false;
let pendingUtterance: { text: string; options?: { rate?: number; pitch?: number; volume?: number } } | null = null;
let safariUnlocked = false;

/**
 * Safari/iOS requires the first speechSynthesis.speak() to originate
 * from a user-gesture (tap/click) call stack.  Call this once from any
 * tap handler (e.g. first score tap, coin-toss button) to "unlock" the
 * audio context.  Subsequent speaks then work freely.
 */
export function unlockSpeechSynthesis(): void {
  if (safariUnlocked) return;
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance('');
  utterance.volume = 0;
  utterance.lang = 'en-US';
  window.speechSynthesis.speak(utterance);
  safariUnlocked = true;
}

function speakNow(text: string, options?: { rate?: number; pitch?: number; volume?: number }): void {
  isSpeaking = true;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options?.rate ?? 1.0;
  utterance.pitch = options?.pitch ?? 1.0;
  utterance.volume = options?.volume ?? 1.0;
  utterance.lang = 'en-US';

  utterance.onend = () => {
    isSpeaking = false;
    if (pendingUtterance) {
      const next = pendingUtterance;
      pendingUtterance = null;
      speakNow(next.text, next.options);
    }
  };
  utterance.onerror = () => {
    isSpeaking = false;
    pendingUtterance = null;
  };

  window.speechSynthesis.speak(utterance);
}

function speak(text: string, options?: { rate?: number; pitch?: number; volume?: number }): void {
  if (!isAudioEnabled()) return;
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  // Safari workaround: cancel stale queue to prevent stuck synthesis
  if (!isSpeaking) {
    window.speechSynthesis.cancel();
  }

  if (isSpeaking) {
    // Let current utterance finish; replace any pending with the latest
    pendingUtterance = { text, options };
  } else {
    speakNow(text, options);
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Announce player name only */
export function announceNowThrowing(playerName: string): void {
  speak(playerName, { rate: 1.05 });
}

/** Announce "[Player], you require [remaining]" for checkout */
export function announceRequires(playerName: string, remaining: number): void {
  speak(`${playerName}, you require ${remaining}`, { rate: 1.0, pitch: 1.05 });
}

/** Announce score after an X01 turn: "Scores 60" / "No score" */
export function announceX01Score(score: number): void {
  if (score === 0) {
    speak('No score', { rate: 1.0, pitch: 0.9 });
  } else if (score === 180) {
    speak('ONE HUNDRED AND EIGHTY!', { rate: 0.9, pitch: 1.3, volume: 1.0 });
  } else if (score >= 100) {
    speak(`Scores ${score}! Nice throw!`, { rate: 1.0, pitch: 1.1 });
  } else {
    speak(`Scores ${score}`, { rate: 1.05 });
  }
}

/** Announce marks after a Cricket/Shanghai turn: "5 marks" */
export function announceMarks(marks: number): void {
  if (marks === 0) {
    speak('No marks', { rate: 1.0, pitch: 0.9 });
  } else if (marks >= 9) {
    speak(`${marks} marks! Incredible round!`, { rate: 0.95, pitch: 1.3, volume: 1.0 });
  } else if (marks >= 6) {
    speak(`${marks} marks! Great round!`, { rate: 1.0, pitch: 1.15 });
  } else {
    speak(`${marks} marks`, { rate: 1.05 });
  }
}

/** Announce an All-Star achievement — very excited, no player name */
export function announceAllStar(level: string, _playerName?: string): void {
  const exclamations: Record<string, string> = {
    allstar: 'ALL STAR! What a round!',
    double: 'DOUBLE ALL STAR! Absolutely brilliant!',
    triple: 'TRIPLE ALL STAR! Unbelievable! What a performance!',
  };
  speak(exclamations[level] || 'ALL STAR!', {
    rate: 0.85,
    pitch: 1.35,
    volume: 1.0,
  });
}

/** Announce a 180 — maximum excitement */
export function announce180(playerName: string): void {
  speak(`ONE HUNDRED AND EIGHTY! ${playerName}! Maximum!`, {
    rate: 0.8,
    pitch: 1.4,
    volume: 1.0,
  });
}

/** Announce Shanghai bonus */
export function announceShanghaiBonus(): void {
  speak('SHANGHAI! Two hundred bonus points! Incredible!', {
    rate: 0.85,
    pitch: 1.3,
    volume: 1.0,
  });
}

/** Announce BUST */
export function announceBust(): void {
  speak('Bust!', { rate: 1.0, pitch: 0.8 });
}

/** Announce game checkout */
export function announceGameOut(playerName: string): void {
  speak(`Game shot! ${playerName} checks out!`, {
    rate: 0.9,
    pitch: 1.2,
    volume: 1.0,
  });
}

/** Announce a game winner (shown on game-over overlay) */
export function announceGameWinner(teamName: string): void {
  speak(`${teamName} wins the game!`, {
    rate: 0.9,
    pitch: 1.2,
    volume: 1.0,
  });
}

/** Announce the match winner */
export function announceMatchWinner(teamName: string): void {
  speak(`${teamName} wins the match! Congratulations!`, {
    rate: 0.85,
    pitch: 1.3,
    volume: 1.0,
  });
}

/** Announce league champions after playoff final */
export function announceChampion(teamName: string): void {
  speak(`${teamName} are the league champions! What a season! Congratulations!`, {
    rate: 0.8,
    pitch: 1.4,
    volume: 1.0,
  });
}

/** Announce a Round the World hit/miss */
export function announceRtwResult(hit: boolean, target: number): void {
  if (hit) {
    const label = target === 25 ? 'Bull' : String(target);
    speak(`Hit! ${label}!`, { rate: 1.05, pitch: 1.1 });
  } else {
    speak('Miss', { rate: 1.0, pitch: 0.9 });
  }
}

/** Announce Cricket/Shanghai game closed out */
export function announceCricketGameOut(teamName: string): void {
  speak(`Game over! ${teamName} closes it out!`, {
    rate: 0.9,
    pitch: 1.2,
    volume: 1.0,
  });
}

/** Announce a player becoming a Killer */
export function announceKiller(playerName: string): void {
  speak(`${playerName} is now a Killer!`, { rate: 0.95, pitch: 1.15, volume: 1.0 });
}

/** Announce a player being eliminated in Killer */
export function announceEliminated(playerName: string): void {
  speak(`${playerName} has been eliminated!`, { rate: 0.9, pitch: 0.8, volume: 1.0 });
}

/** Announce the Killer game winner */
export function announceKillerWinner(playerName: string): void {
  speak(`Game over! ${playerName} wins!`, { rate: 0.85, pitch: 1.2, volume: 1.0 });
}
