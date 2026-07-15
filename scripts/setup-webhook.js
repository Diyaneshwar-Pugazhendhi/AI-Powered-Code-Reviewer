#!/usr/bin/env node

/**
 * GitHub Webhook Setup Helper
 *
 * Registers a repository webhook that points at your running instance of the
 * AI-Powered Code Reviewer, so GitHub notifies it whenever a pull request is
 * opened or updated.
 *
 * Usage:
 *   node scripts/setup-webhook.js --url https://your-host/github/webhook
 *
 * Required environment variables (see .env.example):
 *   GITHUB_TOKEN            Personal access token with `repo` + `admin:repo_hook`
 *   GITHUB_OWNER            Repository owner (user or org)
 *   GITHUB_REPO             Repository name
 *   GITHUB_WEBHOOK_SECRET   (optional) shared secret for payload verification
 */

const { Octokit } = require('@octokit/rest');
require('dotenv').config();

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url') args.url = argv[i + 1];
  }
  return args;
}

async function main() {
  const { url } = parseArgs(process.argv.slice(2));
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_WEBHOOK_SECRET } = process.env;

  if (!url) {
    console.error('❌ Missing --url. Example:\n   node scripts/setup-webhook.js --url https://your-host/github/webhook');
    process.exit(1);
  }
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    console.error('❌ Missing GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO in your environment (.env).');
    process.exit(1);
  }

  const octokit = new Octokit({ auth: GITHUB_TOKEN });

  try {
    const { data } = await octokit.repos.createWebhook({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      config: {
        url,
        content_type: 'json',
        secret: GITHUB_WEBHOOK_SECRET || undefined
      },
      events: ['pull_request'],
      active: true
    });

    console.log(`✅ Webhook created (id: ${data.id})`);
    console.log(`   Delivering 'pull_request' events to: ${url}`);
  } catch (error) {
    console.error('❌ Failed to create webhook:', error.message);
    process.exit(1);
  }
}

main();
