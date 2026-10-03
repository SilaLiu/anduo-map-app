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

function voiceScore(voice: SpeechSynthesisVoice): number {
  const lang = voice.lang.toLowerCase();
  const name = voice.name.toLowerCase();
  let score = 0;
  if (lang === 'zh-cn' || lang === 'cmn-cn') score += 80;
  else if (lang.startsWith('zh') || lang.startsWith('cmn')) score += 45;
  if (/xiaoxiao|xiaoyi|xiaobei|xiaomo|xiaohan|xiaoxuan|晓晓|晓伊|晓北|晓墨|晓涵|晓萱/.test(name))
    score += 60;
  if (/natural|neural|premium|enhanced|online|google/.test(name)) score += 35;
  if (/mandarin|普通话|中文|国语|國語/.test(name)) score += 20;
  if (/mei-jia|meijia|ting-ting|tingting|sin-ji|sinji|美佳|婷婷/.test(name)) score += 10;
  if (/compact|eloquence|novelty|trinoids|whisper|zarvox/.test(name)) score -= 80;
  return score;
}

export function preferredChineseVoice(): SpeechSynthesisVoice | null {
  if (!isSpeechSynthesisSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  return voices
    .filter((voice) => /^(zh|cmn)/i.test(voice.lang))
    .sort((a, b) => voiceScore(b) - voiceScore(a))[0] || null;
}

export function speakText(text: string, callbacks: SpeechCallbacks = {}): boolean {
  if (!text.trim() || !isSpeechSynthesisSupported()) return false;
  stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 0.82;
  utterance.pitch = 0.92;
  utterance.volume = 0.92;
  const chineseVoice = preferredChineseVoice();
  if (chineseVoice) utterance.voice = chineseVoice;
  utterance.onstart = callbacks.onStart ? () => callbacks.onStart?.() : null;
  utterance.onend = callbacks.onEnd ? () => callbacks.onEnd?.() : null;
  utterance.onerror = callbacks.onError ? () => callbacks.onError?.() : null;
  window.speechSynthesis.speak(utterance);
  return true;
}
