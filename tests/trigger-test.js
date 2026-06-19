// ─────────────────────────────────────────────────────────────────────────────
// tests/trigger-test.js — Local Test Harness
// Simulates a GitHub webhook `issues.opened` event by sending a POST to the
// local server with a realistic crash log payload and a valid HMAC signature.
//
// Usage:
//   1. Start the server:  npm start
//   2. Run this test:     npm run test:trigger
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import crypto from 'node:crypto';

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'your_webhook_secret_here';
const TARGET_URL = `http://localhost:${PORT}/webhook`;

// ── Simulated GitHub Issue Payload ───────────────────────────────────────────
const issueBody = `## Production Crash Report

**Service:** payment-service
**Environment:** production
**Timestamp:** 2026-06-18T12:30:00Z
**Severity:** CRITICAL

### Stack Trace

\`\`\`
TypeError: Cannot read properties of undefined (reading 'id')
    at processPayment (tests/dummy-repo/broken-payment.js:24:35)
    at PaymentController.handleCheckout (tests/dummy-repo/payment.ctrl.js:87:12)
    at Layer.handle [as handle_request] (node_modules/express/lib/router/layer.js:95:5)
    at next (node_modules/express/lib/router/route.js:144:13)
    at Route.dispatch (node_modules/express/lib/router/route.js:114:3)
    at Layer.handle [as handle_request] (node_modules/express/lib/router/layer.js:95:5)
\`\`\`

### Request Context

- Endpoint: POST /api/v1/checkout
- User ID: usr_abc123
- Cart total: $149.99

### Reproduction

This crash occurs when a guest user (no saved payment method) attempts checkout.
The \`order.paymentMethod\` object is undefined because no default card is set.

### Impact

~15% of checkout attempts are failing. Revenue impact estimated at $12K/hour.
`;

const payload = {
  action: 'opened',
  issue: {
    number: 42,
    title: 'CRITICAL: TypeError in processPayment — checkout failures',
    body: issueBody,
    html_url: 'https://github.com/test-org/test-repo/issues/42',
  },
  repository: {
    owner: { login: process.env.GITHUB_OWNER || 'test-org' },
    name: process.env.GITHUB_REPO || 'test-repo',
  },
};

// ── Generate HMAC-SHA256 Signature ───────────────────────────────────────────
const payloadString = JSON.stringify(payload);
const signature =
  'sha256=' +
  crypto.createHmac('sha256', WEBHOOK_SECRET).update(payloadString).digest('hex');

// ── Send the Request ─────────────────────────────────────────────────────────
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║            TRIGGER TEST — Simulated Webhook Event           ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log(`Target: ${TARGET_URL}`);
console.log(`Event:  issues.opened`);
console.log(`Issue:  #${payload.issue.number} — ${payload.issue.title}`);
console.log(`Sig:    ${signature.slice(0, 30)}…`);
console.log('');

try {
  const response = await fetch(TARGET_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GitHub-Event': 'issues',
      'X-Hub-Signature-256': signature,
      'X-GitHub-Delivery': crypto.randomUUID(),
    },
    body: payloadString,
  });

  const data = await response.json();

  console.log(`Response Status: ${response.status}`);
  console.log('Response Body:', JSON.stringify(data, null, 2));

  if (response.status === 202) {
    console.log('\n✅ Webhook accepted! Check the server console for pipeline progress.');
  } else {
    console.log(`\n⚠ Unexpected status ${response.status}`);
  }
} catch (err) {
  console.error('\n✗ Failed to send webhook:', err.message);
  console.error('  Make sure the server is running: npm start');
}
