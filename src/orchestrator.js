// ─────────────────────────────────────────────────────────────────────────────
// src/orchestrator.js — The Central Brain
// Coordinates the sequential multi-agent triage pipeline:
//   Raw Issue → Agent 1 (Log Parser) → Agent 2 (RAG Retriever)
//             → Agent 3 (Code Repair) → Agent 4 (Git Bridge)
// ─────────────────────────────────────────────────────────────────────────────

import { parseLog } from './agents/logParser.js';
import { retrieveCodeContext } from './agents/ragRetriever.js';
import { generateFix } from './agents/codeRepair.js';
import { applyPatchAndOpenPR } from './agents/gitBridge.js';
import { pipelineEmitter } from './eventBus.js';

/**
 * Execution context that flows through the pipeline, accumulating output
 * from each agent. Enables auditing, logging, and potential retry logic.
 */
function createPipelineContext(issuePayload) {
  return {
    startedAt: new Date().toISOString(),
    issuePayload,
    parsedLog: null,
    codeContext: null,
    patchData: null,
    pullRequest: null,
    errors: [],
    agentTimings: {},
  };
}

/**
 * Times an async agent function, logs transitions, and writes results into
 * the pipeline context.
 *
 * @param {string} agentName   Human-readable agent label
 * @param {Function} agentFn   Async function to execute
 * @param {object} ctx         Pipeline context object (mutated in place)
 * @param {string} outputKey   Key on `ctx` to write the agent result into
 * @returns {*} The agent's return value (also stored in ctx[outputKey])
 */
async function runAgent(agentName, agentFn, ctx, outputKey) {
  const divider = '─'.repeat(60);
  console.log(`\n${divider}`);
  console.log(`[Orchestrator] ▶ Starting ${agentName}`);
  console.log(divider);

  pipelineEmitter.emit('agent:start', { agentName, timestamp: new Date().toISOString() });

  const t0 = performance.now();

  try {
    const result = await agentFn();
    const elapsed = (performance.now() - t0).toFixed(1);
    ctx.agentTimings[agentName] = `${elapsed}ms`;

    if (outputKey) {
      ctx[outputKey] = result;
    }

    console.log(`[Orchestrator] ✓ ${agentName} completed in ${elapsed}ms`);
    pipelineEmitter.emit('agent:complete', { agentName, elapsed, result, timestamp: new Date().toISOString() });
    return result;
  } catch (err) {
    const elapsed = (performance.now() - t0).toFixed(1);
    ctx.agentTimings[agentName] = `FAILED @ ${elapsed}ms`;
    ctx.errors.push({ agent: agentName, error: err.message, stack: err.stack });

    console.error(`[Orchestrator] ✗ ${agentName} FAILED after ${elapsed}ms`);
    console.error(`  └─ ${err.message}`);

    pipelineEmitter.emit('agent:error', { agentName, error: err.message, elapsed, timestamp: new Date().toISOString() });
    throw err; // Re-throw to halt the pipeline
  }
}

// ── Main Pipeline ────────────────────────────────────────────────────────────
/**
 * Runs the full incident triage pipeline. Each agent receives the accumulated
 * output from all prior agents, enforcing a strict sequential data flow.
 *
 * @param {object} issuePayload
 * @param {number} issuePayload.issueNumber
 * @param {string} issuePayload.issueTitle
 * @param {string} issuePayload.issueBody
 * @param {string} issuePayload.issueUrl
 * @param {string} issuePayload.repoOwner
 * @param {string} issuePayload.repoName
 */
export async function runTriagePipeline(issuePayload) {
  const ctx = createPipelineContext(issuePayload);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║           INCIDENT TRIAGE PIPELINE – STARTING               ║');
  console.log(`║  Issue #${String(issuePayload.issueNumber).padEnd(51)}║`);
  console.log(`║  "${issuePayload.issueTitle.slice(0, 49).padEnd(51)}"║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  pipelineEmitter.emit('pipeline:start', { issuePayload, timestamp: new Date().toISOString() });

  try {
    // ── Agent 1: Log Parser ────────────────────────────────────────────────
    await runAgent(
      'Agent 1 — Log Parser',
      () => parseLog(issuePayload.issueBody, issuePayload.issueTitle),
      ctx,
      'parsedLog'
    );

    console.log('[Orchestrator] 📋 Parsed log:', JSON.stringify(ctx.parsedLog, null, 2));

    // ── Agent 2: RAG Retriever ─────────────────────────────────────────────
    await runAgent(
      'Agent 2 — RAG Retriever',
      () => retrieveCodeContext(ctx.parsedLog),
      ctx,
      'codeContext'
    );

    console.log('[Orchestrator] 📂 Code context length:', ctx.codeContext?.length ?? 0, 'chars');

    // ── Agent 3: Code Repair ───────────────────────────────────────────────
    await runAgent(
      'Agent 3 — Code Repair (LLM)',
      () => generateFix(ctx.parsedLog, ctx.codeContext),
      ctx,
      'patchData'
    );

    console.log('[Orchestrator] 🔧 Patch data:', JSON.stringify(ctx.patchData, null, 2));

    // ── Agent 4: Git Bridge ────────────────────────────────────────────────
    await runAgent(
      'Agent 4 — Git Bridge',
      () =>
        applyPatchAndOpenPR({
          ...ctx.patchData,
          repoOwner: issuePayload.repoOwner,
          repoName: issuePayload.repoName,
          issueNumber: issuePayload.issueNumber,
          issueTitle: issuePayload.issueTitle,
        }),
      ctx,
      'pullRequest'
    );

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║           INCIDENT TRIAGE PIPELINE – COMPLETE               ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('[Orchestrator] 🎉 Pipeline Summary:');
    console.log(`  ├─ Issue:    #${issuePayload.issueNumber}`);
    console.log(`  ├─ Error:    ${ctx.parsedLog.errorType}`);
    console.log(`  ├─ File:     ${ctx.parsedLog.filePath}`);
    console.log(`  ├─ Line:     ${ctx.parsedLog.lineNumber}`);
    console.log(`  ├─ Fix PR:   ${ctx.pullRequest?.html_url ?? 'N/A'}`);
    console.log('  └─ Timings:', JSON.stringify(ctx.agentTimings));

    pipelineEmitter.emit('pipeline:complete', { ctx, timestamp: new Date().toISOString() });
    return ctx;
  } catch (err) {
    console.error('\n╔══════════════════════════════════════════════════════════════╗');
    console.error('║           INCIDENT TRIAGE PIPELINE – FAILED                 ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    console.error('[Orchestrator] Fatal error:', err.message);
    console.error('[Orchestrator] Errors collected:', JSON.stringify(ctx.errors, null, 2));
    console.error('[Orchestrator] Timings so far:', JSON.stringify(ctx.agentTimings));

    pipelineEmitter.emit('pipeline:error', { error: err.message, ctx, timestamp: new Date().toISOString() });
    return ctx;
  }
}
