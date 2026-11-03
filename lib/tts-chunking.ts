/** Split TTS text into sentence-sized chunks without breaking word order. */
export function splitTtsText(text: string, maxSentences = 3): string[] {
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [];

  if (sentences.length === 0) return text.trim() ? [text.trim()] : [];

  const chunks: string[] = [];
  for (let index = 0; index < sentences.length; index += maxSentences) {
    chunks.push(sentences.slice(index, index + maxSentences).join(" "));
  }
  return chunks;
}
