# Technology Stack

## Runtime Environment
- **Platform**: Cloudflare Workers (serverless edge computing)
- **Runtime**: V8 JavaScript engine with Node.js compatibility
- **Language**: TypeScript with ES2022 target

## Core Dependencies
- **@cloudflare/workers-types**: TypeScript definitions for Cloudflare Workers APIs
- **wrangler**: Cloudflare Workers CLI tool (v4.x)

## Development Tools
- **TypeScript**: v5.x for type safety and modern JavaScript features
- **Vitest**: Testing framework with Node.js environment
- **Node.js**: v20+ for development tooling

## Key APIs & Services
- **KV Storage**: Cloudflare Workers KV for persistent data storage
- **HTMLRewriter**: Cloudflare's streaming HTML parser for content extraction
- **Cron Triggers**: Scheduled execution every 3 hours
- **Slack Webhooks**: For notification delivery

## Common Commands

### Development
```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Run all tests
npm test
```

### Deployment
```bash
# Deploy to Cloudflare Workers
npm run deploy

# Deploy with specific environment
wrangler deploy --env production
```

### Environment Setup
```bash
# Set environment variables
wrangler secret put ADMIN_TOKEN
wrangler secret put SLACK_WEBHOOK

# Create KV namespace
wrangler kv:namespace create "DEAL_WATCHER"
```

## Configuration Files
- `wrangler.toml`: Cloudflare Workers configuration and environment settings
- `tsconfig.json`: TypeScript compiler configuration with strict mode
- `vitest.config.ts`: Test configuration for Node.js environment
- `package.json`: Dependencies and npm scripts