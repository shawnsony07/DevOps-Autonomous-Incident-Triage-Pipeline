// ─────────────────────────────────────────────────────────────────────────────
// src/agents/codeRepair.js — Agent 3: Code Repair (LLM)
// Feeds the parsed stack trace + retrieved code context into Gemini 3.1 Pro
// using the official @google/genai SDK. Enforces structured JSON output.
// ─────────────────────────────────────────────────────────────────────────────

import { GoogleGenAI } from '@google/genai';

// Initialize the Google Gen AI client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ── System Instruction ────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a Principal Site Reliability Engineer (SRE) with 15+ years of experience debugging production incidents across distributed systems, microservices, and serverless architectures.

Your task:
1. Analyze the provided STACK TRACE and SOURCE CODE CONTEXT.
2. Identify the root cause of the crash or error.
3. Generate a precise, minimal code fix that resolves the issue without introducing regressions.

Rules:
- Your fix must be MINIMAL — change only what is necessary to resolve the error.
- Preserve existing code style, indentation, and conventions.
- Do NOT refactor unrelated code.
- If the fix requires adding an import or dependency, include it in the fixed_code.
- Include a clear, concise explanation of the root cause and why your fix resolves it.`;

// Define the JSON schema for structured output
const responseSchema = {
  type: 'OBJECT',
  properties: {
    file_path: { 
      type: 'STRING', 
      description: 'The relative path to the file that needs the fix' 
    },
    original_code: { 
      type: 'STRING', 
      description: 'The exact code snippet that is broken (must be present in the source file)' 
    },
    fixed_code: { 
      type: 'STRING', 
      description: 'The corrected version of the code snippet' 
    },
    explanation: { 
      type: 'STRING', 
      description: 'Concise explanation of the root cause and why the fix resolves it' 
    }
  },
  required: ['file_path', 'original_code', 'fixed_code', 'explanation']
};

/**
 * Generates a code fix by calling Gemini 3.1 Pro with the structured error data
 * and surrounding code context.
 *
 * @param {object} parsedLog    Output of Agent 1
 * @param {string} codeContext  Output of Agent 2
 * @returns {{ file_path: string, original_code: string, fixed_code: string, explanation: string }}
 */
export async function generateFix(parsedLog, codeContext) {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.startsWith('your_')) {
    // If the key is not set or is the placeholder, return mock fix for safety
    console.warn('[CodeRepair] ⚠ GEMINI_API_KEY not configured — returning mock patch');
    return createMockPatch(parsedLog, codeContext);
  }

  // ── Build the user message ────────────────────────────────────────────────
  const userMessage = `
## Stack Trace Analysis

**Error Type:** ${parsedLog.errorType}
**File:** ${parsedLog.filePath}
**Line:** ${parsedLog.lineNumber}
**Message:** ${parsedLog.rawMessage}

## Source Code Context

\`\`\`
${codeContext}
\`\`\`

Analyze the above and produce the JSON fix object according to the response schema.`;

  console.log('[CodeRepair] Calling Gemini 2.5 Flash with JSON Schema mode…');
  console.log(`[CodeRepair]   Error: ${parsedLog.errorType} in ${parsedLog.filePath}:${parsedLog.lineNumber}`);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userMessage,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.1, // Low temperature for deterministic fixes
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
      }
    });

    const rawContent = response.text;
    console.log('[CodeRepair] Raw LLM response length:', rawContent?.length ?? 0, 'chars');

    if (!rawContent) {
      throw new Error('Gemini API returned an empty response');
    }

    // ── Parse & Validate ──────────────────────────────────────────────────
    const patchData = parseAndValidateResponse(rawContent, parsedLog);

    console.log('[CodeRepair] ✓ Valid patch generated');
    console.log(`[CodeRepair]   File:        ${patchData.file_path}`);
    console.log(`[CodeRepair]   Explanation: ${patchData.explanation.slice(0, 100)}…`);

    return patchData;
  } catch (err) {
    console.error('[CodeRepair] ✗ Gemini call failed:', err.message);
    throw new Error(`Code repair agent failed: ${err.message}`);
  }
}

// ── Response Parsing Guardrails ──────────────────────────────────────────────

/**
 * Attempts multiple strategies to extract a valid JSON patch object from
 * the LLM response. Handles common malformations.
 *
 * @param {string} rawContent  Raw LLM response text
 * @param {object} parsedLog   Fallback data for missing fields
 * @returns {{ file_path: string, original_code: string, fixed_code: string, explanation: string }}
 */
function parseAndValidateResponse(rawContent, parsedLog) {
  // Strategy 1: Direct parse
  try {
    const parsed = JSON.parse(rawContent);
    return validatePatchSchema(parsed, parsedLog);
  } catch {
    console.warn('[CodeRepair] Direct JSON.parse failed — trying cleanup strategies');
  }

  // Strategy 2: Strip markdown code fences
  const fenceStripped = rawContent
    .replace(/^```(?:json)?\s*\n?/gm, '')
    .replace(/\n?```\s*$/gm, '')
    .trim();

  try {
    const parsed = JSON.parse(fenceStripped);
    return validatePatchSchema(parsed, parsedLog);
  } catch {
    // Continue to next strategy
  }

  // Strategy 3: Extract the first JSON object using brace matching
  const firstBrace = rawContent.indexOf('{');
  const lastBrace = rawContent.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const extracted = rawContent.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(extracted);
      return validatePatchSchema(parsed, parsedLog);
    } catch {
      // Fall through
    }
  }

  throw new Error('Failed to parse Gemini response as valid JSON.');
}

/**
 * Validates that the parsed object conforms to the expected patch schema.
 * Fills in missing fields with sensible defaults where possible.
 */
function validatePatchSchema(obj, parsedLog) {
  const requiredFields = ['file_path', 'original_code', 'fixed_code', 'explanation'];
  const patch = {};

  for (const field of requiredFields) {
    if (typeof obj[field] === 'string' && obj[field].trim().length > 0) {
      patch[field] = obj[field];
    } else {
      // Provide intelligent defaults for missing fields
      switch (field) {
        case 'file_path':
          patch.file_path = parsedLog.filePath || 'unknown';
          console.warn(`[CodeRepair] ⚠ Missing field "${field}" — defaulting to ${patch.file_path}`);
          break;
        case 'explanation':
          patch.explanation = `Auto-fix for ${parsedLog.errorType} at line ${parsedLog.lineNumber}`;
          console.warn(`[CodeRepair] ⚠ Missing field "${field}" — using auto-generated explanation`);
          break;
        default:
          throw new Error(`Gemini response missing required field: "${field}"`);
      }
    }
  }

  return patch;
}

// ── Mock Fallback ────────────────────────────────────────────────────────────

/**
 * Creates a plausible mock patch for local testing without an API key.
 */
function createMockPatch(parsedLog, codeContext) {
  console.log('[CodeRepair] 🧪 Generating mock patch for local development');

  // Try to extract some original code from the context
  const contextLines = (codeContext || '').split('\n');
  const errorLine = contextLines.find((l) => l.includes('>>>'));
  const originalSnippet = errorLine
    ? errorLine.replace(/^\s*>>>\s*\d+\s*\|\s*/, '').trim()
    : 'const result = processData(input);';

  return {
    file_path: parsedLog.filePath || 'unknown',
    original_code: originalSnippet,
    fixed_code: `// AI-TRIAGE: Added null-safety guard for ${parsedLog.errorType}\n` +
      `if (!order || !order.paymentMethod) {\n` +
      `  return { success: false, error: 'Payment method is required' };\n` +
      `}\n` +
      `const paymentMethodId = order.paymentMethod.id;`,
    explanation:
      `The ${parsedLog.errorType} at ${parsedLog.filePath}:${parsedLog.lineNumber} ` +
      `was caused by a missing check for order.paymentMethod before accessing its properties. ` +
      `Added validation guard to return early if paymentMethod is missing.`,
  };
}
