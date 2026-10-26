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
