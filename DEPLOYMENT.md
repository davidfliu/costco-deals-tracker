# Costco Travel Deal Watcher - Deployment Guide

## Prerequisites

- Node.js v20+ installed
- Cloudflare account with Workers enabled
- Wrangler CLI v4.x installed globally: `npm install -g wrangler`
- Slack workspace with webhook permissions

## Initial Setup

### 1. Authentication

Login to your Cloudflare account:
```bash
wrangler login
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create KV Namespaces

Create KV namespaces for development and production:

```bash
# Development namespace
wrangler kv:namespace create "DEAL_WATCHER" --env development

# Production namespace  
wrangler kv:namespace create "DEAL_WATCHER" --env production
```

Copy the namespace IDs from the output and update `wrangler.toml`:
- Replace `your-dev-kv-namespace-id` with the development namespace ID
- Replace `your-prod-kv-namespace-id` with the production namespace ID

### 4. Configure Environment Variables

Set up the required secrets:

```bash
# Set admin token for API authentication
wrangler secret put ADMIN_TOKEN --env development
wrangler secret put ADMIN_TOKEN --env production

# Set Slack webhook URL for notifications
wrangler secret put SLACK_WEBHOOK --env development  
wrangler secret put SLACK_WEBHOOK --env production
```

**Admin Token**: Generate a secure random token (32+ characters recommended)
**Slack Webhook**: Create an incoming webhook in your Slack workspace

## Development

### Running Tests

Run the full test suite:
```bash
npm test
```

Run tests in watch mode during development:
```bash
npm run test:watch
```

### Local Development

Start the development server with hot reload:
```bash
npm run dev
```

This starts a local server that simulates the Cloudflare Workers environment.

### Testing API Endpoints

Test the health check endpoint:
```bash
curl http://localhost:8787/healthz
```

Test admin endpoints (replace `your-token` with your actual admin token):
```bash
# Get current targets
curl -H "Authorization: Bearer your-token" http://localhost:8787/admin/targets

# Add a target
curl -X POST -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '[{"url":"https://www.costcotravel.com/example","selector":".promo","name":"Test","enabled":true}]' \
  http://localhost:8787/admin/targets

# Trigger manual run
curl -X POST -H "Authorization: Bearer your-token" http://localhost:8787/admin/run
```

## Deployment

### Development Environment

Deploy to development environment:
```bash
npm run deploy:dev
```

Or using wrangler directly:
```bash
wrangler deploy --env development
```

### Production Environment

Deploy to production environment:
```bash
npm run deploy:prod
```

Or using wrangler directly:
```bash
wrangler deploy --env production
```

### Verify Deployment

After deployment, test the endpoints:

```bash
# Health check
curl https://your-worker-name.your-subdomain.workers.dev/healthz

# Admin endpoints (use your production admin token)
curl -H "Authorization: Bearer your-prod-token" \
  https://your-worker-name.your-subdomain.workers.dev/admin/targets
```

## Configuration Management

### Adding Monitoring Targets

Use the admin API to configure monitoring targets:

```bash
curl -X POST -H "Authorization: Bearer your-admin-token" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "url": "https://www.costcotravel.com/vacation-packages",
      "selector": ".promotion-container",
      "name": "Vacation Packages",
      "notes": "Main vacation deals page",
      "enabled": true
    },
    {
      "url": "https://www.costcotravel.com/cruises",
      "selector": ".cruise-deals",
      "name": "Cruise Deals", 
      "notes": "Cruise promotions",
      "enabled": true
    }
  ]' \
  https://your-worker-name.your-subdomain.workers.dev/admin/targets
```

### Monitoring Cron Jobs

The worker runs automatically every 3 hours via Cloudflare Cron Triggers. Monitor execution:

1. Check Cloudflare Workers dashboard for execution logs
2. Monitor Slack notifications for change alerts
3. Use manual run endpoint to test immediately

## Troubleshooting

### Common Issues

**KV Namespace Not Found**
- Verify namespace IDs in `wrangler.toml` match created namespaces
- Ensure namespaces exist in the correct Cloudflare account

**Authentication Errors**
- Verify `ADMIN_TOKEN` secret is set correctly
- Check token format in Authorization header: `Bearer your-token`

**Slack Notifications Not Working**
- Verify `SLACK_WEBHOOK` secret contains valid webhook URL
- Test webhook URL manually with curl
- Check Slack app permissions

**Cron Jobs Not Running**
- Verify cron trigger is configured in `wrangler.toml`
- Check Cloudflare Workers dashboard for cron execution logs
- Ensure worker is deployed to production environment

### Debugging

Enable debug logging by checking the Cloudflare Workers dashboard:
1. Go to Workers & Pages > your-worker-name
2. Click "Logs" tab to view real-time execution logs
3. Use `console.log()` statements in code for debugging

### Performance Monitoring

Monitor worker performance:
- CPU usage should stay under 50ms for typical operations
- KV operations should be minimized to reduce costs
- Check execution duration in Workers dashboard

## Maintenance

### Updating Dependencies

```bash
npm update
npm audit fix
```

### Updating Worker

1. Make code changes
2. Run tests: `npm test`
3. Deploy to development: `npm run deploy:dev`
4. Test functionality
5. Deploy to production: `npm run deploy:prod`

### Backup and Recovery

KV data is automatically replicated by Cloudflare. To backup configuration:

```bash
# Export current targets
curl -H "Authorization: Bearer your-admin-token" \
  https://your-worker-name.your-subdomain.workers.dev/admin/targets > targets-backup.json
```

### Monitoring and Alerts

Set up monitoring:
1. Monitor Slack notifications for system health
2. Use Cloudflare Workers analytics for performance metrics
3. Set up external monitoring for the `/healthz` endpoint
4. Monitor KV storage usage in Cloudflare dashboard

## Security Considerations

- Keep `ADMIN_TOKEN` secure and rotate regularly
- Use HTTPS for all API calls
- Monitor access logs for unauthorized attempts
- Restrict Slack webhook permissions to minimum required
- Review and audit target URLs before adding to configuration