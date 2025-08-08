# Costco Travel Deal Watcher

A serverless monitoring system that tracks promotional changes on Costco Travel URLs and sends Slack notifications when material changes are detected.

## Project Structure

```
├── src/
│   ├── index.ts          # Main Cloudflare Worker entry point
│   ├── types.ts          # TypeScript interfaces and types
│   └── index.test.ts     # Unit tests
├── wrangler.toml         # Cloudflare Worker configuration
├── package.json          # Node.js dependencies and scripts
├── tsconfig.json         # TypeScript configuration
└── vitest.config.ts      # Test configuration
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