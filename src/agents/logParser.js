// ─────────────────────────────────────────────────────────────────────────────
// src/agents/logParser.js — Agent 1: Log Parser
// Extracts structured error metadata from raw crash logs / stack traces
// found in GitHub issue bodies. Supports Node.js and Python stack traces.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Regex patterns for common stack trace formats.
 * Each pattern defines a `match` function returning { filePath, lineNumber }
 * on success or null on failure, plus an `errorType` extractor.
 */
const STACK_PATTERNS = [
  // ── Node.js / V8 Stack Trace ───────────────────────────────────────────
  // Example:  "    at processPayment (/app/services/payment.js:42:15)"
  {
    name: 'Node.js / V8',
    frameRegex: /at\s+(?:[\w.<>]+\s+)?\(?([\w.\/\\:-]+):(\d+):\d+\)?/gm,
    errorTypeRegex: /^(\w+Error):\s*(.+)$/m,
  },

  // ── Python Traceback ───────────────────────────────────────────────────
  // Example:  '  File "/app/services/payment.py", line 42, in process'
  {
    name: 'Python',
    frameRegex: /File\s+"([^"]+)",\s+line\s+(\d+)/gm,
    errorTypeRegex: /^(\w+(?:Error|Exception)):\s*(.+)$/m,
  },

  // ── Generic file:line pattern ──────────────────────────────────────────
  // Catches things like "src/utils/helper.js:17" in freeform text
  {
    name: 'Generic',
    frameRegex: /([\w.\/\\-]+\.(?:js|ts|py|rb|java|go)):(\d+)/gm,
    errorTypeRegex: /(?:Error|Exception|FATAL|CRITICAL)[:\s]+(.+)/im,
  },
];

/**
 * Parses a raw crash log / GitHub issue body and extracts the first
 * meaningful stack frame along with the error classification.
 *
 * @param {string} rawLog  The full text of the GitHub issue body
 * @returns {{
 *   errorType: string,
 *   filePath: string,
 *   lineNumber: number,
 *   rawMessage: string
 * }}
 */
export function parseLog(rawLog) {
  if (!rawLog || typeof rawLog !== 'string') {
    console.warn('[LogParser] ⚠ Received empty or non-string log input');
    return {
      errorType: 'UnknownError',
      filePath: 'unknown',
      lineNumber: 0,
      rawMessage: rawLog ?? '',
    };
  }

  console.log('[LogParser] Analyzing log input (%d chars)…', rawLog.length);

  for (const pattern of STACK_PATTERNS) {
    // Reset regex state (global flag)
    pattern.frameRegex.lastIndex = 0;

    const frameMatch = pattern.frameRegex.exec(rawLog);
    if (!frameMatch) continue;

    const filePath = frameMatch[1].replace(/\\/g, '/'); // Normalize to forward slashes
    const lineNumber = parseInt(frameMatch[2], 10);

    // Attempt to extract the error type + message
    let errorType = 'UnknownError';
    let rawMessage = '';

    if (pattern.errorTypeRegex) {
      const errorMatch = rawLog.match(pattern.errorTypeRegex);
      if (errorMatch) {
        errorType = errorMatch[1] || 'UnknownError';
        rawMessage = errorMatch[2] || errorMatch[0];
      }
    }

    // If we didn't get a rawMessage, use the first non-blank line
    if (!rawMessage) {
      rawMessage = rawLog.split('\n').find((l) => l.trim().length > 0)?.trim() ?? '';
    }

    console.log(`[LogParser] Matched pattern: ${pattern.name}`);
    console.log(`[LogParser]   errorType  = ${errorType}`);
    console.log(`[LogParser]   filePath   = ${filePath}`);
    console.log(`[LogParser]   lineNumber = ${lineNumber}`);

    return { errorType, filePath, lineNumber, rawMessage };
  }

  // ── Fallback: nothing matched ────────────────────────────────────────────
  console.warn('[LogParser] ⚠ No stack trace pattern matched — returning raw input');

  // Last-ditch: grab the first line that looks like an error
  const fallbackErrorMatch = rawLog.match(
    /(?:Error|Exception|FATAL|CRITICAL|Traceback)[:\s]*(.*)/i
  );

  return {
    errorType: fallbackErrorMatch ? fallbackErrorMatch[0].split(':')[0].trim() : 'UnknownError',
    filePath: 'unknown',
    lineNumber: 0,
    rawMessage: fallbackErrorMatch ? fallbackErrorMatch[1]?.trim() ?? rawLog.slice(0, 200) : rawLog.slice(0, 200),
  };
}
