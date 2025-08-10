# Project Structure

## Directory Organization

```
├── src/                      # Source code
│   ├── index.ts             # Main Cloudflare Worker entry point
│   ├── types.ts             # TypeScript interfaces and type definitions
│   ├── utils.ts             # Utility functions (hashing, text processing, HTTP, Slack)
│   ├── kv-storage.ts        # KV storage operations and data management
│   ├── target-processing.ts # Core target processing and batch logic
│   └── *.test.ts           # Unit tests (co-located with source files)
├── .kiro/                   # Kiro IDE configuration
│   └── steering/           # AI assistant guidance documents
├── wrangler.toml           # Cloudflare Workers configuration
├── package.json            # Dependencies and npm scripts
├── tsconfig.json           # TypeScript configuration
├── vitest.config.ts        # Test configuration
└── progress.md             # Development progress tracking
```

## Code Organization Patterns

### File Naming Conventions
- Use kebab-case for file names: `target-processing.ts`
- Test files use `.test.ts` suffix and are co-located with source files
- Type definitions centralized in `types.ts`

### Module Structure
- **index.ts**: HTTP request routing and cron event handling
- **types.ts**: All TypeScript interfaces and type definitions
- **utils.ts**: Pure utility functions (hashing, text processing, HTTP client, Slack formatting)
- **kv-storage.ts**: KV namespace operations (CRUD for targets, state, history)
- **target-processing.ts**: Business logic for processing monitoring targets

### Import Patterns
- Use ES modules with explicit imports
- Dynamic imports for code splitting in Cloudflare Workers
- Relative imports for local modules: `import { Target } from './types'`

### Testing Structure
- Unit tests use Vitest framework
- Mock KV namespace and environment for testing
- Test files mirror source file structure
- Comprehensive test coverage with describe/it blocks

### Data Storage Keys
- Target list: `targets` (JSON array)
- Target state: `state:<url-hash>` (current promotion state)
- Historical snapshots: `hist:<url-hash>:<iso-timestamp>`

### API Endpoints
- `GET /admin/targets` - List monitoring targets
- `POST /admin/targets` - Add/update monitoring targets
- `POST /admin/run` - Trigger manual processing
- `GET /healthz` - Health check endpoint

## Architecture Principles
- Serverless-first design for Cloudflare Workers
- Stateless request handling with KV storage for persistence
- Error handling with proper HTTP status codes and JSON responses
- Authentication via bearer token for admin endpoints
- Parallel processing for batch operations