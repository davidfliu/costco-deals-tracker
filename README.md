# Costco Travel Deal Watcher

A serverless monitoring system that tracks promotional changes on Costco Travel URLs and sends Slack notifications when material changes are detected.

## Project Structure

```
├── src/
│   ├── index.ts              # Main Cloudflare Worker entry point
│   ├── types.ts              # TypeScript interfaces and types
│   ├── utils.ts              # Utility functions (hashing, text processing, HTML parsing, HTTP client, Slack notifications, admin endpoints)
│   ├── kv-storage.ts         # KV storage operations (targets, state, history management)
│   ├── target-processing.ts  # Core target processing logic (single and batch processing)
│   ├── index.test.ts         # Main application tests
│   ├── utils.test.ts         # Utility function tests
│   ├── kv-storage.test.ts    # KV storage operation tests
│   ├── target-processing.test.ts # Target processing logic tests
│   ├── auth.test.ts          # Authentication middleware tests
│   ├── target-endpoints.test.ts # Admin API endpoint tests
│   ├── manual-run.test.ts    # Manual run endpoint tests
│   ├── slack-notification.test.ts # Slack notification tests
│   ├── change-detection.test.ts # Change detection tests
│   └── routing.test.ts       # Request routing tests
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

## Environment Setup

### KV Namespaces

Create KV namespaces for different environments:

```bash
# Development namespace
wrangler kv:namespace create "DEAL_WATCHER" --env development

# Production namespace  
wrangler kv:namespace create "DEAL_WATCHER" --env production
```

Update the namespace IDs in `wrangler.toml` with the generated IDs.

### Environment Variables

Set up the following secrets using wrangler:

```bash
# Set admin token for API authentication
wrangler secret put ADMIN_TOKEN

# Set Slack webhook URL for notifications
wrangler secret put SLACK_WEBHOOK
```

### Environment-Specific Deployment

Deploy to different environments:

```bash
# Deploy to development
wrangler deploy --env development

# Deploy to production
wrangler deploy --env production
```

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
- ✅ Slack notification system with rich message formatting
- ✅ Authentication middleware with constant-time token validation
- ✅ Admin API target management endpoints (GET/POST /admin/targets)
- ✅ Manual run endpoint (POST /admin/run) with complete target processing
- ✅ Core target processing logic with parallel batch processing
- ✅ Scheduled event handler for automatic cron-based monitoring
- ✅ Complete HTTP request routing and main worker entry point
- ✅ Health check endpoint (GET /healthz) for system monitoring
- ✅ Comprehensive unit test coverage with 100% test coverage

### Ready for Deployment
The core application is now complete and ready for deployment to Cloudflare Workers. The deployment configuration supports both development and production environments with proper KV namespace separation and build pipeline setup.