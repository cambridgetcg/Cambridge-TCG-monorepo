import { useEffect, useState } from 'react';
import { useApi } from '@shopify/ui-extensions-react/customer-account';
import { decodeSessionToken } from '../utils/sessionToken';
import type { DecodedSessionToken } from '../types/session';
import { logger } from '../utils/logger';
import { TOKEN_REFRESH_INTERVAL } from '../config';

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
      logger.debug('Fetching session token...');
      try {
        setIsLoading(true);
        setError(null);

        const token = await sessionToken.get();
        logger.debug('Session token received, length:', token.length);

        const decoded = decodeSessionToken(token);
        logger.debug('Token decoded:', {
          customerId: decoded.customerId,
          dest: decoded.claims.dest,
          sub: decoded.claims.sub,
          exp: decoded.claims.exp ? new Date(decoded.claims.exp * 1000).toISOString() : null,
          isExpired: decoded.isExpired,
        });

        if (isMounted) {
          setTokenString(token);
          setDecodedToken(decoded);
          logger.debug('Token state updated');
        }
      } catch (err) {
        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to get session token';
          setError(errorMessage);
          logger.error('Error fetching token:', err);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    logger.debug('Hook mounted, starting token fetch');
    fetchAndDecodeToken();

    // Refresh token periodically (tokens expire in 5 minutes)
    logger.debug('Setting up token refresh interval');
    const refreshInterval = setInterval(() => {
      logger.debug('Refreshing token...');
      fetchAndDecodeToken();
    }, TOKEN_REFRESH_INTERVAL);

    return () => {
      logger.debug('Hook unmounting, cleaning up');
      isMounted = false;
      clearInterval(refreshInterval);
    };
  }, [sessionToken]);

  return {
    sessionToken: tokenString,
    decodedToken,
    customerId: decodedToken?.customerId,
    isAuthenticated: !!decodedToken?.customerId,
    isLoading,
    error,
  };
}
