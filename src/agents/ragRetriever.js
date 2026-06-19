// ─────────────────────────────────────────────────────────────────────────────
// src/agents/ragRetriever.js — Agent 2: Codebase RAG
// Retrieves relevant source code context for the error location.
//
// Strategy (in order of preference):
//   1. Pinecone vector search via Gemini embeddings (when configured)
//   2. Local filesystem fallback — reads the file directly from the workspace
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

// Initialize the Google Gen AI client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ── Pinecone (lazy-loaded to avoid crashes when unconfigured) ─────────────────
let pineconeClient = null;
let pineconeIndex = null;

/**
 * Initialises the Pinecone client and index connection.
 * Returns `true` on success, `false` if credentials are missing or the
 * connection fails (in which case the local fallback is used).
 */
async function initPinecone() {
  if (pineconeIndex) return true; // Already initialised

  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX_NAME;

  if (!apiKey || apiKey.startsWith('your_') || !indexName) {
    console.log('[RAG] Pinecone credentials not configured — will use local fallback');
    return false;
  }

  try {
    const { Pinecone } = await import('@pinecone-database/pinecone');
    pineconeClient = new Pinecone({ apiKey });
    pineconeIndex = pineconeClient.index(indexName);
    console.log(`[RAG] ✓ Connected to Pinecone index: ${indexName}`);
    return true;
  } catch (err) {
    console.warn('[RAG] ⚠ Pinecone initialisation failed:', err.message);
    console.warn('[RAG]   Falling back to local filesystem retrieval');
    return false;
  }
}

/**
 * Queries the Pinecone vector index using Gemini embeddings of the error context.
 * Returns the top-k matching code chunks concatenated as a single string.
 *
 * @param {object} parsedLog  Output of Agent 1
 * @returns {Promise<string|null>} Retrieved code context, or null if nothing found
 */
async function queryVectorStore(parsedLog) {
  try {
    // Build a semantically rich query from the parsed log
    const queryText = [
      `Error: ${parsedLog.errorType}`,
      `File: ${parsedLog.filePath}`,
      `Line: ${parsedLog.lineNumber}`,
      `Message: ${parsedLog.rawMessage}`,
    ].join(' | ');

    console.log('[RAG] Generating Gemini embedding for query:', queryText.slice(0, 120), '…');
    
    const embedRes = await ai.models.embedContent({
      model: 'gemini-embedding-2',
      contents: queryText,
    });

    if (!embedRes.embedding?.values) {
      throw new Error('Failed to generate embeddings from Gemini API');
    }

    const queryVector = embedRes.embedding.values;

    const results = await pineconeIndex.query({
      vector: queryVector,
      topK: 5,
      includeMetadata: true,
    });

    if (!results.matches?.length) {
      console.log('[RAG] No vector matches found');
      return null;
    }

    console.log(`[RAG] ✓ Retrieved ${results.matches.length} vector matches`);

    // Concatenate matched code chunks with metadata headers
    const contextParts = results.matches.map((match, i) => {
      const meta = match.metadata || {};
      return [
        `── Match ${i + 1} (score: ${match.score?.toFixed(3)}) ──`,
        `File: ${meta.filePath || 'unknown'}`,
        `Lines: ${meta.startLine || '?'}-${meta.endLine || '?'}`,
        '',
        meta.content || meta.text || '(no content)',
      ].join('\n');
    });

    return contextParts.join('\n\n');
  } catch (err) {
    console.warn('[RAG] ⚠ Vector query failed:', err.message);
    return null;
  }
}

/**
 * Reads the target file from the local workspace and extracts a window of
 * lines surrounding the error location.
 *
 * @param {object} parsedLog  Output of Agent 1
 * @returns {string|null}
 */
function readLocalFile(parsedLog) {
  const workspacePath = process.env.LOCAL_WORKSPACE_PATH || '.';

  // The filePath from the stack trace may be absolute or relative —
  // try several resolution strategies.
  const relativeFilePath = parsedLog.filePath.replace(/^[\\\/]+/, '');

  const candidatePaths = [
    path.resolve(workspacePath, relativeFilePath),
    path.resolve(workspacePath, parsedLog.filePath),
    path.resolve(workspacePath, path.basename(parsedLog.filePath)),
    path.resolve(parsedLog.filePath),
  ];

  for (const candidate of candidatePaths) {
    if (!fs.existsSync(candidate)) continue;

    console.log(`[RAG] 📂 Reading local file: ${candidate}`);
    const fileContent = fs.readFileSync(candidate, 'utf-8');
    const lines = fileContent.split('\n');

    // Extract a context window: ±30 lines around the error line
    const targetLine = parsedLog.lineNumber || 1;
    const windowSize = 30;
    const startLine = Math.max(0, targetLine - windowSize - 1);
    const endLine = Math.min(lines.length, targetLine + windowSize);

    const contextLines = lines.slice(startLine, endLine).map((line, idx) => {
      const lineNum = startLine + idx + 1;
      const marker = lineNum === targetLine ? ' >>>' : '    ';
      return `${marker} ${String(lineNum).padStart(4)} | ${line}`;
    });

    const header = [
      `── Local File Context ──`,
      `File: ${candidate}`,
      `Lines: ${startLine + 1}-${endLine} (error at line ${targetLine})`,
      '',
    ].join('\n');

    return header + contextLines.join('\n');
  }

  console.warn(`[RAG] ⚠ Could not locate file locally: ${parsedLog.filePath}`);
  return null;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Retrieves code context for the error identified by Agent 1.
 * Tries Pinecone vector search first; falls back to local file reading.
 *
 * @param {object} parsedLog  { errorType, filePath, lineNumber, rawMessage }
 * @returns {Promise<string>}  Code context string (guaranteed non-empty)
 */
export async function retrieveCodeContext(parsedLog) {
  if (!parsedLog || parsedLog.filePath === 'unknown') {
    console.warn('[RAG] ⚠ No valid file path to retrieve context for');
    return `[No code context available — file path could not be determined from the stack trace]\n\nRaw error: ${parsedLog?.rawMessage ?? 'N/A'}`;
  }

  console.log(`[RAG] Retrieving context for: ${parsedLog.filePath}:${parsedLog.lineNumber}`);

  // Strategy 1: Vector store (Pinecone)
  const pineconeReady = await initPinecone();
  if (pineconeReady) {
    const vectorContext = await queryVectorStore(parsedLog);
    if (vectorContext) {
      console.log('[RAG] ✓ Using Pinecone vector context');
      return vectorContext;
    }
  }

  // Strategy 2: Local filesystem
  const localContext = readLocalFile(parsedLog);
  if (localContext) {
    console.log('[RAG] ✓ Using local filesystem context');
    return localContext;
  }

  // Strategy 3: Return whatever info we have
  console.warn('[RAG] ⚠ No context source available — returning metadata only');
  return [
    `[Code context unavailable]`,
    `File:    ${parsedLog.filePath}`,
    `Line:    ${parsedLog.lineNumber}`,
    `Error:   ${parsedLog.errorType}`,
    `Message: ${parsedLog.rawMessage}`,
  ].join('\n');
}
