import { useEffect, useState } from 'react';
import { useApi } from '@shopify/ui-extensions-react/customer-account';
import { decodeSessionToken, type DecodedSessionToken } from '../utils/sessionToken';

/**
 * Hook to manage session tokens with automatic refresh
 */
export function useSessionToken() {
  const { sessionToken } = useApi();
  const [tokenString, setTokenString] = useState<string | null>(null);
  const [decodedToken, setDecodedToken] = useState<DecodedSessionToken | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchAndDecodeToken() {
      console.log('[useSessionToken] Fetching session token...');
      try {
        setIsLoading(true);
        setError(null);

        const token = await sessionToken.get();
        console.log('[useSessionToken] Session token received, length:', token.length);

        const decoded = decodeSessionToken(token);
        console.log('[useSessionToken] Token decoded:', {
          customerId: decoded.customerId,
          dest: decoded.claims.dest,
          aud: decoded.claims.aud,
          sub: decoded.claims.sub,
          exp: decoded.claims.exp ? new Date(decoded.claims.exp * 1000).toISOString() : null,
          isExpired: decoded.isExpired,
        });

        if (isMounted) {
          setTokenString(token); // Store the actual token string
          setDecodedToken(decoded);
          console.log('[useSessionToken] Token state updated');
        }
      } catch (err) {
        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to get session token';
          setError(errorMessage);
          console.error('[useSessionToken] Error:', err);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    console.log('[useSessionToken] Hook mounted, starting token fetch');
    fetchAndDecodeToken();

    // Refresh token periodically (every 4 minutes, tokens expire in 5 minutes)
    console.log('[useSessionToken] Setting up token refresh interval (4 minutes)');
    const refreshInterval = setInterval(() => {
      console.log('[useSessionToken] Refreshing token...');
      fetchAndDecodeToken();
    }, 4 * 60 * 1000);

    return () => {
      console.log('[useSessionToken] Hook unmounting, cleaning up');
      isMounted = false;
      clearInterval(refreshInterval);
    };
  }, [sessionToken]);

  return {
    sessionToken: tokenString, // Return the actual token string, not the API object
    decodedToken,
    customerId: decodedToken?.customerId,
    isAuthenticated: !!decodedToken?.customerId,
    isLoading,
    error,
  };
}
