export function estimateTokens(text: string): number {
  let codePoints = 0;
  for (const _codePoint of text) {
    codePoints += 1;
  }
  return Math.floor(codePoints / 4);
}
