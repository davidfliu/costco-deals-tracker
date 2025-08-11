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
- **Monitoring**: 2 Kauai hotel URLs (package deals + room rates) every 3 hours
- **Status**: ✅ Active and operational with enhanced deal extraction

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

The system provides comprehensive admin endpoints for monitoring management:

```bash
# List all configured targets
curl -H "Authorization: Bearer your-admin-token" \
  https://costco-deals-tracker-production.rumalzliu.workers.dev/admin/targets

# Add/update monitoring targets
curl -X POST \
  -H "Authorization: Bearer your-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "targets": [
      {
        "url": "https://www.costcotravel.com/Vacation-Packages/Offers/HAWLIH1HOTELHANALEIBAY20230309",
        "name": "Kauai: 1 Hotel Hanalei Bay Package",
        "enabled": true,
        "selector": ".deal-info, .package-details, .offer-details, .promo-info, .price, .resort-credit",
        "notes": "Individual hotel package monitoring for Hanalei Bay resort"
      }
    ]
  }' \
  https://costco-deals-tracker-production.rumalzliu.workers.dev/admin/targets

# Trigger manual monitoring check
curl -X POST \
  -H "Authorization: Bearer your-admin-token" \
  https://costco-deals-tracker-production.rumalzliu.workers.dev/admin/run

# Test Slack integration
curl -X POST \
  -H "Authorization: Bearer your-admin-token" \
  https://costco-deals-tracker-production.rumalzliu.workers.dev/admin/test-slack

# End-to-end URL testing with detailed analysis
curl -X POST \
  -H "Authorization: Bearer your-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.costcotravel.com/any-url-to-analyze"}' \
  https://costco-deals-tracker-production.rumalzliu.workers.dev/admin/test-e2e
```

### Current Monitoring Targets

**Active Monitoring (2 targets):**
1. **Kauai: 1 Hotel Hanalei Bay Package** - Promotional package deals
2. **Kauai: 1 Hotel Hanalei Bay - Hotel Rates** - General room rates and availability

### Health Check

```bash
curl https://costco-deals-tracker-production.rumalzliu.workers.dev/healthz
```

## Features

### ✅ Production Ready
- **Serverless Architecture**: Deployed on Cloudflare Workers
- **Scheduled Monitoring**: Automatic checks every 3 hours via cron
- **Rich Slack Notifications**: Detailed alerts with deal breakdowns, emojis, and pricing
- **Admin API**: Full CRUD operations for target management plus testing endpoints
- **Security**: Bearer token authentication with constant-time comparison
- **Error Resilience**: Individual target failures don't affect batch processing
- **Performance**: Parallel processing with HTMLRewriter optimization

### ✅ Enhanced Monitoring Capabilities  
- **URL-Specific Extraction**: Targeted content analysis for each monitored URL
- **Change Detection**: Content-based hashing with material change filtering
- **State Management**: Current state + historical snapshots with auto-pruning
- **Advanced Content Parsing**: Extracts hotel names, locations, pricing, savings, resort credits
- **Noise Filtering**: Ignores minor text variations and timestamps
- **Debug & Testing**: E2E testing workflow with console logging and detailed analysis

### ✅ Smart Deal Analysis
- **Resort Credit Detection**: $300 resort credit (per room, per stay)
- **Fee Waiver Tracking**: Waived daily resort fees ($59 value per day)
- **Package Value Extraction**: Included extras valued at $536 for four-night stays
- **Location Identification**: Automatic destination detection (Kauai, Hawaii, etc.)
- **Price Context**: "from $536", "per night", "per person" context analysis
- **HTML Entity Decoding**: Proper symbol rendering (♦, •, etc.)

### ✅ Infrastructure
- **KV Storage**: Persistent state and configuration storage
- **Environment Separation**: Development and production environments
- **Build Pipeline**: TypeScript compilation and deployment automation
- **Test Coverage**: Comprehensive unit and integration tests

## Development Status

**Status**: ✅ **Production Deployed and Operational with Enhanced Features**

The application is fully developed, tested, and deployed to production with advanced deal extraction capabilities. It's currently monitoring 2 Kauai hotel URLs and will send rich, detailed Slack notifications when promotional changes are detected.

### Recent Enhancements
- **URL-Specific Extraction**: Custom parsing logic for each monitored URL
- **Rich Slack Notifications**: Comprehensive deal summaries with pricing and package details
- **E2E Testing Workflow**: Instant validation of URL monitoring and Slack integration
- **Debug Capabilities**: Console logging and detailed API responses for development
- **Targeted Monitoring**: Focus on specific resort credits, fee waivers, and package values

### Architecture Highlights
- **Serverless**: Cloudflare Workers with KV storage
- **Scalable**: Parallel processing with error isolation
- **Reliable**: Comprehensive test coverage and production monitoring
- **Secure**: Token-based authentication and input validation
- **Maintainable**: TypeScript, modular architecture, and comprehensive documentation