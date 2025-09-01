/**
 * Token Exchange Implementation for Shopify OAuth
 * Exchanges session tokens for access tokens using token exchange grant
 */

interface TokenExchangeResponse {
  access_token: string;
  scope: string;
  expires_in: number;
  associated_user_scope?: string;
  associated_user?: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    email_verified: boolean;
    account_owner: boolean;
    locale: string;
    collaborator: boolean;
  };
}

interface TokenExchangeError {
  error: string;
  error_description: string;
}

/**
 * Exchange a session token for an access token
 * This is used when you need to make Shopify API calls
 */
export async function exchangeSessionTokenForAccessToken(
  sessionToken: string,
  shop: string,
  apiKey: string,
  apiSecret: string
): Promise<TokenExchangeResponse> {
  console.log("[Token Exchange] Starting token exchange for shop:", shop);

  const tokenEndpoint = `https://${shop}/admin/oauth/access_token`;

  const requestBody = {
    client_id: apiKey,
    client_secret: apiSecret,
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: sessionToken,
    subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
    requested_token_type: "urn:shopify:params:oauth:token-type:online-access-token"
  };

  console.log("[Token Exchange] Making request to:", tokenEndpoint);

  try {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    console.log("[Token Exchange] Response status:", response.status);

    if (!response.ok) {
      let errorData: TokenExchangeError;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = {
          error: 'token_exchange_failed',
          error_description: `HTTP ${response.status}: ${responseText}`
        };
      }

      console.error("[Token Exchange] Failed:", errorData);
      
      throw new Error(
        `Token exchange failed: ${errorData.error_description || errorData.error}`
      );
    }

    const tokenData: TokenExchangeResponse = JSON.parse(responseText);
    
    console.log("[Token Exchange] Success:", {
      scope: tokenData.scope,
      expires_in: tokenData.expires_in,
      has_user: !!tokenData.associated_user
    });

    return tokenData;
  } catch (error: any) {
    console.error("[Token Exchange] Error:", error.message);
    throw error;
  }
}

/**
 * Get or exchange for an access token
 * First checks if we have a valid stored token, otherwise exchanges session token
 */
export async function getAccessToken(
  request: Request,
  shop: string,
  apiKey: string,
  apiSecret: string,
  sessionStorage?: any
): Promise<string> {
  // First, try to get from session storage if available
  if (sessionStorage) {
    try {
      const session = await sessionStorage.findSessionsByShop(shop);
      if (session && session.accessToken) {
        console.log("[Token Exchange] Using stored access token for shop:", shop);
        return session.accessToken;
      }
    } catch (error) {
      console.warn("[Token Exchange] Could not retrieve stored token:", error);
    }
  }

  // Extract session token from request
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('No session token in authorization header');
  }

  const sessionToken = authHeader.substring(7);
  
  // Exchange for access token
  const tokenResponse = await exchangeSessionTokenForAccessToken(
    sessionToken,
    shop,
    apiKey,
    apiSecret
  );

  // Store the new token if we have session storage
  if (sessionStorage && tokenResponse.access_token) {
    try {
      await sessionStorage.storeSession({
        id: `online_${shop}`,
        shop,
        state: 'active',
        isOnline: true,
        accessToken: tokenResponse.access_token,
        scope: tokenResponse.scope,
        expires: new Date(Date.now() + (tokenResponse.expires_in * 1000))
      });
      
      console.log("[Token Exchange] Stored new access token for shop:", shop);
    } catch (error) {
      console.warn("[Token Exchange] Could not store access token:", error);
    }
  }

  return tokenResponse.access_token;
}

/**
 * Make an authenticated API call to Shopify
 */
export async function makeShopifyApiCall(
  shop: string,
  accessToken: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `https://${shop}/admin/api/2025-01/${endpoint}`;
  
  console.log("[Token Exchange] Making API call to:", url);

  const response = await fetch(url, {
    ...options,
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    console.error("[Token Exchange] API call failed:", {
      status: response.status,
      statusText: response.statusText
    });
  }

  return response;
}

/**
 * Helper to make GraphQL requests to Shopify
 */
export async function shopifyGraphQL(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, any>
): Promise<any> {
  const response = await makeShopifyApiCall(
    shop,
    accessToken,
    'graphql.json',
    {
      method: 'POST',
      body: JSON.stringify({ query, variables })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GraphQL request failed: ${error}`);
  }

  const data = await response.json();
  
  if (data.errors) {
    console.error("[Token Exchange] GraphQL errors:", data.errors);
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data;
}