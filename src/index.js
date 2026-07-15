#!/usr/bin/env node

/**
 * AI-Powered Code Reviewer
 * Analyzes GitHub Pull Requests using LLMs to detect performance issues, bugs, and security vulnerabilities
 */

const Fastify = require('fastify');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const Analyzer = require('./analyzer/Analyzer');

dotenv.config();

// Initialize Fastify
const app = Fastify({
  logger: {
    level: 'info',
    transport: process.env.NODE_ENV === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
          }
        }
  },
  bodyLimit: 10 * 1024 * 1024 // GitHub PR payloads can be large
});

// Initialize analyzer
const analyzer = new Analyzer();

// Lazily-created Octokit client (only when we need to fetch PR files).
let _octokit = null;
function getOctokit() {
  if (!process.env.GITHUB_TOKEN) return null;
  if (!_octokit) {
    const { Octokit } = require('@octokit/rest');
    _octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  }
  return _octokit;
}

// Verify webhook signature (GitHub "X-Hub-Signature-256: sha256=<hmac>")
function verifySignature(rawBody, signature, secret) {
  if (!secret) return true; // Skip if no secret configured
  if (!signature) return false;

  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);

  // Length check avoids timingSafeEqual throwing on mismatched buffers.
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

/**
 * Build the code payload the analyzer will see. The `pull_request` webhook event
 * does NOT contain file contents, so when a token is available we fetch the real
 * diffs via the GitHub API; otherwise we fall back to whatever is in the payload.
 */
async function getPrPatches(payload) {
  const pr = payload.pull_request;

  if (payload.repository && payload.repository.full_name) {
    const octokit = getOctokit();
    if (octokit) {
      try {
        const [owner, repo] = payload.repository.full_name.split('/');
        const { data: files } = await octokit.pulls.listFiles({
          owner,
          repo,
          pull_number: pr.number,
          per_page: 100
        });
        return files
          .map(f => `// file: ${f.filename}\n${f.patch || ''}`)
          .filter(chunk => chunk.trim().length)
          .join('\n\n');
      } catch (err) {
        app.log.warn(`Could not fetch PR files from API (${err.message}); using payload only.`);
      }
    }
  }

  // Fallback: some payloads include a `files` array of metadata objects.
  const files = pr.files || [];
  return files
    .map(f => `// file: ${f.filename}\n${f.patch || ''}`)
    .join('\n\n');
}

const VALID_ANALYSIS_TYPES = new Set(['performance', 'bugs', 'security']);

// GitHub webhook endpoint
app.post('/github/webhook', {
  config: {
    rawBody: true
  }
}, async (request, reply) => {
  const signature = request.headers['x-github-signature-256'];
  const payload = request.body;

  // Verify signature against the RAW request bytes (not re-serialized JSON).
  if (!verifySignature(request.rawBody, signature, process.env.GITHUB_WEBHOOK_SECRET)) {
    return reply.code(401).send({ error: 'Invalid signature' });
  }

  // Process only pull request events
  if (!payload || !payload.pull_request) {
    return { status: 'ignored' };
  }

  app.log.info(`Processing PR #${payload.pull_request.number}: ${payload.action}`);

  try {
    const patches = await getPrPatches(payload);

    // Run all three analyses concurrently.
    const results = await Promise.all([
      analyzer.analyzeCode(patches, 'performance'),
      analyzer.analyzeCode(patches, 'bugs'),
      analyzer.analyzeCode(patches, 'security')
    ]);

    // Combine results
    const allIssues = [...results[0].issues, ...results[1].issues, ...results[2].issues];

    // Log findings
    allIssues.forEach(issue => {
      app.log.info(`Found ${issue.type} issue: ${issue.message}`);
    });

    return {
      status: 'analyzed',
      issues: allIssues.length,
      summary: results.map(r => r.summary).join('\n\n')
    };
  } catch (error) {
    app.log.error(error);
    return reply.code(500).send({ error: 'Analysis failed' });
  }
});

// Interactive UI — serves public/index.html (the visual reviewer)
app.get('/', async (request, reply) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    reply.type('text/html').send(html);
  } catch (err) {
    reply.code(404).send({ error: 'UI not found. Expected public/index.html' });
  }
});

// Health check endpoint
app.get('/health', async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      openai: !!process.env.OPENAI_API_KEY,
      gemini: !!process.env.GOOGLE_GEMINI_API_KEY,
      openrouter: !!process.env.OPENROUTER_API_KEY
    }
  };
});

// Demo endpoint
app.post('/analyze-demo', async (request, reply) => {
  const { code, analysisType = 'performance' } = request.body || {};

  if (typeof code !== 'string' || !code.trim()) {
    return reply.code(400).send({ error: 'Code is required' });
  }
  if (!VALID_ANALYSIS_TYPES.has(analysisType)) {
    return reply.code(400).send({
      error: `analysisType must be one of: ${[...VALID_ANALYSIS_TYPES].join(', ')}`
    });
  }

  try {
    const result = await analyzer.analyzeCode(code, analysisType);
    return { analysis: result };
  } catch (error) {
    return reply.code(500).send({ error: error.message });
  }
});

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT) || 3000;
    await app.listen({ port, host: process.env.HOST || '0.0.0.0' });
    console.log(`
🚀 AI-Powered Code Reviewer running
📍 http://localhost:${port}
📝 Webhook: ${port}/github/webhook
📊 Test: POST ${port}/analyze-demo
    `);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();