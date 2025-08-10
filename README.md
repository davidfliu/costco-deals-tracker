# Costco Travel Deal Watcher

A serverless monitoring system that tracks promotional changes on Costco Travel URLs and sends Slack notifications when material changes are detected.

## Project Structure

```
├── src/
│   ├── index.ts          # Main Cloudflare Worker entry point
│   ├── types.ts          # TypeScript interfaces and types
│   ├── utils.ts          # Utility functions (hashing, text processing, HTML parsing, HTTP client)
│   ├── kv-storage.ts     # KV storage operations (targets, state, history management)
│   ├── index.test.ts     # Main application tests
│   ├── utils.test.ts     # Utility function tests
│   └── kv-storage.test.ts # KV storage operation tests
├── wrangler.toml         # Cloudflare Worker configuration
├── package.json          # Node.js dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── vitest.config.ts      # Test configuration
└── progress.md           # Development progress tracking
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run tests:
   ```bash
   npm test
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

4. Deploy to Cloudflare:
   ```bash
   npm run deploy
   ```

## Wrangler Version

This project uses Wrangler 4.x. Make sure to use `npx wrangler` for all Wrangler commands.

## Environment Variables

Before deploying, set up the following environment variables:

- `ADMIN_TOKEN`: Secret token for admin API access
- `SLACK_WEBHOOK`: Slack incoming webhook URL

## KV Namespace

Create a KV namespace called `DEAL_WATCHER` and update the namespace ID in `wrangler.toml`.

## Development Status

This project is currently in active development. See `progress.md` for detailed implementation status and recent changes.

### Completed Features
- ✅ URL hashing utilities for stable KV key generation
- ✅ Text normalization and noise filtering for promotional content
- ✅ Promotion ID generation using content-based hashing
- ✅ HTML parsing and content extraction using HTMLRewriter
- ✅ Content fetching with proper headers and error handling
- ✅ Change detection engine with material change filtering
- ✅ Complete KV storage layer with target, state, and history management
- ✅ Authentication middleware with constant-time token validation
- ✅ Admin API target management endpoints (GET/POST /admin/targets)
- ✅ Manual run endpoint (POST /admin/run) with target processing simulation
- ✅ Comprehensive unit test coverage with 100% test coverage

### In Progress
- 🔄 Slack notification system
- 🔄 Core monitoring logic