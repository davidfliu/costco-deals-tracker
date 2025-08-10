/**
 * Costco Travel Deal Watcher - Cloudflare Worker
 * 
 * Monitors Costco Travel URLs for promotional changes and sends Slack notifications
 */

import { Env, Target, TargetState, Promotion, ChangeResult } from './types';

/**
 * Main entry point for HTTP requests
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname, method } = { pathname: url.pathname, method: request.method };

    // Import endpoint handlers
    const { handleGetTargets, handlePostTargets } = await import('./utils');

    // Route admin endpoints
    if (pathname === '/admin/targets') {
      if (method === 'GET') {
        return await handleGetTargets(request, env);
      } else if (method === 'POST') {
        return await handlePostTargets(request, env);
      } else {
        return new Response(
          JSON.stringify({
            error: 'Method not allowed',
            code: 'METHOD_NOT_ALLOWED',
            allowed: ['GET', 'POST']
          }),
          {
            status: 405,
            headers: {
              'Content-Type': 'application/json',
              'Allow': 'GET, POST'
            }
          }
        );
      }
    }

    // Health check endpoint
    if (pathname === '/healthz' && method === 'GET') {
      return new Response(
        JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }

    // Default response for unmatched routes
    return new Response(
      JSON.stringify({
        error: 'Not found',
        code: 'NOT_FOUND',
        path: pathname
      }),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  },

  /**
   * Scheduled event handler for cron triggers
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // TODO: Implement scheduled monitoring logic
    console.log('Scheduled event triggered at:', new Date(event.scheduledTime).toISOString());
  }
};