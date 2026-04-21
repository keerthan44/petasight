const RTL_SPEAKER_MAP: Record<string, { speaker: string; languageName: string }> = {
  ar: { speaker: "Ibn Rushd (Averroes)", languageName: "Arabic" },
  ur: { speaker: "Ibn Sina (Avicenna)", languageName: "Urdu" },
  fa: { speaker: "Rumi", languageName: "Persian (Farsi)" },
  he: { speaker: "Maimonides (Rambam)", languageName: "Hebrew" },
  ps: { speaker: "Khushal Khan Khattak", languageName: "Pashto" },
  ku: { speaker: "Ahmad-i Khani", languageName: "Kurdish" },
  sd: { speaker: "Shah Abdul Latif Bhittai", languageName: "Sindhi" },
  yi: { speaker: "Sholem Aleichem", languageName: "Yiddish" },
}

const DEFAULT = { speaker: "Ibn Sina (Avicenna)", languageName: "Urdu" }

export function resolveSpeaker(lang: string | null): { speaker: string; languageName: string } {
  if (!lang) return DEFAULT
  return RTL_SPEAKER_MAP[lang.toLowerCase()] ?? DEFAULT
}
