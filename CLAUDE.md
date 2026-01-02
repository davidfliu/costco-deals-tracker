# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and other AI assistants when working with code in this repository.

## Project Overview

**Costco Travel Deal Watcher** is a production-ready serverless Cloudflare Workers application that monitors Costco Travel URLs for promotional changes and sends Slack notifications when material changes are detected.

**Architecture**: Serverless TypeScript application on Cloudflare Workers with KV storage
**Status**: ✅ Production deployed and operational
**Monitoring**: 2 Kauai hotel URLs with URL-specific deal extraction
**Schedule**: Automated checks every 3 hours via cron trigger
**Notifications**: Rich Slack messages with deal breakdowns, pricing, and package details

For user-facing documentation, see [README.md](README.md). For deployment procedures, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Repository Structure

```
costco-deals-tracker/
├── src/                           # Source code (TypeScript)
│   ├── index.ts                   # Main Worker entry point & HTTP routing
│   ├── types.ts                   # TypeScript interfaces & type definitions
│   ├── utils.ts                   # Utility functions (91KB - largest module)
│   ├── kv-storage.ts              # KV storage operations & validation
│   ├── target-processing.ts       # Core target processing logic
│   ├── performance.ts             # Performance optimization utilities
│   ├── *.test.ts                  # Test files (13 test suites)
│   └── [test files for all modules]
├── wrangler.toml                  # Cloudflare Worker configuration
├── package.json                   # Dependencies & npm scripts
├── tsconfig.json                  # TypeScript compiler configuration
├── vitest.config.ts               # Test framework configuration
├── .gitignore                     # Excludes *.js, *.js.map, node_modules, secrets
├── CLAUDE.md                      # This file - AI assistant guidance
├── README.md                      # User documentation
├── DEPLOYMENT.md                  # Deployment procedures
└── progress.md                    # Development progress tracking
```

**Key Stats**: 19 TypeScript files (6 source + 13 test), ~30 exported functions/types, 100% test coverage target.

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

## Module Architecture

### Core Source Files

#### 1. `src/index.ts` (6KB) - Worker Entry Point
**Responsibilities:**
- HTTP request routing for admin endpoints
- Environment validation on startup
- Security headers configuration
- Method validation (GET/POST)
- Integration of all other modules

**Key Endpoints:**
- `GET /healthz` - Health check (no auth required)
- `GET /admin/targets` - List targets (auth required)
- `POST /admin/targets` - Create/update targets (auth required)
- `POST /admin/run` - Manual execution (auth required)
- `POST /admin/test-slack` - Test Slack integration (auth required)
- `POST /admin/test-e2e` - E2E testing workflow (auth required)
- `scheduled()` - Cron trigger handler

**When to Edit**: Adding new endpoints, changing routing logic, modifying security headers

---

#### 2. `src/types.ts` (2KB) - Type Definitions
**Responsibilities:**
- TypeScript interfaces for all data structures
- Type safety across the application
- Documentation of data models

**Key Types:**
- `Target` - Monitoring target configuration
- `Promotion` - Extracted promotional content
- `TargetState` - Current state for change detection
- `ChangeResult` - Change detection results
- `Env` - Environment variables and bindings
- `HistoricalSnapshot` - Historical state storage

**When to Edit**: Adding new data structures, changing existing interfaces, adding optional fields

---

#### 3. `src/utils.ts` (91KB) - Utility Functions
**Responsibilities:**
- **Content Operations**: `fetchContent()`, `parsePromotions()`, `extractDealsFromUrl()`
- **Text Processing**: `normalizeText()`, `filterNoise()`, `cleanText()`, `decodeHtmlEntities()`
- **Hashing**: `hashString()`, `generateStateKey()`, `generateHistoryKey()`
- **Change Detection**: `detectChanges()`, `filterMaterialChanges()`, `comparePromotionArrays()`
- **Slack Integration**: `sendSlackNotification()`, `formatSlackMessage()`, enhanced deal formatting
- **Admin Endpoints**: `handleGetTargets()`, `handlePostTargets()`, `handleManualRun()`, `handleTestSlack()`, `handleTestE2E()`
- **Authentication**: `verifyAdminToken()` with constant-time comparison
- **Environment Validation**: `validateEnvironment()`

**Key Features:**
- HTMLRewriter-based parsing for performance
- URL-specific extraction logic for targeted monitoring
- Advanced deal detection patterns (hotels, locations, pricing, savings)
- HTML entity decoding (&#x27;, &nbsp;, ♦, •)
- Rich Slack formatting with emojis and structured sections

**When to Edit**: Adding new utility functions, changing parsing logic, updating deal patterns, modifying Slack message formatting

---

#### 4. `src/kv-storage.ts` (19KB) - Data Persistence Layer
**Responsibilities:**
- **Target Management**: `readTargets()`, `writeTargets()`, `validateTargets()`
- **State Operations**: `readTargetState()`, `writeTargetState()`
- **History Management**: `storeAndPruneSnapshot()`, `readHistoricalSnapshots()`, `pruneOldSnapshots()`
- **Validation**: `validateTargetUrl()`, `validateCssSelector()`, `validateTarget()`
- **Security**: URL whitelist enforcement, CSS selector sanitization, SSRF protection

**Security Features:**
- HTTPS-only URL enforcement
- Domain whitelist (costcotravel.com, costco.com)
- Private IP range blocking (localhost, 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Metadata endpoint blocking (169.254.169.254, metadata.google.internal)
- CSS selector pattern validation
- Dangerous pattern blocking (javascript:, expression(), etc.)

**Storage Keys:**
- `targets` - Array of target configurations
- `state:<url-hash>` - Current state for each target
- `hist:<url-hash>:<timestamp>` - Historical snapshots (max 5 per target)

**When to Edit**: Adding new storage operations, changing validation rules, modifying security policies, updating pruning logic

---

#### 5. `src/target-processing.ts` (15KB) - Business Logic
**Responsibilities:**
- `processTarget()` - Single target processing with error handling
- `processBatchTargets()` - Parallel processing of all enabled targets
- Error isolation (individual failures don't affect batch)
- Performance monitoring and result aggregation
- Integration with state management and notifications

**Processing Flow:**
1. Fetch content from target URL
2. Parse promotions using selector
3. Read previous state from KV
4. Detect changes (added/removed/modified promotions)
5. Filter for material changes (ignore noise)
6. Send Slack notification if changes detected
7. Store current state and historical snapshot
8. Return detailed processing result

**Performance Optimizations:**
- Parallel processing with `Promise.all()`
- Optimized state caching with `OptimizedStateManager`
- Text processing with `OptimizedTextProcessor`
- Request batching with `RequestOptimizer`
- Performance monitoring with `PerformanceMonitor`

**When to Edit**: Changing processing logic, adding new notifications, modifying error handling, adjusting performance optimizations

---

#### 6. `src/performance.ts` (13KB) - Performance Optimization
**Responsibilities:**
- `OptimizedStateManager` - Efficient state caching and retrieval
- `OptimizedTextProcessor` - Batch text processing with caching
- `PerformanceMonitor` - Execution time tracking and metrics
- `RequestOptimizer` - HTTP request batching and optimization

**Optimization Strategies:**
- In-memory caching to reduce KV reads
- Batch processing to minimize round trips
- Performance metrics collection
- Resource usage monitoring

**When to Edit**: Adding new optimization utilities, tuning cache strategies, implementing new performance features

---

### Architecture Overview

**Design Principles:**
1. **Separation of Concerns**: Each module has a single, well-defined responsibility
2. **Type Safety**: Comprehensive TypeScript types for all data structures
3. **Error Resilience**: Individual failures don't cascade or affect batch operations
4. **Security First**: Input validation, whitelist enforcement, SSRF protection
5. **Performance**: Parallel processing, caching, optimized KV operations
6. **Testability**: All modules have corresponding test files with high coverage

### Data Flow

1. **Scheduled Execution**: Cron trigger → `processBatchTargets()` → parallel `processTarget()` for each enabled target
2. **Target Processing**: Fetch URL → Parse HTML for promotions → Compare with stored state → Send notifications if changes detected → Update state and history
3. **Admin API**: Authentication → target CRUD operations → manual batch execution

### Key Architectural Patterns

- **Parallel Processing**: All targets processed concurrently with error isolation
- **Change Detection**: Content-based hashing with material change filtering (ignores minor text variations)
- **State Management**: Current state + historical snapshots with automatic pruning
- **Error Resilience**: Individual target failures don't affect batch processing; notification failures don't fail processing
- **Enhanced Content Analysis**: Advanced deal extraction with hotel names, locations, pricing, and package details
- **Rich Notifications**: Slack messages with structured deal information, emojis, and comprehensive summaries

### Storage Schema (KV)

- `targets` - Array of target configurations
- `state:<url-hash>` - Current state for each target (hash, promotions, timestamp)
- `hist:<url-hash>:<timestamp>` - Historical snapshots (auto-pruned to keep 5 most recent)

### API Endpoints

- `GET /healthz` - Health check
- `GET /admin/targets` - List all targets (requires ADMIN_TOKEN)
- `POST /admin/targets` - Create/update targets (requires ADMIN_TOKEN)
- `POST /admin/run` - Manual batch execution (requires ADMIN_TOKEN)
- `POST /admin/test-slack` - Test Slack webhook integration (requires ADMIN_TOKEN)
- `POST /admin/test-e2e` - End-to-end testing workflow for URL monitoring (requires ADMIN_TOKEN)

### Current Monitoring Configuration

The system is currently configured to monitor the following targets:

**Active Targets:**
1. **Kauai: 1 Hotel Hanalei Bay Package**
   - URL: `https://www.costcotravel.com/Vacation-Packages/Offers/HAWLIH1HOTELHANALEIBAY20230309`
   - Monitors: Promotional package deals, resort credits, special offers
   - Selector: `.deal-info, .package-details, .offer-details, .promo-info, .price, .resort-credit`

2. **Kauai: 1 Hotel Hanalei Bay - Hotel Rates**
   - URL: `https://www.costcotravel.com/Hotels/Hawaii/Kauai/Kauai1HotelHanaleiBay`
   - Monitors: General hotel room rates and availability
   - Selector: `.deal-info, .package-details, .offer-details, .promo-info, .price, .rate, .hotel-rate`

### Target Management

**Add/Update Targets:**
```bash
curl -X POST \
  -H "Authorization: Bearer your-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "targets": [
      {
        "url": "https://www.costcotravel.com/your-target-url",
        "name": "Your Target Name",
        "enabled": true,
        "selector": ".promo, .deal-info, .price, .discount",
        "notes": "Optional description of what this target monitors"
      }
    ]
  }' \
  https://your-worker-url.workers.dev/admin/targets
```

**List Current Targets:**
```bash
curl -H "Authorization: Bearer your-admin-token" \
  https://your-worker-url.workers.dev/admin/targets
```

**Manual Execution:**
```bash
curl -X POST \
  -H "Authorization: Bearer your-admin-token" \
  https://your-worker-url.workers.dev/admin/run
```

### Testing and Debugging

**Test Slack Integration:**
```bash
curl -X POST \
  -H "Authorization: Bearer your-admin-token" \
  https://your-worker-url.workers.dev/admin/test-slack
```

**End-to-End URL Testing:**
```bash
curl -X POST \
  -H "Authorization: Bearer your-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.costcotravel.com/any-url-to-test"}' \
  https://your-worker-url.workers.dev/admin/test-e2e
```

The E2E endpoint provides detailed content analysis including:
- **Deal extraction**: Hotel names, packages, pricing, savings
- **Location identification**: Destinations and resort locations  
- **Rich Slack formatting**: Comprehensive deal summaries with emojis
- **Debug output**: Console logging for development and troubleshooting

### Content Analysis Features

The system includes advanced content extraction capabilities:

**Deal Detection Patterns:**
- Hotel and resort names (Hyatt, Marriott, Hilton, Ritz-Carlton, etc.)
- Location extraction (Hawaii, Las Vegas, Caribbean, Europe, etc.)
- Pricing information ($150, $1,260, "from $536", etc.)
- Savings amounts ("Save $300", "50% off", etc.)
- Package details (resort credits, waived fees, stay 4/pay 3, etc.)
- Date information (booking deadlines, travel dates, etc.)

**Content Cleaning:**
- HTML entity decoding (&#x27; → ', &nbsp; → space)
- Text artifact removal (navigation elements, partial words)
- Title extraction with natural language breaks
- Price context analysis (per night, per person, package total)

**Slack Notification Format:**
- 🎯 Deal count and summary
- 💰 Pricing with context  
- 💸 Savings amounts
- 📍 Location information
- 📅 Date restrictions
- 📝 Package descriptions
- Rich formatting with headers, dividers, and context sections

## Coding Conventions & Best Practices

### TypeScript Configuration
**Compiler Settings** (`tsconfig.json`):
- **Target**: ES2022 for modern JavaScript features
- **Module**: ES2022 for native ESM support
- **Strict Mode**: Enabled for maximum type safety
- **Module Resolution**: Node-style resolution
- **Build Output**: Compiled `.js` files are gitignored
- **Test Exclusion**: `*.test.ts` files excluded from build

### Code Style Guidelines

#### 1. **Function Documentation**
All exported functions should have JSDoc comments:
```typescript
/**
 * Brief description of what the function does
 *
 * @param paramName - Description of parameter
 * @returns Description of return value
 */
export async function myFunction(paramName: string): Promise<Result> {
  // Implementation
}
```

#### 2. **Error Handling Patterns**
- Use try-catch blocks for all async operations
- Log errors with context using `console.error()`
- Return error states in result objects (don't throw in batch operations)
- Provide user-friendly error messages in API responses

Example from `target-processing.ts`:
```typescript
try {
  // Processing logic
  return { success: true, data: result };
} catch (error) {
  console.error('Target processing failed:', target.url, error);
  return {
    success: false,
    error: error instanceof Error ? error.message : 'Unknown error',
    target
  };
}
```

#### 3. **Security Best Practices**
- **Input Validation**: All user inputs validated before processing
- **Whitelist Approach**: Only allow known-safe domains and patterns
- **Constant-Time Comparison**: Use for authentication tokens to prevent timing attacks
- **HTTPS Enforcement**: Reject non-HTTPS URLs
- **SSRF Protection**: Block private IP ranges and metadata endpoints
- **CSS Sanitization**: Validate and sanitize all CSS selectors
- **No Secrets in Code**: All secrets stored in Cloudflare secrets, never committed

#### 4. **Naming Conventions**
- **Functions**: camelCase, verb-first (`fetchContent`, `parsePromotions`, `detectChanges`)
- **Interfaces/Types**: PascalCase (`Target`, `TargetState`, `ChangeResult`)
- **Constants**: UPPER_SNAKE_CASE for config, camelCase for local constants
- **Private Functions**: No special prefix (rely on module exports)
- **Async Functions**: Always return `Promise<T>`, use `async` keyword

#### 5. **Import Organization**
```typescript
// 1. Type imports from ./types
import { Target, Env, TargetState } from './types';

// 2. Function imports from other modules
import { fetchContent, parsePromotions } from './utils';
import { readTargetState, writeTargetState } from './kv-storage';

// 3. External library imports (if any)
// import { externalLibrary } from 'library-name';
```

#### 6. **Module Exports**
- Only export what's needed by other modules
- Keep implementation details private
- Use named exports (not default exports)
- Export interfaces and types from `types.ts`

## Testing Strategy

### Test Framework Setup
**Vitest Configuration** (`vitest.config.ts`):
- Environment: Node.js
- Test files: `*.test.ts` pattern
- Location: Co-located with source files in `src/`
- Coverage: Aim for 100% of critical business logic

### Test File Organization
Each source module has a corresponding test file:
- `index.ts` → `index.test.ts` (routing, integration)
- `utils.ts` → `utils.test.ts` (utility functions)
- `kv-storage.ts` → `kv-storage.test.ts` (storage operations)
- `target-processing.ts` → `target-processing.test.ts` (business logic)
- `performance.ts` → `performance.test.ts` (optimizations)
- Plus: `auth.test.ts`, `routing.test.ts`, `change-detection.test.ts`, etc.

### Testing Best Practices

#### 1. **Mock External Dependencies**
```typescript
// Mock KV namespace
const mockKV = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  list: vi.fn()
};

// Mock environment
const mockEnv: Env = {
  DEAL_WATCHER: mockKV as unknown as KVNamespace,
  ADMIN_TOKEN: 'test-token',
  SLACK_WEBHOOK: 'https://hooks.slack.com/test'
};
```

#### 2. **Test Coverage Priorities**
- ✅ **Critical**: Business logic, security validation, change detection
- ✅ **High**: API endpoints, authentication, storage operations
- ✅ **Medium**: Utility functions, text processing, formatting
- ✅ **Low**: Simple getters, constants, type guards

#### 3. **Test Organization Pattern**
```typescript
describe('ModuleName', () => {
  describe('functionName', () => {
    it('should handle normal case', () => { /* ... */ });
    it('should handle edge case', () => { /* ... */ });
    it('should handle error case', () => { /* ... */ });
  });
});
```

#### 4. **Run Tests During Development**
```bash
# Run all tests once
npm test

# Watch mode for active development
npm run test:watch

# Before committing
npm test && npm run build
```

## Common Development Workflows

### Adding a New Monitoring Target
1. Use the admin API endpoint: `POST /admin/targets`
2. Provide target configuration (URL, selector, name, notes)
3. System validates URL (whitelist), selector (sanitization), and structure
4. Test with E2E endpoint first: `POST /admin/test-e2e`
5. Enable target when ready: `"enabled": true`

### Modifying Deal Extraction Logic
**File**: `src/utils.ts`
**Functions**: `extractDealsFromUrl()`, `parsePromotions()`
**Steps**:
1. Update extraction patterns in `extractDealsFromUrl()`
2. Add test cases in `utils.test.ts`
3. Test with real URL using `/admin/test-e2e`
4. Verify Slack message formatting
5. Deploy to development environment
6. Monitor for 24 hours before promoting to production

### Adding a New API Endpoint
**Files**: `src/index.ts`, `src/utils.ts`, `src/*.test.ts`
**Steps**:
1. Define handler function in `src/utils.ts`
2. Add route in `src/index.ts` with method validation
3. Add authentication if needed (Bearer token)
4. Write tests in appropriate `*.test.ts` file
5. Test locally with `npm run dev`
6. Deploy to development environment
7. Update CLAUDE.md and README.md

### Debugging Production Issues
**Tools**:
1. **Cloudflare Dashboard**: Workers > your-worker > Logs
2. **Manual Run**: `POST /admin/run` to test immediately
3. **E2E Testing**: `POST /admin/test-e2e` with specific URL
4. **Slack Test**: `POST /admin/test-slack` to verify webhook
5. **Console Logs**: `console.log()` visible in Cloudflare dashboard

**Common Issues**:
- **No notifications**: Check SLACK_WEBHOOK secret, test with `/admin/test-slack`
- **Parse failures**: Check selector with `/admin/test-e2e`, update extraction logic
- **Auth errors**: Verify ADMIN_TOKEN secret, check Bearer token format
- **KV errors**: Verify namespace IDs in `wrangler.toml` match dashboard

### Deploying Changes

#### To Development
```bash
npm test                      # Run tests
npm run build                 # Compile TypeScript
npm run deploy:dev            # Deploy to development environment
# Test at: https://costco-deals-tracker-development.*.workers.dev
```

#### To Production
```bash
npm test                      # Run tests
npm run build                 # Compile TypeScript
npm run deploy:prod           # Deploy to production environment
# Verify at: https://costco-deals-tracker-production.*.workers.dev/healthz
```

**Best Practices**:
- Always test in development first
- Monitor logs after deployment
- Keep development and production secrets separate
- Test critical endpoints after deployment (`/healthz`, `/admin/targets`)

## Performance Considerations

### Optimization Strategies
1. **HTMLRewriter**: Used for efficient HTML parsing without full DOM construction
2. **Parallel Processing**: All targets processed concurrently with `Promise.all()`
3. **State Caching**: `OptimizedStateManager` reduces KV read operations
4. **Batch Operations**: `RequestOptimizer` minimizes HTTP round trips
5. **Text Processing**: `OptimizedTextProcessor` caches normalized text
6. **KV Pruning**: Historical snapshots auto-pruned to keep 5 most recent

### Performance Metrics
- **CPU Time**: Target <50ms per request for API endpoints
- **Memory**: Cloudflare Workers limited to 128MB
- **KV Operations**: Minimize reads/writes (they count toward quotas)
- **HTTP Requests**: Batch when possible, use parallel fetching
- **Execution Time**: Monitored with `PerformanceMonitor` class

### Cloudflare Workers Limits
- **CPU Time**: 50ms on free tier, 50ms-30s on paid tiers
- **Memory**: 128MB
- **Request Size**: 100MB
- **Response Size**: Unlimited
- **Subrequests**: 50 per request (for fetch calls)
- **KV Operations**: 1000 reads/day (free), unlimited (paid)

## Environment Configuration

### Supported Environments
**Development**: Testing and iteration
- KV Namespace: `development` namespace ID
- Secrets: Development ADMIN_TOKEN and SLACK_WEBHOOK
- URL: `*-development.*.workers.dev`

**Production**: Live monitoring
- KV Namespace: `production` namespace ID
- Secrets: Production ADMIN_TOKEN and SLACK_WEBHOOK
- URL: `https://costco-deals-tracker-production.rumalzliu.workers.dev`

### Environment Variables
**Set via `wrangler secret put`**:
- `ADMIN_TOKEN`: Bearer token for admin API authentication
- `SLACK_WEBHOOK`: Slack incoming webhook URL for notifications

**Configured in `wrangler.toml`**:
- `DEAL_WATCHER`: KV namespace binding (different IDs per environment)
- Cron triggers: `0 */3 * * *` (every 3 hours)
- Compatibility flags: `nodejs_compat`

### Security Notes
- **Never commit secrets** - Stored securely in Cloudflare, accessed via `env` object
- **Build artifacts excluded** - `*.js`, `*.js.map` in `.gitignore`
- **Rotate tokens regularly** - Admin tokens should be rotated every 90 days
- **Separate environments** - Development and production use different tokens/webhooks

---

## AI Assistant Guidelines

### Working with This Codebase

When working with this repository as an AI assistant, follow these guidelines:

#### 1. **Understanding User Intent**
- **Feature requests**: Check if the feature fits the project scope (Costco Travel monitoring)
- **Bug reports**: Reproduce the issue, identify the affected module(s)
- **Code changes**: Understand the impact across modules before modifying
- **Questions**: Reference specific files and line numbers in responses

#### 2. **Making Code Changes**

**Before modifying code**:
1. Read the relevant source file(s) completely
2. Check corresponding test file(s) for existing test patterns
3. Understand dependencies between modules
4. Consider security implications (especially for `kv-storage.ts`)

**When adding features**:
1. Identify which module(s) to modify (see "Module Architecture" section)
2. Add TypeScript types first in `types.ts` if needed
3. Implement core logic in appropriate module
4. Add tests in corresponding `*.test.ts` file
5. Update this CLAUDE.md if architecture changes

**When fixing bugs**:
1. Locate the bug in the appropriate module
2. Write a failing test case first (TDD approach)
3. Implement the fix
4. Verify the test passes
5. Check for similar issues in related code

#### 3. **Security Considerations**
Always validate and sanitize inputs when working with:
- **Target URLs**: Use `validateTargetUrl()` in `kv-storage.ts`
- **CSS Selectors**: Use `validateCssSelector()` in `kv-storage.ts`
- **Admin Tokens**: Use `verifyAdminToken()` with constant-time comparison
- **User Input**: Never trust user input, always validate

**Red flags to watch for**:
- URLs that aren't HTTPS
- URLs outside the costcotravel.com/costco.com domain
- CSS selectors with `javascript:`, `expression()`, or other dangerous patterns
- Private IP addresses or metadata endpoints
- Missing authentication on admin endpoints

#### 4. **Testing Requirements**
- **Always run tests** before suggesting code is complete: `npm test`
- **Add test cases** for new functions and bug fixes
- **Mock external dependencies**: KV namespace, Slack webhooks, HTTP requests
- **Test error paths**: Not just happy paths
- **Follow existing patterns**: Check similar test files for style

#### 5. **Common Tasks Reference**

| Task | Primary Files | Key Functions |
|------|--------------|---------------|
| Add monitoring target | `kv-storage.ts` | `writeTargets()`, `validateTarget()` |
| Change detection logic | `utils.ts` | `detectChanges()`, `filterMaterialChanges()` |
| Deal extraction | `utils.ts` | `extractDealsFromUrl()`, `parsePromotions()` |
| Slack formatting | `utils.ts` | `formatSlackMessage()`, `sendSlackNotification()` |
| New API endpoint | `index.ts`, `utils.ts` | Add route + handler function |
| State management | `kv-storage.ts` | `readTargetState()`, `writeTargetState()` |
| Batch processing | `target-processing.ts` | `processBatchTargets()`, `processTarget()` |

#### 6. **Code Review Checklist**
Before finalizing changes, verify:
- ✅ TypeScript types are correct and comprehensive
- ✅ Error handling is present and logs useful context
- ✅ Security validation is applied to all inputs
- ✅ Tests cover normal, edge, and error cases
- ✅ JSDoc comments explain non-obvious logic
- ✅ No secrets or credentials in code
- ✅ Performance implications considered (KV reads, CPU time)
- ✅ Changes maintain backward compatibility with stored data
- ✅ Slack notifications are user-friendly and informative

#### 7. **Explaining Code**
When explaining code to users:
- Reference specific files and line numbers (e.g., `src/utils.ts:148`)
- Explain the "why" not just the "what"
- Show how modules interact using the data flow diagram
- Provide examples from the actual codebase
- Link to relevant sections of CLAUDE.md or README.md

#### 8. **Suggesting Improvements**
When suggesting improvements:
- Consider **scope**: Does it fit the project's mission?
- Consider **security**: Does it introduce new attack vectors?
- Consider **performance**: Will it exceed Cloudflare Workers limits?
- Consider **maintenance**: Will it make the code harder to understand?
- Consider **testing**: Can it be tested effectively?

**Good improvements**:
- Better error messages for debugging
- More comprehensive test coverage
- Performance optimizations with measurable impact
- Enhanced deal extraction patterns
- Improved documentation and examples

**Avoid suggesting**:
- Features outside the core mission (Costco Travel monitoring)
- Complex abstractions for simple problems
- Changes that break existing stored data
- Dependencies that significantly increase bundle size

#### 9. **Documentation Updates**
Update documentation when:
- Adding new modules or significant functions
- Changing API endpoints or their behavior
- Modifying environment configuration
- Adding new security measures
- Changing deployment procedures

**Files to update**:
- `CLAUDE.md` - For architectural and development guidance (this file)
- `README.md` - For user-facing features and usage
- `DEPLOYMENT.md` - For deployment procedures
- JSDoc comments - For function-level documentation

#### 10. **Production Awareness**
Remember this is a **production system**:
- Changes affect real monitoring and notifications
- Test thoroughly in development environment first
- Monitor logs after deployment for unexpected behavior
- Be conservative with changes to core logic
- Maintain backward compatibility with stored KV data
- Consider the impact on scheduled cron jobs

### Quick Reference: Module Boundaries

**DO modify together (strongly coupled)**:
- `types.ts` + any module using those types
- `utils.ts` + `target-processing.ts` (business logic)
- `index.ts` + `utils.ts` (routing + handlers)

**DO NOT couple**:
- `kv-storage.ts` should remain independent (only depends on `types.ts` and `utils.ts` for hashing)
- `performance.ts` should remain independent
- Test files should mock all external dependencies

### Getting Help

If you're unsure about:
- **Architecture decisions**: Review the "Module Architecture" section
- **Security validation**: Check `kv-storage.ts` for patterns
- **Testing patterns**: Look at existing `*.test.ts` files
- **Deployment procedures**: See `DEPLOYMENT.md`
- **User features**: Check `README.md`

---

## Summary

This is a **production-ready, security-focused, well-tested** Cloudflare Workers application. The codebase prioritizes:
1. **Security**: Comprehensive input validation, whitelist-based approach, constant-time auth
2. **Reliability**: Error isolation, comprehensive testing, graceful degradation
3. **Performance**: Parallel processing, caching, optimized KV operations
4. **Maintainability**: Clear module boundaries, comprehensive documentation, consistent patterns

When working with this codebase, always consider security first, test thoroughly, and maintain the high quality standards already established.