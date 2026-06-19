// ─────────────────────────────────────────────────────────────────────────────
// src/agents/gitBridge.js — Agent 4: Git Bridge
// Automates the GitHub workflow: create branch → update file → commit → open PR.
// Uses the GitHub REST API via @octokit/rest to perform all operations
// without needing a local git clone.
// ─────────────────────────────────────────────────────────────────────────────

import { Octokit } from '@octokit/rest';

/**
 * Creates an authenticated Octokit instance.
 * Validates that the required token is present.
 */
function createOctokitClient() {
  const token = process.env.GITHUB_TOKEN;
  if (!token || token.startsWith('ghp_your')) {
    throw new Error(
      'GITHUB_TOKEN is not configured. Set a valid Personal Access Token with `repo` scope in .env'
    );
  }

  return new Octokit({ auth: token });
}

/**
 * Applies the AI-generated patch to the target repository by:
 *   1. Retrieving the latest commit SHA from the base branch
 *   2. Creating a new branch from that commit
 *   3. Fetching the current file content
 *   4. Replacing the broken code snippet with the fixed version
 *   5. Committing the patched file to the new branch
 *   6. Opening a Pull Request with a detailed description
 *
 * @param {object} patchData
 * @param {string} patchData.file_path      Relative path in the repo
 * @param {string} patchData.original_code  Code snippet to replace
 * @param {string} patchData.fixed_code     Replacement code snippet
 * @param {string} patchData.explanation    Root cause + fix explanation
 * @param {string} patchData.repoOwner      Repository owner (org or user)
 * @param {string} patchData.repoName       Repository name
 * @param {number} patchData.issueNumber    Originating issue number
 * @param {string} patchData.issueTitle     Originating issue title
 *
 * @returns {{ html_url: string, number: number, branch: string }}
 */
export async function applyPatchAndOpenPR(patchData) {
  const octokit = createOctokitClient();

  const owner = patchData.repoOwner || process.env.GITHUB_OWNER;
  const repo = patchData.repoName || process.env.GITHUB_REPO;
  const baseBranch = 'main';

  if (!owner || !repo) {
    throw new Error('Repository owner/name not specified in patchData or .env (GITHUB_OWNER / GITHUB_REPO)');
  }

  console.log(`[GitBridge] Target repo: ${owner}/${repo}`);
  console.log(`[GitBridge] File to patch: ${patchData.file_path}`);

  // ── Step 1: Get the latest commit SHA on the base branch ────────────────
  console.log(`[GitBridge] Step 1/5 — Fetching latest commit on '${baseBranch}'…`);

  let baseSha;
  try {
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${baseBranch}`,
    });
    baseSha = refData.object.sha;
    console.log(`[GitBridge]   Base SHA: ${baseSha.slice(0, 12)}…`);
  } catch (err) {
    throw new Error(`Failed to get base branch '${baseBranch}': ${err.message}`);
  }

  // ── Step 2: Create a new branch ─────────────────────────────────────────
  const timestamp = Date.now();
  const branchName = `ai-triage-fix-${timestamp}`;

  console.log(`[GitBridge] Step 2/5 — Creating branch '${branchName}'…`);

  try {
    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    });
    console.log(`[GitBridge]   ✓ Branch created`);
  } catch (err) {
    throw new Error(`Failed to create branch '${branchName}': ${err.message}`);
  }

  // ── Step 3: Fetch the current file content ──────────────────────────────
  console.log(`[GitBridge] Step 3/5 — Fetching file: ${patchData.file_path}…`);

  let fileContent;
  let fileSha;

  try {
    const { data: fileData } = await octokit.repos.getContent({
      owner,
      repo,
      path: patchData.file_path,
      ref: branchName,
    });

    fileContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
    fileSha = fileData.sha;
    console.log(`[GitBridge]   File SHA: ${fileSha.slice(0, 12)}…`);
    console.log(`[GitBridge]   File size: ${fileContent.length} chars`);
  } catch (err) {
    throw new Error(`Failed to fetch file '${patchData.file_path}': ${err.message}`);
  }

  // ── Step 4: Apply the patch (string replacement) ────────────────────────
  console.log(`[GitBridge] Step 4/5 — Applying code patch…`);

  if (!fileContent.includes(patchData.original_code)) {
    console.warn('[GitBridge] ⚠ Exact original_code not found in file — attempting fuzzy match');

    // Fuzzy match: normalize whitespace and try again
    const normalizeWs = (s) => s.replace(/\s+/g, ' ').trim();
    const normalizedFile = normalizeWs(fileContent);
    const normalizedOriginal = normalizeWs(patchData.original_code);

    if (!normalizedFile.includes(normalizedOriginal)) {
      console.warn('[GitBridge] ⚠ Fuzzy match also failed — appending fix as a comment block');
      // As a last resort, append the fix at the end of the file with a comment
      const appendBlock = [
        '',
        '// ─── AI TRIAGE FIX (could not locate exact original code) ───',
        `// Original code to replace:`,
        ...patchData.original_code.split('\n').map((l) => `//   ${l}`),
        '',
        '// Suggested fix:',
        patchData.fixed_code,
        '// ─── END AI TRIAGE FIX ───',
        '',
      ].join('\n');

      fileContent = fileContent + appendBlock;
    } else {
      // Perform the replacement on the original (non-normalised) content
      // by finding the approximate location
      console.log('[GitBridge] ✓ Fuzzy match succeeded — applying replacement');
      fileContent = fileContent.replace(patchData.original_code.trim(), patchData.fixed_code);
    }
  } else {
    fileContent = fileContent.replace(patchData.original_code, patchData.fixed_code);
    console.log('[GitBridge] ✓ Exact code replacement applied');
  }

  // ── Step 5: Commit the patched file ─────────────────────────────────────
  console.log(`[GitBridge] Step 5/5 — Committing changes…`);

  const commitMessage = `fix: AI triage auto-fix for ${patchData.file_path}\n\n${patchData.explanation}\n\nCloses #${patchData.issueNumber}`;

  try {
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: patchData.file_path,
      message: commitMessage,
      content: Buffer.from(fileContent, 'utf-8').toString('base64'),
      sha: fileSha,
      branch: branchName,
    });
    console.log('[GitBridge]   ✓ Commit pushed');
  } catch (err) {
    throw new Error(`Failed to commit patched file: ${err.message}`);
  }

  // ── Step 6: Open a Pull Request ─────────────────────────────────────────
  console.log('[GitBridge] Opening Pull Request…');

  const prTitle = `🤖 AI Triage Fix: ${patchData.issueTitle || patchData.file_path}`;
  const prBody = buildPRBody(patchData);

  try {
    const { data: pr } = await octokit.pulls.create({
      owner,
      repo,
      title: prTitle,
      body: prBody,
      head: branchName,
      base: baseBranch,
    });

    console.log(`[GitBridge] ✓ Pull Request created: ${pr.html_url}`);
    console.log(`[GitBridge]   PR #${pr.number}: ${prTitle}`);

    return {
      html_url: pr.html_url,
      number: pr.number,
      branch: branchName,
    };
  } catch (err) {
    throw new Error(`Failed to create Pull Request: ${err.message}`);
  }
}

// ── PR Description Builder ───────────────────────────────────────────────────

/**
 * Constructs a rich, structured Pull Request description.
 */
function buildPRBody(patchData) {
  return `## 🤖 Automated AI Triage Fix

This pull request was automatically generated by the **DevOps Autonomous Incident Triage Pipeline**.

### 📋 Issue Reference
Closes #${patchData.issueNumber}

---

### 🔍 Root Cause Analysis
${patchData.explanation}

---

### 📂 File Modified
\`${patchData.file_path}\`

### ❌ Original Code
\`\`\`javascript
${patchData.original_code}
\`\`\`

### ✅ Fixed Code
\`\`\`javascript
${patchData.fixed_code}
\`\`\`

---

### ⚠️ Review Checklist
- [ ] Verify the fix resolves the reported error
- [ ] Check for potential regressions
- [ ] Confirm code style consistency
- [ ] Run existing tests against the fix
- [ ] Validate in staging environment before merging

---

> 🧠 *This fix was generated by an AI agent (GPT-4o acting as a Principal SRE).*
> *Always review AI-generated code carefully before merging to production.*
`;
}
