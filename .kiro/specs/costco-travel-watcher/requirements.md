# Requirements Document

## Introduction

The Costco Travel Deal Watcher is a serverless monitoring system that tracks promotional changes on Costco Travel URLs and sends Slack notifications when material changes are detected. The system runs on Cloudflare Workers with minimal cost, providing automated deal monitoring with high reliability and low maintenance overhead.

## Requirements

### Requirement 1

**User Story:** As a deal hunter, I want to monitor multiple Costco Travel URLs automatically, so that I can be notified of new promotions without manually checking each page.

#### Acceptance Criteria

1. WHEN the system is configured with target URLs THEN it SHALL store them in Cloudflare KV under the key "targets" as a JSON array
2. WHEN a target is defined THEN it SHALL include url, selector, name, notes, and enabled properties
3. WHEN the system runs THEN it SHALL process all enabled targets in the configuration
4. IF a target URL is disabled THEN the system SHALL skip processing that target

### Requirement 2

**User Story:** As a system administrator, I want the monitoring to run automatically on a schedule, so that I don't need to manually trigger checks.

#### Acceptance Criteria

1. WHEN the system is deployed THEN it SHALL run automatically every 3 hours using Cloudflare Cron Triggers
2. WHEN the cron job executes THEN it SHALL process all enabled target URLs
3. WHEN an admin triggers a manual run THEN the system SHALL execute immediately via protected HTTPS endpoint
4. IF the manual run endpoint is accessed without proper authentication THEN the system SHALL reject the request

### Requirement 3

**User Story:** As a deal hunter, I want to receive Slack notifications only for material changes, so that I'm not spammed with irrelevant updates.

#### Acceptance Criteria

1. WHEN promotional content is extracted THEN the system SHALL normalize text by collapsing whitespace and removing timestamps
2. WHEN comparing current vs previous promotions THEN the system SHALL identify added, removed, and changed items
3. WHEN material changes are detected THEN the system SHALL send a Slack notification with rich formatting
4. IF only cosmetic changes are detected (timestamps, tracking codes) THEN the system SHALL NOT send notifications
5. WHEN sending notifications THEN the system SHALL include page name, URL, timestamp, and up to 3 changed items

### Requirement 4

**User Story:** As a system administrator, I want to manage target URLs through API endpoints, so that I can add or remove monitoring targets without redeploying.

#### Acceptance Criteria

1. WHEN accessing admin endpoints THEN the system SHALL require ADMIN_TOKEN authentication
2. WHEN posting to /admin/targets THEN the system SHALL replace or upsert the targets configuration
3. WHEN getting /admin/targets THEN the system SHALL return the current targets configuration
4. WHEN posting to /admin/run THEN the system SHALL trigger an immediate monitoring run
5. IF authentication fails THEN the system SHALL return an unauthorized response

### Requirement 5

**User Story:** As a deal hunter, I want the system to maintain historical data, so that I can track promotion patterns over time.

#### Acceptance Criteria

1. WHEN processing a target URL THEN the system SHALL store the current state in KV with key "state:<url-hash>"
2. WHEN material changes are detected THEN the system SHALL create a historical snapshot
3. WHEN storing historical data THEN the system SHALL maintain only the last 5 snapshots per URL
4. WHEN the snapshot limit is exceeded THEN the system SHALL prune older entries automatically

### Requirement 6

**User Story:** As a system operator, I want the system to handle failures gracefully, so that temporary issues don't break the monitoring service.

#### Acceptance Criteria

1. WHEN a target URL returns a non-200 response THEN the system SHALL log the error and continue with other targets
2. WHEN network timeouts occur THEN the system SHALL handle them gracefully without crashing
3. WHEN HTML parsing fails THEN the system SHALL log the error and skip that target for the current run
4. WHEN KV operations fail THEN the system SHALL retry with exponential backoff

### Requirement 7

**User Story:** As a cost-conscious user, I want the system to operate within free tier limits, so that monitoring costs remain minimal.

#### Acceptance Criteria

1. WHEN the system runs THEN it SHALL complete typical operations within 50ms CPU time
2. WHEN storing data THEN it SHALL use KV operations efficiently to minimize costs
3. WHEN the system is deployed THEN it SHALL operate within Cloudflare Workers free tier limits
4. WHEN processing targets THEN it SHALL minimize external HTTP requests to reduce bandwidth costs

### Requirement 8

**User Story:** As a developer, I want the system to be easily maintainable, so that updates and debugging are straightforward.

#### Acceptance Criteria

1. WHEN the system is implemented THEN it SHALL consist of a single index.ts file under 300 lines
2. WHEN the system is deployed THEN it SHALL use a simple wrangler.toml configuration
3. WHEN health checks are performed THEN the system SHALL provide a /healthz endpoint
4. WHEN debugging is needed THEN the system SHALL provide clear error messages and logging