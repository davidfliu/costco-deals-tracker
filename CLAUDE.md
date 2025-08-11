# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Costco Travel Deal Watcher is a serverless Cloudflare Workers application that monitors Costco Travel URLs for promotional changes and sends Slack notifications when material changes are detected. The system runs on a cron schedule (every 3 hours) and provides admin APIs for manual target management and execution.

## Development Commands

### Core Development
- `npm run dev` - Start Wrangler development server with hot reloading
- `npm run build` - Build TypeScript to JavaScript (uses `tsc`)
- `npm test` - Run all tests once using Vitest
- `npm run test:watch` - Run tests in watch mode for development

### Deployment
- `npm run deploy` - Deploy to default (development) environment  
- `npm run deploy:dev` - Deploy to development environment
- `npm run deploy:prod` - Deploy to production environment

### Environment Setup

#### Prerequisites
- Cloudflare account with Workers enabled
- Slack workspace with incoming webhook configured
- Node.js and npm installed locally

#### Production Deployment Steps

1. **Authenticate with Cloudflare:**
```bash
npx wrangler login
```

2. **Create KV Namespaces:**
```bash
# Create development namespace
npx wrangler kv namespace create "DEAL_WATCHER" --env development

# Create production namespace  
npx wrangler kv namespace create "DEAL_WATCHER" --env production
```

3. **Update wrangler.toml with real namespace IDs** from the create commands above.

4. **Set Production Secrets:**
```bash
# Generate secure admin token (store this safely!)
openssl rand -hex 32

# Set secrets for production environment
echo "your-generated-admin-token" | npx wrangler secret put ADMIN_TOKEN --env production
echo "your-slack-webhook-url" | npx wrangler secret put SLACK_WEBHOOK --env production
```

5. **Deploy to Production:**
```bash
npm run build
npx wrangler deploy --env production
```

#### Security Notes
- **Never commit secrets to git** - they are stored securely in Cloudflare
- **Build files (*.js) are excluded** from version control via .gitignore
- **Admin tokens should be stored in a password manager**
- **Slack webhooks should be rotated if compromised**

## Architecture Overview

### Core Components

1. **Entry Point (`src/index.ts`)** - Main Cloudflare Worker with HTTP routing and scheduled event handling
2. **Target Processing (`src/target-processing.ts`)** - Core business logic for processing individual targets and batch operations
3. **KV Storage (`src/kv-storage.ts`)** - Data persistence layer managing targets, state, and historical snapshots
4. **Utilities (`src/utils.ts`)** - Shared functions for content fetching, HTML parsing, change detection, hashing, and Slack notifications
5. **Performance (`src/performance.ts`)** - Optimization utilities for monitoring and enhanced processing

### Data Flow

1. **Scheduled Execution**: Cron trigger → `processBatchTargets()` → parallel `processTarget()` for each enabled target
2. **Target Processing**: Fetch URL → Parse HTML for promotions → Compare with stored state → Send notifications if changes detected → Update state and history
3. **Admin API**: Authentication → target CRUD operations → manual batch execution

### Key Architectural Patterns

- **Parallel Processing**: All targets processed concurrently with error isolation
- **Change Detection**: Content-based hashing with material change filtering (ignores minor text variations)
- **State Management**: Current state + historical snapshots with automatic pruning
- **Error Resilience**: Individual target failures don't affect batch processing; notification failures don't fail processing

### Storage Schema (KV)

- `targets` - Array of target configurations
- `state:<url-hash>` - Current state for each target (hash, promotions, timestamp)
- `hist:<url-hash>:<timestamp>` - Historical snapshots (auto-pruned to keep 5 most recent)

### API Endpoints

- `GET /healthz` - Health check
- `GET /admin/targets` - List all targets (requires ADMIN_TOKEN)
- `POST /admin/targets` - Create/update targets (requires ADMIN_TOKEN)
- `POST /admin/run` - Manual batch execution (requires ADMIN_TOKEN)

### Target Configuration

After deployment, configure monitoring targets using the admin API:

```bash
# Add a target URL to monitor
curl -X POST \
  -H "Authorization: Bearer your-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "targets": [
      {
        "url": "https://www.costcotravel.com/Travel-Offers/Travel-Hot-Buys",
        "name": "Costco Travel Hot Buys",
        "enabled": true,
        "selector": ".promo, .deal-info, .savings, .hot-buy, .offer-details, .price, .discount"
      }
    ]
  }' \
  https://your-worker-url.workers.dev/admin/targets

# List configured targets
curl -H "Authorization: Bearer your-admin-token" \
  https://your-worker-url.workers.dev/admin/targets

# Trigger manual check
curl -X POST \
  -H "Authorization: Bearer your-admin-token" \
  https://your-worker-url.workers.dev/admin/run
```

## Development Notes

### Testing Strategy
- **Unit Tests**: All modules have corresponding `.test.ts` files
- **Integration Tests**: Worker entry point and admin API endpoints
- **Test Coverage**: Comprehensive coverage of core business logic, error handling, and edge cases

### Authentication
Admin endpoints use Bearer token authentication with constant-time comparison to prevent timing attacks.

### Performance Considerations
- HTMLRewriter used for efficient HTML parsing without full DOM construction
- Parallel target processing with configurable batch sizes
- KV operations optimized with proper key generation and pruning strategies
- Content normalization to reduce false positives in change detection

### Environment Configuration
The project supports development and production environments with separate KV namespaces. Configuration is managed through `wrangler.toml` with environment-specific overrides.