/**
 * Harbor SEO API Client
 * Handles authentication and API calls to Harbor SEO dashboard
 */

const HARBOR_API_URL = process.env.NEXT_PUBLIC_HARBOR_API_URL || 'https://api.harborseo.ai';
const HARBOR_API_KEY = process.env.HARBOR_API_KEY;

interface HarborConnectResponse {
  success: boolean;
  message: string;
  data?: {
    accountId: string;
    email: string;
    connected: boolean;
  };
  error?: string;
}

interface HarborAuthPayload {
  email?: string;
  apiKey?: string;
  redirectUrl?: string;
}

/**
 * Verifies if Harbor SEO API key is configured
 */
export function isHarborConfigured(): boolean {
  return !!HARBOR_API_KEY;
}

/**
 * Get Harbor SEO connection URL for OAuth/Connect flow
 */
export function getHarborConnectUrl(): string {
  const params = new URLSearchParams({
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/harbor/callback`,
    client_id: HARBOR_API_KEY || '',
  });
  
  return `https://www.harborseo.ai/dashboard/connect?${params.toString()}`;
}

/**
 * Connect to Harbor SEO API
 */
export async function connectToHarbor(payload: HarborAuthPayload): Promise<HarborConnectResponse> {
  if (!HARBOR_API_KEY) {
    return {
      success: false,
      message: 'Harbor SEO API key not configured',
      error: 'Missing HARBOR_API_KEY environment variable',
    };
  }

  try {
    const response = await fetch(`${HARBOR_API_URL}/auth/connect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HARBOR_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Harbor API error: ${response.statusText}`);
    }

    const data: HarborConnectResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Harbor connection error:', error);
    return {
      success: false,
      message: 'Failed to connect to Harbor SEO',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get Harbor SEO account status
 */
export async function getHarborStatus(): Promise<HarborConnectResponse> {
  if (!HARBOR_API_KEY) {
    return {
      success: false,
      message: 'Harbor SEO API key not configured',
      error: 'Missing HARBOR_API_KEY environment variable',
    };
  }

  try {
    const response = await fetch(`${HARBOR_API_URL}/account/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${HARBOR_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Harbor API error: ${response.statusText}`);
    }

    const data: HarborConnectResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Harbor status error:', error);
    return {
      success: false,
      message: 'Failed to fetch Harbor SEO status',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Disconnect from Harbor SEO
 */
export async function disconnectFromHarbor(): Promise<HarborConnectResponse> {
  if (!HARBOR_API_KEY) {
    return {
      success: false,
      message: 'Harbor SEO API key not configured',
      error: 'Missing HARBOR_API_KEY environment variable',
    };
  }

  try {
    const response = await fetch(`${HARBOR_API_URL}/auth/disconnect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HARBOR_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Harbor API error: ${response.statusText}`);
    }

    const data: HarborConnectResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Harbor disconnect error:', error);
    return {
      success: false,
      message: 'Failed to disconnect from Harbor SEO',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}