# Implementation Plan

- [x] 1. Set up project structure and core interfaces
  - Create Cloudflare Worker project structure with wrangler.toml configuration
  - Define TypeScript interfaces for Target, Promotion, TargetState, and ChangeResult
  - Set up environment variable bindings for KV namespace and secrets
  - _Requirements: 8.1, 8.2_

- [x] 2. Implement core data models and utilities
  - [x] 2.1 Create URL hashing utility function
    - ✅ Write SHA-256 hashing function for generating stable URL-based keys
    - ✅ Implement key generation for state and history storage
    - ✅ Write unit tests for hash consistency and collision avoidance
    - _Requirements: 5.1_
    - _Completed: 2025-01-08 - Implemented hashString, generateStateKey, generateHistoryKey with comprehensive tests_

  - [x] 2.2 Implement text normalization utilities
    - Write function to collapse whitespace and remove timestamps from promotional text
    - Create regex patterns for filtering noise (tracking codes, irrelevant counters)
    - Write unit tests with various text input scenarios
    - _Requirements: 3.1, 3.4_

  - [x] 2.3 Create promotion ID generation
    - Implement stable hashing of promotion content (title|perk|dates|price)
    - Write function to generate unique promotion IDs
    - Write unit tests to verify ID stability and uniqueness
    - _Requirements: 3.2_

- [x] 3. Build HTML parsing and content extraction
  - [x] 3.1 Implement promotion parser using HTMLRewriter
    - Write HTMLRewriter-based parser to extract promotional content using CSS selectors
    - Create promotion object builder from extracted HTML elements
    - Write unit tests with sanitized HTML fixtures from Costco Travel pages
    - _Requirements: 3.1, 8.3_

  - [x] 3.2 Create content fetching with proper headers
    - Implement fetch wrapper with User-Agent header and timeout handling
    - Add error handling for non-200 responses and network failures
    - Write unit tests with mock fetch responses
    - _Requirements: 6.1, 6.2_

- [x] 4. Implement change detection logic
  - [x] 4.1 Build promotion comparison engine
    - Write function to compare current vs previous promotion arrays
    - Implement detection of added, removed, and changed promotions by ID
    - Create change result object with categorized differences
    - Write unit tests with various promotion change scenarios
    - _Requirements: 3.2, 3.4_

  - [x] 4.2 Add material change filtering
    - Implement logic to determine if changes are material vs cosmetic
    - Filter out changes that match known noise patterns
    - Write unit tests to verify proper filtering of non-material changes
    - _Requirements: 3.4_

- [x] 5. Create KV storage operations
  - [x] 5.1 Implement target configuration management
    - ✅ Write functions to read/write targets array from KV storage
    - ✅ Add validation for target configuration objects
    - ✅ Write unit tests with mock KV operations
    - _Requirements: 1.1, 1.2, 4.2, 4.3_
    - _Completed: 2025-01-08 - Implemented validateTarget, validateTargets, readTargets, writeTargets, upsertTarget, removeTarget with comprehensive validation and error handling_

  - [x] 5.2 Build state management functions
    - ✅ Write functions to read/write target state objects using URL-based keys
    - ✅ Implement state comparison and update logic
    - ✅ Write unit tests for state persistence and retrieval
    - _Requirements: 5.1, 5.2_
    - _Completed: 2025-01-08 - Implemented validateTargetState, readTargetState, writeTargetState, shouldUpdateState, updateTargetStateIfChanged, deleteTargetState with hash-based change detection_

  - [x] 5.3 Create historical snapshot management
    - ✅ Write functions to store and retrieve historical snapshots
    - ✅ Implement pruning logic to maintain only last 5 snapshots per URL
    - ✅ Write unit tests for history management and pruning
    - _Requirements: 5.3, 5.4_
    - _Completed: 2025-01-08 - Implemented validateHistoricalSnapshot, storeHistoricalSnapshot, getHistoricalSnapshots, pruneHistoricalSnapshots, storeAndPruneSnapshot, deleteAllHistoricalSnapshots with automatic cleanup_

- [ ] 6. Build Slack notification system
  - [x] 6.1 Create Slack message formatter
    - Write function to format change results into Slack block format
    - Include target name, URL, timestamp, and up to 3 changed items
    - Create rich text formatting with proper markdown
    - Write unit tests for message formatting with various change types
    - _Requirements: 3.3, 3.5_

  - [x] 6.2 Implement Slack webhook integration
    - Write function to send formatted messages to Slack webhook
    - Add error handling for webhook failures and rate limiting
    - Write unit tests with mock webhook responses
    - _Requirements: 3.3, 6.4_

- [-] 7. Create admin API endpoints
  - [x] 7.1 Implement authentication middleware
    - ✅ Write token validation function using constant-time comparison
    - ✅ Create middleware to protect admin endpoints
    - ✅ Write unit tests for authentication success and failure cases
    - _Requirements: 4.1, 4.5_
    - _Completed: 2025-01-08 - Implemented validateAdminToken, extractAuthToken, authenticateAdminRequest, createAuthErrorResponse with constant-time comparison and comprehensive security testing_

  - [ ] 7.2 Build target management endpoints
    - Implement POST /admin/targets endpoint to update target configuration
    - Implement GET /admin/targets endpoint to retrieve current targets
    - Add request validation and error handling
    - Write unit tests for endpoint functionality
    - _Requirements: 4.2, 4.3_

  - [ ] 7.3 Create manual run endpoint
    - Implement POST /admin/run endpoint to trigger immediate execution
    - Integrate with core monitoring logic
    - Write unit tests for manual trigger functionality
    - _Requirements: 2.3, 4.4_

- [ ] 8. Implement core monitoring logic
  - [ ] 8.1 Build target processing function
    - Write function to process a single target URL
    - Integrate content fetching, parsing, change detection, and notification
    - Add comprehensive error handling for each step
    - Write unit tests for complete target processing flow
    - _Requirements: 1.3, 6.1, 6.2, 6.3_

  - [ ] 8.2 Create batch processing for multiple targets
    - Write function to process all enabled targets from configuration
    - Implement parallel processing with proper error isolation
    - Add logging for processing results and errors
    - Write unit tests for batch processing scenarios
    - _Requirements: 1.3, 1.4, 6.1_

- [ ] 9. Build request handlers and routing
  - [ ] 9.1 Implement HTTP request router
    - Write main request handler with route matching
    - Add support for all admin endpoints and health check
    - Implement proper HTTP status codes and error responses
    - Write unit tests for routing logic
    - _Requirements: 4.1, 8.4_

  - [ ] 9.2 Create cron trigger handler
    - Write scheduled event handler that triggers batch processing
    - Integrate with target processing and error handling
    - Add execution logging and performance monitoring
    - Write unit tests for cron execution flow
    - _Requirements: 2.1, 2.2_

  - [ ] 9.3 Add health check endpoint
    - Implement GET /healthz endpoint for system health monitoring
    - Return basic system status without requiring authentication
    - Write unit tests for health check functionality
    - _Requirements: 8.4_

- [ ] 10. Create main worker entry point
  - [ ] 10.1 Implement worker event listeners
    - Write main index.ts with fetch and scheduled event handlers
    - Wire together all components into cohesive worker application
    - Add global error handling and logging
    - Write integration tests for complete worker functionality
    - _Requirements: 8.1, 8.2_

  - [ ] 10.2 Add performance optimization
    - Implement efficient KV operations to minimize costs
    - Optimize CPU usage to stay within 50ms typical execution time
    - Add request batching and caching where appropriate
    - Write performance tests to verify optimization goals
    - _Requirements: 7.1, 7.2, 7.4_

- [ ] 11. Create deployment configuration
  - [ ] 11.1 Write wrangler.toml configuration
    - Configure KV namespace bindings and environment variables
    - Set up cron trigger schedule and compatibility settings
    - Add proper module format and build configuration
    - _Requirements: 2.1, 8.2_

  - [ ] 11.2 Create deployment documentation
    - Write setup instructions for KV namespace creation
    - Document environment variable configuration
    - Create testing and deployment procedures
    - _Requirements: 8.2_