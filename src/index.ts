/**
 * Costco Travel Deal Watcher - Cloudflare Worker
 * 
 * Monitors Costco Travel URLs for promotional changes and sends Slack notifications
 */

import { Env } from './types';

/**
 * Main entry point for HTTP requests
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname, method } = { pathname: url.pathname, method: request.method };

    // Import endpoint handlers
    const { handleGetTargets, handlePostTargets, handleManualRun } = await import('./utils');

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

    // Manual run endpoint
    if (pathname === '/admin/run') {
      if (method === 'POST') {
        return await handleManualRun(request, env);
      } else {
        return new Response(
          JSON.stringify({
            error: 'Method not allowed',
            code: 'METHOD_NOT_ALLOWED',
            allowed: ['POST']
          }),
          {
            status: 405,
            headers: {
              'Content-Type': 'application/json',
              'Allow': 'POST'
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
    const startTime = Date.now();
    console.log('Scheduled event triggered at:', new Date(event.scheduledTime).toISOString());
    
    try {
      // Import target processing function
      const { processBatchTargets } = await import('./target-processing');
      
      // Execute batch processing of all targets
      const result = await processBatchTargets(env);
      
      const duration = Date.now() - startTime;
      
      // Log execution results
      console.log('Scheduled execution completed:', {
        duration: `${duration}ms`,
        totalTargets: result.totalTargets,
        successfulTargets: result.successfulTargets,
        failedTargets: result.failedTargets,
        targetsWithChanges: result.targetsWithChanges,
        notificationsSent: result.notificationsSent
      });
      
      // Log any failed targets
      const failedResults = result.results.filter(r => !r.success);
      if (failedResults.length > 0) {
        console.error('Failed targets during scheduled execution:', 
          failedResults.map(r => ({ target: r.target.name || r.target.url, error: r.error }))
        );
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('Failed to execute scheduled monitoring:', error);
      console.log('Scheduled execution failed after:', `${duration}ms`);
      
      // Don't throw - we want the worker to continue running
      // Cloudflare will retry based on the cron schedule
    }
  }
};