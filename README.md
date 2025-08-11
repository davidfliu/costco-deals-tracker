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

## Quick Start

### Development Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run tests:**
   ```bash
   npm test
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

### Production Deployment

The application is **currently deployed and running** at:
- **Production URL**: https://costco-deals-tracker-production.rumalzliu.workers.dev
- **Monitoring**: Costco Travel Hot Buys page every 3 hours
- **Status**: ✅ Active and operational

#### Deploy Latest Changes

```bash
# Build and deploy to production
npm run build
npx wrangler deploy --env production
```

#### First-Time Production Setup

If setting up a new deployment:

1. **Authenticate with Cloudflare:**
   ```bash
   npx wrangler login
   ```

2. **Create KV namespaces:**
   ```bash
   npx wrangler kv namespace create "DEAL_WATCHER" --env development
   npx wrangler kv namespace create "DEAL_WATCHER" --env production
   ```

3. **Set production secrets:**
   ```bash
   # Generate secure admin token
   openssl rand -hex 32
   
   # Set secrets (use environment-specific flags)
   echo "your-admin-token" | npx wrangler secret put ADMIN_TOKEN --env production
   echo "your-slack-webhook-url" | npx wrangler secret put SLACK_WEBHOOK --env production
   ```

4. **Update wrangler.toml** with the real KV namespace IDs from step 2.

## Usage

### Admin API

Use the admin API to manage monitoring targets:

```bash
# List all configured targets
curl -H "Authorization: Bearer your-admin-token" \
  https://costco-deals-tracker-production.rumalzliu.workers.dev/admin/targets

# Add a new target to monitor
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
  https://costco-deals-tracker-production.rumalzliu.workers.dev/admin/targets

# Trigger manual monitoring check
curl -X POST \
  -H "Authorization: Bearer your-admin-token" \
  https://costco-deals-tracker-production.rumalzliu.workers.dev/admin/run
```

### Health Check

```bash
curl https://costco-deals-tracker-production.rumalzliu.workers.dev/healthz
```

## Features

### ✅ Production Ready
- **Serverless Architecture**: Deployed on Cloudflare Workers
- **Scheduled Monitoring**: Automatic checks every 3 hours via cron
- **Slack Notifications**: Real-time alerts when deals change
- **Admin API**: Full CRUD operations for target management
- **Security**: Bearer token authentication with constant-time comparison
- **Error Resilience**: Individual target failures don't affect batch processing
- **Performance**: Parallel processing with HTMLRewriter optimization

### ✅ Monitoring Capabilities  
- **Change Detection**: Content-based hashing with material change filtering
- **State Management**: Current state + historical snapshots with auto-pruning
- **Content Parsing**: Advanced HTML parsing for promotional content
- **Noise Filtering**: Ignores minor text variations and timestamps

### ✅ Infrastructure
- **KV Storage**: Persistent state and configuration storage
- **Environment Separation**: Development and production environments
- **Build Pipeline**: TypeScript compilation and deployment automation
- **Test Coverage**: Comprehensive unit and integration tests

## Development Status

**Status**: ✅ **Production Deployed and Operational**

The application is fully developed, tested, and deployed to production. It's currently monitoring the Costco Travel Hot Buys page and will send Slack notifications when promotional changes are detected.