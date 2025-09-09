// Optimistic updates hook for seamless UI interactions
import { useFetcher } from '@remix-run/react';
import { useEffect, useReducer, useCallback, useRef } from 'react';

interface OptimisticState<T> {
  data: T;
  pending: boolean;
  error: Error | null;
  optimisticData: T | null;
  lastUpdate?: Date;
}

type OptimisticAction<T> =
  | { type: 'SET_OPTIMISTIC'; payload: T }
  | { type: 'CONFIRM'; payload: T }
  | { type: 'REVERT'; payload: T }
  | { type: 'ERROR'; payload: Error }
  | { type: 'RESET' };

function optimisticReducer<T>(
  state: OptimisticState<T>,
  action: OptimisticAction<T>
): OptimisticState<T> {
  switch (action.type) {
    case 'SET_OPTIMISTIC':
      return {
        ...state,
        pending: true,
        optimisticData: action.payload,
        error: null,
        lastUpdate: new Date(),
      };
    case 'CONFIRM':
      return {
        ...state,
        data: action.payload,
        pending: false,
        optimisticData: null,
        error: null,
        lastUpdate: new Date(),
      };
    case 'REVERT':
      return {
        ...state,
        data: action.payload,
        pending: false,
        optimisticData: null,
        error: null,
      };
    case 'ERROR':
      return {
        ...state,
        pending: false,
        optimisticData: null,
        error: action.payload,
      };
    case 'RESET':
      return {
        ...state,
        pending: false,
        optimisticData: null,
        error: null,
      };
    default:
      return state;
  }
}

export interface UseOptimisticDataOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
  revertOnError?: boolean;
  debounceMs?: number;
}

export function useOptimisticData<T>(
  initialData: T,
  action: string,
  options: UseOptimisticDataOptions = {}
) {
  const fetcher = useFetcher();
  const [state, dispatch] = useReducer(optimisticReducer<T>, {
    data: initialData,
    pending: false,
    error: null,
    optimisticData: null,
  });
  
  const previousData = useRef<T>(initialData);
  const debounceTimer = useRef<NodeJS.Timeout>();
  
  // Update function with optimistic update
  const update = useCallback((
    optimisticUpdate: Partial<T>,
    formData?: FormData
  ) => {
    // Store current data for potential revert
    previousData.current = state.data;
    
    // Apply optimistic update
    const newData = { ...state.data, ...optimisticUpdate } as T;
    dispatch({ type: 'SET_OPTIMISTIC', payload: newData });
    
    // Handle debouncing if specified
    if (options.debounceMs) {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      
      debounceTimer.current = setTimeout(() => {
        if (formData) {
          fetcher.submit(formData, {
            method: 'POST',
            action,
          });
        }
      }, options.debounceMs);
    } else {
      // Submit immediately
      if (formData) {
        fetcher.submit(formData, {
          method: 'POST',
          action,
        });
      }
    }
  }, [state.data, fetcher, action, options.debounceMs]);
  
  // Batch update function for multiple changes
  const batchUpdate = useCallback((
    updates: Array<{ field: keyof T; value: any }>,
    formData?: FormData
  ) => {
    const newData = { ...state.data };
    updates.forEach(({ field, value }) => {
      (newData as any)[field] = value;
    });
    
    dispatch({ type: 'SET_OPTIMISTIC', payload: newData });
    
    if (formData) {
      fetcher.submit(formData, {
        method: 'POST',
        action,
      });
    }
  }, [state.data, fetcher, action]);
  
  // Reset function
  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
  }, []);
  
  // Handle fetcher response
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      if (fetcher.data.error) {
        const error = new Error(fetcher.data.error);
        dispatch({ type: 'ERROR', payload: error });
        
        // Revert to previous data if specified
        if (options.revertOnError !== false) {
          dispatch({ type: 'REVERT', payload: previousData.current });
        }
        
        // Call error callback
        options.onError?.(error);
      } else {
        dispatch({ type: 'CONFIRM', payload: fetcher.data });
        
        // Call success callback
        options.onSuccess?.(fetcher.data);
      }
    }
  }, [fetcher.state, fetcher.data, options]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);
  
  return {
    data: state.optimisticData || state.data,
    pending: state.pending,
    error: state.error,
    lastUpdate: state.lastUpdate,
    update,
    batchUpdate,
    reset,
    isOptimistic: state.optimisticData !== null,
  };
}

// Hook for optimistic list operations
export function useOptimisticList<T extends { id: string }>(
  initialItems: T[],
  action: string,
  options: UseOptimisticDataOptions = {}
) {
  const {
    data: items,
    pending,
    error,
    update,
    reset,
  } = useOptimisticData(initialItems, action, options);
  
  const addItem = useCallback((item: T, formData?: FormData) => {
    update({ items: [...items, item] } as any, formData);
  }, [items, update]);
  
  const updateItem = useCallback((
    id: string,
    updates: Partial<T>,
    formData?: FormData
  ) => {
    const newItems = items.map(item =>
      item.id === id ? { ...item, ...updates } : item
    );
    update({ items: newItems } as any, formData);
  }, [items, update]);
  
  const removeItem = useCallback((id: string, formData?: FormData) => {
    const newItems = items.filter(item => item.id !== id);
    update({ items: newItems } as any, formData);
  }, [items, update]);
  
  const reorderItems = useCallback((
    fromIndex: number,
    toIndex: number,
    formData?: FormData
  ) => {
    const newItems = [...items];
    const [movedItem] = newItems.splice(fromIndex, 1);
    newItems.splice(toIndex, 0, movedItem);
    update({ items: newItems } as any, formData);
  }, [items, update]);
  
  return {
    items,
    pending,
    error,
    addItem,
    updateItem,
    removeItem,
    reorderItems,
    reset,
  };
}