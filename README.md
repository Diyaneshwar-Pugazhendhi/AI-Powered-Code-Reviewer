# 🤖 AI-Powered Code Reviewer

An automated code review service that integrates with GitHub and uses Large Language Models (OpenAI GPT-4 and Google Gemini) to analyze Pull Requests for **performance bottlenecks**, **bugs**, and **security vulnerabilities** — posting its findings automatically.

Built with Node.js and [Fastify](https://fastify.dev/).

---

## ✨ Features

- **GitHub webhook integration** — automatically analyzes every Pull Request that's opened or updated.
- **Multi-model analysis** — routes each concern to the model best suited for it:
  - `OpenAI GPT-4` → performance & bug analysis
  - `Google Gemini` → security analysis
- **Three analysis dimensions:**
  - ⚡ **Performance** — time complexity (Big O), inefficient loops, caching opportunities, I/O patterns
  - 🐛 **Bugs** — null dereferences, race conditions, type mismatches, edge cases
  - 🔒 **Security** — injection, auth flaws, weak crypto, sensitive data exposure
- **Structured JSON output** — every finding includes severity, file, line, message, and a concrete suggestion.
- **Graceful degradation** — boots and serves requests even without API keys configured (useful for demos).
- **HMAC signature verification** — validates GitHub webhook payloads when a secret is set.
- **Fully tested** — Jest unit tests with mocked LLM responses (no API keys needed to run the suite).

---

## 🏗️ Architecture

```
GitHub PR event
      │
      ▼
POST /github/webhook ──► signature check ──► Analyzer
                                               │
                        ┌──────────────────────┼──────────────────────┐
                        ▼                       ▼                       ▼
                  performance (GPT-4)     bugs (GPT-4)         security (Gemini)
                        │                       │                       │
                        └──────────────────────┼──────────────────────┘
                                               ▼
                                    aggregated JSON findings
```

### Project structure

```
AI-Powered-Code-Reviewer/
├── src/
│   ├── index.js              # Fastify server + routes (webhook, health, demo)
│   └── analyzer/
│       └── Analyzer.js       # LLM orchestration & prompt engineering
├── scripts/
│   └── setup-webhook.js      # Registers the GitHub webhook via the API
├── tests/
│   └── analyzer.test.js      # Jest unit tests (mocked LLMs)
├── .env.example              # Configuration template
├── package.json
└── README.md
```

---

## 🚀 Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Then edit `.env`:

```ini
OPENAI_API_KEY=sk-...            # for performance & bug analysis
GOOGLE_GEMINI_API_KEY=...        # for security analysis
GITHUB_TOKEN=ghp_...             # repo + admin:repo_hook scopes
GITHUB_WEBHOOK_SECRET=...        # optional, enables signature verification
PORT=3000
```

> 💡 The server will still start without API keys — analysis endpoints return a clear
> "not configured" message instead of crashing. Great for demoing the app locally.

### 3. Run the server

```bash
npm start          # production
npm run dev        # watch mode (auto-restart on changes)
```

You should see:

```
🚀 AI-Powered Code Reviewer running
📍 http://localhost:3000
```

---

## 🔌 API Reference

### `GET /health`
Health check + reports which LLM providers are configured.

```bash
curl http://localhost:3000/health
```
```json
{ "status": "ok", "timestamp": "...", "services": { "openai": true, "gemini": true } }
```

### `POST /analyze-demo`
Analyze an arbitrary code snippet directly (no GitHub needed) — perfect for demos.

```bash
curl -X POST http://localhost:3000/analyze-demo \
  -H "Content-Type: application/json" \
  -d '{
    "code": "function f(a){for(let i=0;i<a.length;i++){for(let j=0;j<a.length;j++){if(a[i]===a[j])return true;}}return false;}",
    "analysisType": "performance"
  }'
```

`analysisType` is one of `performance` | `bugs` | `security` (default: `performance`).

### `POST /github/webhook`
The endpoint GitHub calls on pull request events. Verifies the HMAC signature (when a
secret is configured), runs all three analyses, and returns the aggregated findings.

---

## 🪝 Registering the GitHub Webhook

With `GITHUB_TOKEN`, `GITHUB_OWNER`, and `GITHUB_REPO` set in `.env`:

```bash
node scripts/setup-webhook.js --url https://your-host/github/webhook
```

This registers a `pull_request` webhook pointing at your running instance.

---

## 🧪 Testing

```bash
npm test
```

The suite mocks both the OpenAI and Gemini SDKs, so **no API keys are required**:

```
PASS tests/analyzer.test.js
  AI-Powered Code Reviewer
    analyzeCode
      ✓ should analyze code for performance issues
      ✓ should analyze code for bugs
      ✓ should analyze code for security issues
      ✓ should handle code without issues gracefully
      ✓ should parse JSON correctly from markdown blocks
    parseAnalysisResult
      ✓ should return fallback for invalid JSON

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
```

---

## 🛠️ Tech Stack

| Concern            | Choice                          |
| ------------------ | ------------------------------- |
| Runtime            | Node.js                         |
| HTTP server        | Fastify 5                       |
| LLMs               | OpenAI GPT-4, Google Gemini 1.5 |
| GitHub API         | `@octokit/rest`                 |
| Testing            | Jest                            |
| Config             | dotenv                          |

---

## 📄 License

MIT
