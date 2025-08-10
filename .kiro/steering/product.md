# Product Overview

## Costco Travel Deal Watcher

A serverless monitoring system that tracks promotional changes on Costco Travel URLs and sends Slack notifications when material changes are detected.

### Core Functionality
- **Automated Monitoring**: Runs on a scheduled basis (every 3 hours) via Cloudflare Workers cron triggers
- **Change Detection**: Intelligently detects material changes in promotional content while filtering out noise
- **Slack Integration**: Sends rich, formatted notifications to Slack when changes are detected
- **Admin API**: Provides endpoints for managing monitoring targets and triggering manual runs

### Key Features
- Content normalization and noise filtering to avoid false positives
- Stable promotion ID generation using content-based hashing
- Historical snapshot storage for change tracking
- Parallel batch processing for multiple targets
- Authentication middleware for admin endpoints
- Comprehensive error handling and logging

### Target Audience
Internal tool for monitoring Costco Travel promotional changes and staying informed about deal updates.