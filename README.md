# DevOps Autonomous Incident Triage Pipeline (Demo Version)

Welcome to the **DevOps Autonomous Incident Triage Pipeline**! 

This project is a fully autonomous, AI-driven pipeline that automatically detects, triages, and fixes software bugs reported as GitHub Issues. It uses a multi-agent system powered by LLMs (OpenAI/GPT-4o) to act as a virtual Site Reliability Engineer (SRE), drastically reducing the time required to investigate and resolve code-level incidents.

## 🚀 How It Works (The Workflow)

The pipeline is triggered automatically the moment an issue is created on your GitHub repository.

1. **GitHub Issue Created:** You (or a system) create a GitHub Issue containing an error log or bug description.
2. **Webhook Trigger:** A GitHub webhook sends the event to the Express backend (running locally and exposed via `ngrok`).
3. **Multi-Agent Orchestration:** The backend kicks off a 4-stage pipeline of specialized AI agents:
   * 🕵️ **Agent 1 (Log Parser):** Analyzes the issue body, extracts the error type, identifies the failing file, and determines severity.
   * 🔍 **Agent 2 (RAG Retriever):** Scans the codebase (specifically the `tests/dummy-repo/` directory in this demo) to retrieve the exact broken code and surrounding context.
   * 🛠️ **Agent 3 (Code Repair):** Analyzes the error against the source code, identifies the root cause, and generates a precise patch/fix.
   * 🐙 **Agent 4 (Git Bridge):** Authenticates with GitHub, creates a new branch, applies the fix, commits it, and opens a Pull Request automatically.
4. **Real-time Monitoring:** The entire process is streamed via Server-Sent Events (SSE) to a premium React frontend dashboard, allowing you to watch the AI's thought process, agent transitions, and generated patches in real-time.

## ⚠️ Demo Constraints

This version is configured specifically as a **Demo Environment** to allow for easy testing and showcasing:

* **Reusable Bugs:** The `tests/dummy-repo/` folder contains over 20 broken JavaScript files (e.g., `TypeError`, `Off-by-one`, `Unhandled Rejection`). 
* **Remote Patching Only:** When the Git Bridge Agent opens a Pull Request, it does so entirely over the GitHub REST API. **It does NOT modify the local `.js` files on your hard drive.** This is intentional! It ensures that you can test the same bugs multiple times without having to manually break the code again after a successful test. If you merge the PR, the code is fixed on GitHub's `main` branch, but your local files will remain "broken" until you run `git pull`.

## 🛠️ Running the Demo Locally

To run the full stack locally, you need three separate terminal windows:

### 1. Start the Express Backend
This receives webhooks and runs the agent pipeline.
```bash
npm install
npm start
```

### 2. Expose the Backend with ngrok
This gives GitHub a public URL to send webhook events to.
```bash
ngrok http 3000
```
*(Remember to update your GitHub Webhook URL with the new ngrok forwarding address: `https://<your-ngrok-url>/api/webhook`)*

### 3. Start the React Frontend Dashboard
This displays the beautiful real-time UI.
```bash
cd frontend
npm install
npm run dev
```

Navigate to `http://localhost:5173` to view the Live Dashboard!

---

*Note: This is a demonstration setup meant to showcase the autonomous capabilities of multi-agent LLM systems in a DevOps workflow.*
