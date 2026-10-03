export type SpeechCallbacks = {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
};

export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    'SpeechSynthesisUtterance' in window
  );
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
}

export function speakText(text: string, callbacks: SpeechCallbacks = {}): boolean {
  if (!text.trim() || !isSpeechSynthesisSupported()) return false;
  stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 0.95;
  utterance.pitch = 1;
  utterance.volume = 1;
  const chineseVoice = window.speechSynthesis
    .getVoices()
    .find((voice) => voice.lang.toLowerCase().startsWith('zh'));
  if (chineseVoice) utterance.voice = chineseVoice;
  utterance.onstart = callbacks.onStart ? () => callbacks.onStart?.() : null;
  utterance.onend = callbacks.onEnd ? () => callbacks.onEnd?.() : null;
  utterance.onerror = callbacks.onError ? () => callbacks.onError?.() : null;
  window.speechSynthesis.speak(utterance);
  return true;
}
