/**
 * Browser speech helper for opt-in operational alerts.
 * A page must call this from a user gesture before enabling alerts so browsers
 * can unlock speech playback. Returns false when speech is not available.
 */
export function isKhaavioVoiceSupported() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.speechSynthesis) &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

export function queueKhaavioVoice(messageFactory) {
  if (!isKhaavioVoiceSupported()) return false;

  try {
    const synthesis = window.speechSynthesis;
    const voices = synthesis.getVoices();
    const voice =
      voices.find((item) => item.lang?.toLowerCase().startsWith("hi")) ||
      voices.find((item) => item.lang?.toLowerCase() === "en-in") ||
      voices[0] ||
      null;
    const isHindi = Boolean(voice?.lang?.toLowerCase().startsWith("hi"));
    const message = typeof messageFactory === "function"
      ? messageFactory(isHindi)
      : String(messageFactory || "");

    if (!message) return false;

    const utterance = new window.SpeechSynthesisUtterance(message);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || (isHindi ? "hi-IN" : "en-IN");
    utterance.rate = 0.94;
    utterance.pitch = 1;
    utterance.volume = 1;
    synthesis.speak(utterance);
    return true;
  } catch (error) {
    console.warn("Khaavio voice announcement could not be queued:", error);
    return false;
  }
}

export function cancelKhaavioVoice() {
  try {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  } catch {
    // Voice is optional; UI workflows must continue if the browser rejects it.
  }
}


let sharedAlertAudioContext = null;

function getSharedAlertAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedAlertAudioContext || sharedAlertAudioContext.state === "closed") {
    sharedAlertAudioContext = new AudioContextClass();
  }
  return sharedAlertAudioContext;
}

/**
 * Must be called from a user gesture at least once in browsers that restrict
 * autoplay. After activation the shared context survives React route changes.
 */
export async function unlockKhaavioAlertAudio() {
  try {
    const context = getSharedAlertAudioContext();
    if (!context) return false;
    if (context.state === "suspended") await context.resume();
    return context.state === "running";
  } catch (error) {
    console.warn("Khaavio alert sound could not be unlocked:", error);
    return false;
  }
}

export async function activateKhaavioAlertSound() {
  const unlocked = await unlockKhaavioAlertAudio();
  if (!unlocked) return false;
  playKhaavioAlertSound();
  return true;
}

/** Longer, more prominent three-tone chime for operational alerts. */
export function playKhaavioAlertSound() {
  try {
    const context = getSharedAlertAudioContext();
    if (!context || context.state !== "running") return false;

    const now = context.currentTime;
    const tones = [
      { at: 0, frequency: 880, duration: 0.34 },
      { at: 0.24, frequency: 660, duration: 0.34 },
      { at: 0.48, frequency: 990, duration: 0.46 },
    ];

    for (const tone of tones) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(tone.frequency, now + tone.at);
      gain.gain.setValueAtTime(0.0001, now + tone.at);
      gain.gain.exponentialRampToValueAtTime(0.24, now + tone.at + 0.025);
      gain.gain.setValueAtTime(0.24, now + tone.at + tone.duration - 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.at + tone.duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + tone.at);
      oscillator.stop(now + tone.at + tone.duration + 0.01);
    }
    return true;
  } catch (error) {
    console.warn("Khaavio alert sound could not play:", error);
    return false;
  }
}
