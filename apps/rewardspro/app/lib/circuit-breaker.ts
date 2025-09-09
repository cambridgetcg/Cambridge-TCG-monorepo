// Circuit breaker pattern for resilient API calls
export interface CircuitBreakerOptions {
  threshold?: number;        // Number of failures before opening
  timeout?: number;          // How long to wait in open state
  resetTimeout?: number;     // Time before attempting to close
  volumeThreshold?: number;  // Minimum requests before evaluating
  errorThreshold?: number;   // Error percentage to trip breaker
  rollingWindow?: number;    // Time window for metrics
}

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface Metrics {
  requests: number;
  failures: number;
  successes: number;
  lastFailureTime?: Date;
  windowStart: Date;
}

export class CircuitBreaker {
  private state = CircuitState.CLOSED;
  private metrics: Metrics = {
    requests: 0,
    failures: 0,
    successes: 0,
    windowStart: new Date(),
  };
  
  private halfOpenSuccesses = 0;
  private options: Required<CircuitBreakerOptions>;
  private stateChangeListeners: Array<(state: CircuitState) => void> = [];
  
  constructor(options: CircuitBreakerOptions = {}) {
    this.options = {
      threshold: options.threshold ?? 5,
      timeout: options.timeout ?? 60000,        // 1 minute
      resetTimeout: options.resetTimeout ?? 30000, // 30 seconds
      volumeThreshold: options.volumeThreshold ?? 10,
      errorThreshold: options.errorThreshold ?? 50, // 50% error rate
      rollingWindow: options.rollingWindow ?? 60000, // 1 minute window
    };
  }
  
  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(
    fn: () => Promise<T>,
    fallback?: () => T | Promise<T>
  ): Promise<T> {
    // Check if we should reset metrics window
    this.checkMetricsWindow();
    
    // Check circuit state
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.setState(CircuitState.HALF_OPEN);
        this.halfOpenSuccesses = 0;
      } else {
        if (fallback) {
          return fallback();
        }
        throw new CircuitBreakerError('Circuit breaker is OPEN', this.state);
      }
    }
    
    // Track request
    this.metrics.requests++;
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      
      if (fallback && this.state === CircuitState.OPEN) {
        return fallback();
      }
      
      throw error;
    }
  }
  
  /**
   * Execute with timeout protection
   */
  async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number,
    fallback?: () => T | Promise<T>
  ): Promise<T> {
    return this.execute(async () => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Operation timed out')), timeout);
      });
      
      return Promise.race([fn(), timeoutPromise]);
    }, fallback);
  }
  
  private onSuccess(): void {
    this.metrics.successes++;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenSuccesses++;
      
      // Need multiple successes to close circuit
      if (this.halfOpenSuccesses >= 3) {
        this.reset();
      }
    }
  }
  
  private onFailure(): void {
    this.metrics.failures++;
    this.metrics.lastFailureTime = new Date();
    
    if (this.state === CircuitState.HALF_OPEN) {
      // Single failure in half-open reopens circuit
      this.trip();
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we should trip the breaker
      if (this.shouldTrip()) {
        this.trip();
      }
    }
  }
  
  private shouldTrip(): boolean {
    // Not enough requests to evaluate
    if (this.metrics.requests < this.options.volumeThreshold) {
      return false;
    }
    
    // Check failure threshold
    if (this.metrics.failures >= this.options.threshold) {
      return true;
    }
    
    // Check error percentage
    const errorRate = (this.metrics.failures / this.metrics.requests) * 100;
    return errorRate >= this.options.errorThreshold;
  }
  
  private trip(): void {
    this.setState(CircuitState.OPEN);
    console.warn(`Circuit breaker tripped: ${this.metrics.failures} failures`);
  }
  
  private reset(): void {
    this.setState(CircuitState.CLOSED);
    this.resetMetrics();
    console.info('Circuit breaker reset');
  }
  
  private shouldAttemptReset(): boolean {
    if (!this.metrics.lastFailureTime) return true;
    
    const now = new Date();
    const timeSinceFailure = now.getTime() - this.metrics.lastFailureTime.getTime();
    
    return timeSinceFailure >= this.options.resetTimeout;
  }
  
  private checkMetricsWindow(): void {
    const now = new Date();
    const windowAge = now.getTime() - this.metrics.windowStart.getTime();
    
    if (windowAge >= this.options.rollingWindow) {
      this.resetMetrics();
    }
  }
  
  private resetMetrics(): void {
    this.metrics = {
      requests: 0,
      failures: 0,
      successes: 0,
      windowStart: new Date(),
      lastFailureTime: this.metrics.lastFailureTime,
    };
  }
  
  private setState(newState: CircuitState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.stateChangeListeners.forEach(listener => listener(newState));
    }
  }
  
  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }
  
  /**
   * Get current metrics
   */
  getMetrics(): Readonly<Metrics> & { errorRate: number } {
    const errorRate = this.metrics.requests > 0
      ? (this.metrics.failures / this.metrics.requests) * 100
      : 0;
    
    return {
      ...this.metrics,
      errorRate,
    };
  }
  
  /**
   * Force circuit to open state
   */
  open(): void {
    this.trip();
  }
  
  /**
   * Force circuit to closed state
   */
  close(): void {
    this.reset();
  }
  
  /**
   * Listen for state changes
   */
  onStateChange(listener: (state: CircuitState) => void): () => void {
    this.stateChangeListeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.stateChangeListeners.indexOf(listener);
      if (index > -1) {
        this.stateChangeListeners.splice(index, 1);
      }
    };
  }
}

export class CircuitBreakerError extends Error {
  constructor(message: string, public state: CircuitState) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

// Factory for creating circuit breakers
export class CircuitBreakerFactory {
  private static breakers = new Map<string, CircuitBreaker>();
  
  static create(
    name: string,
    options?: CircuitBreakerOptions
  ): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(options));
    }
    
    return this.breakers.get(name)!;
  }
  
  static get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }
  
  static remove(name: string): void {
    this.breakers.delete(name);
  }
  
  static clear(): void {
    this.breakers.clear();
  }
  
  static getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }
}

// Decorator for adding circuit breaker to functions
export function withCircuitBreaker(
  options?: CircuitBreakerOptions & { name?: string }
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const breakerName = options?.name || `${target.constructor.name}.${propertyKey}`;
    const breaker = CircuitBreakerFactory.create(breakerName, options);
    
    descriptor.value = async function (...args: any[]) {
      return breaker.execute(() => originalMethod.apply(this, args));
    };
    
    return descriptor;
  };
}

// Utility function for resilient API calls
export async function resilientCall<T>(
  fn: () => Promise<T>,
  options?: {
    fallback?: () => T | Promise<T>;
    breaker?: CircuitBreaker;
    retries?: number;
    retryDelay?: number;
  }
): Promise<T> {
  const breaker = options?.breaker || new CircuitBreaker();
  const maxRetries = options?.retries ?? 3;
  const retryDelay = options?.retryDelay ?? 1000;
  
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await breaker.execute(fn, options?.fallback);
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry if circuit is open
      if (error instanceof CircuitBreakerError) {
        throw error;
      }
      
      // Wait before retrying
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}