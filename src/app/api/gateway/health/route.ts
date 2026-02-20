import { checkGatewayHealth } from "@/lib/gatewayClient";

/**
 * GET /api/gateway/health
 * Proxied health check for the MCP Gateway.
 * Used by the settings page to show connection status.
 */
export async function GET() {
  const result = await checkGatewayHealth();
  return Response.json(result);
}
