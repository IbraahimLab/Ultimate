export interface SecretFinding {
  type: string;
  snippet: string;
}

interface SecretRule {
  type: string;
  regex: RegExp;
}

const SECRET_RULES: SecretRule[] = [
  { type: "Groq API key", regex: /\bgsk_[A-Za-z0-9]{20,}\b/gu },
  { type: "OpenAI API key", regex: /\bsk-[A-Za-z0-9]{20,}\b/gu },
  { type: "GitHub token", regex: /\bghp_[A-Za-z0-9]{20,}\b/gu },
  { type: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/gu },
  { type: "Google API key", regex: /\bAIza[0-9A-Za-z-_]{20,}\b/gu },
  { type: "Private key block", regex: /-----BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY-----/gu },
];

export function detectSecrets(content: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const rule of SECRET_RULES) {
    for (const match of content.matchAll(rule.regex)) {
      const raw = match[0] ?? "";
      if (!raw) {
        continue;
      }
      findings.push({
        type: rule.type,
        snippet: raw.length > 12 ? `${raw.slice(0, 6)}...${raw.slice(-4)}` : raw,
      });
      if (findings.length >= 20) {
        return findings;
      }
    }
  }
  return findings;
}
