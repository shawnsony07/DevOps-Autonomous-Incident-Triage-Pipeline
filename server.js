// ─────────────────────────────────────────────────────────────────────────────
// server.js — Webhook Entrance & Entrypoint
// Secure Express server that receives GitHub webhook events, validates the
// HMAC-SHA256 signature, and delegates `issues.opened` events to the
// central orchestrator.
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import { runTriagePipeline } from './src/orchestrator.js';

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

// ── Middleware ────────────────────────────────────────────────────────────────
// We need the raw body buffer for HMAC verification AND the parsed JSON body
// for downstream processing, so we capture both.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      // Attach raw body buffer to the request for signature verification
      req.rawBody = buf;
    },
  })
);

// ── Signature Verification ───────────────────────────────────────────────────
/**
 * Verifies the `X-Hub-Signature-256` header sent by GitHub against a locally
 * computed HMAC-SHA256 digest of the raw request body.
 *
 * @param {import('express').Request} req
 * @returns {boolean} true when the signature is present and valid
 */
function verifyGitHubSignature(req) {
  const signatureHeader = req.headers['x-hub-signature-256'];
  if (!signatureHeader) {
    console.error('[Webhook] ✗ Missing X-Hub-Signature-256 header');
    return false;
  }

  if (!WEBHOOK_SECRET) {
    console.error('[Webhook] ✗ GITHUB_WEBHOOK_SECRET is not set in .env');
    return false;
  }

  const expectedSignature =
    'sha256=' +
    crypto.createHmac('sha256', WEBHOOK_SECRET).update(req.rawBody).digest('hex');

  // Constant-time comparison to prevent timing attacks
  const trusted = Buffer.from(expectedSignature, 'ascii');
  const untrusted = Buffer.from(signatureHeader, 'ascii');

  if (trusted.length !== untrusted.length) {
    console.error('[Webhook] ✗ Signature length mismatch');
    return false;
  }

  if (!crypto.timingSafeEqual(trusted, untrusted)) {
    console.error('[Webhook] ✗ Signature verification failed');
    return false;
  }

  return true;
}

// ── Webhook Route ────────────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('[Webhook] Incoming event at', new Date().toISOString());
  console.log('══════════════════════════════════════════════════════════════');

  // 1. Verify cryptographic signature
  if (!verifyGitHubSignature(req)) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }
  console.log('[Webhook] ✓ Signature verified');

  // 2. Filter for the `issues` event with action `opened`
  const githubEvent = req.headers['x-github-event'];
  const { action } = req.body;

  console.log(`[Webhook] Event: ${githubEvent} | Action: ${action}`);

  if (githubEvent !== 'issues' || action !== 'opened') {
    console.log('[Webhook] ⏭  Ignoring – not an issues.opened event');
    return res.status(200).json({ message: 'Event ignored – not issues.opened' });
  }

  // 3. Extract the issue payload
  const issuePayload = {
    issueNumber: req.body.issue.number,
    issueTitle: req.body.issue.title,
    issueBody: req.body.issue.body,
    issueUrl: req.body.issue.html_url,
    repoOwner: req.body.repository.owner.login,
    repoName: req.body.repository.name,
  };

  console.log(`[Webhook] 📨 Issue #${issuePayload.issueNumber}: "${issuePayload.issueTitle}"`);

  // 4. Acknowledge receipt immediately, then process asynchronously
  res.status(202).json({
    message: 'Webhook received – triage pipeline initiated',
    issueNumber: issuePayload.issueNumber,
  });

  // 5. Fire-and-forget the triage pipeline (errors are caught internally)
  try {
    await runTriagePipeline(issuePayload);
  } catch (err) {
    console.error('[Webhook] ✗ Unhandled pipeline error:', err);
  }
});

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'DevOps Autonomous Incident Triage Pipeline',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
┌──────────────────────────────────────────────────────────┐
│  DevOps Autonomous Incident Triage Pipeline              │
│  Listening on port ${String(PORT).padEnd(37)}│
│  Webhook endpoint: POST /webhook                         │
│  Health check:     GET  /health                          │
└──────────────────────────────────────────────────────────┘
  `);
});

export default app;
