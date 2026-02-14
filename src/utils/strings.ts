export function clipText(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input;
  }
  return `${input.slice(0, maxChars)}\n...[truncated ${input.length - maxChars} chars]`;
}

export function withLineNumbers(text: string, startLine = 1): string {
  const lines = text.split("\n");
  const width = String(startLine + lines.length).length;
  return lines
    .map((line, index) => `${String(startLine + index).padStart(width, " ")}| ${line}`)
    .join("\n");
}
