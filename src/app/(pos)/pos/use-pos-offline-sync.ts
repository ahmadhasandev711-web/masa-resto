'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PosOfflineQueue, QueuedPosSale } from '../../../infrastructure/pos/pos-offline-queue';
import { createPosOrderAction } from '../../actions/pos.actions';

export function usePosOfflineSync() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [queuedSales, setQueuedSales] = useState<QueuedPosSale[]>(() => {
    return typeof window !== 'undefined' ? PosOfflineQueue.getQueuedSales() : [];
  });
  const [lastSyncResult, setLastSyncResult] = useState<{
    synced: number;
    failed: number;
    timestamp: number;
  } | null>(null);

  const isSyncingRef = useRef(false);

  const refreshQueue = useCallback(() => {
    setQueuedSales(PosOfflineQueue.getQueuedSales());
  }, []);

  // Process offline mutation sync queue with multi-tab mutex (BroadcastChannel + navigator.locks)
  const syncQueue = useCallback(async (): Promise<{ synced: number; failed: number }> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { synced: 0, failed: 0 };
    }

    if (isSyncingRef.current) {
      return { synced: 0, failed: 0 };
    }

    const executeSync = async (): Promise<{ synced: number; failed: number }> => {
      isSyncingRef.current = true;
      setIsSyncing(true);

      const currentQueue = PosOfflineQueue.getQueuedSales();
      if (currentQueue.length === 0) {
        setIsSyncing(false);
        isSyncingRef.current = false;
        return { synced: 0, failed: 0 };
      }

      let synced = 0;
      let failed = 0;

      for (const item of currentQueue) {
        try {
          PosOfflineQueue.updateSaleStatus(item.id, 'SYNCING');
          const result = await createPosOrderAction(item.request);
          if (result.success) {
            PosOfflineQueue.removeQueuedSale(item.id);
            synced++;
          } else {
            PosOfflineQueue.updateSaleStatus(item.id, 'FAILED', result.error);
            failed++;
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Network error during sync';
          PosOfflineQueue.updateSaleStatus(item.id, 'FAILED', errorMsg);
          failed++;
        }
      }

      refreshQueue();
      setIsSyncing(false);
      isSyncingRef.current = false;
      setLastSyncResult({ synced, failed, timestamp: Date.now() });

      // Notify other tabs to refresh their local queues
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        try {
          const bc = new BroadcastChannel('resto_pos_sync');
          bc.postMessage({ type: 'SYNC_DONE', timestamp: Date.now() });
          bc.close();
        } catch {
          // Ignore
        }
      }

      return { synced, failed };
    };

    if (typeof navigator !== 'undefined' && 'locks' in navigator) {
      return navigator.locks.request('resto_pos_sync_lock', { ifAvailable: true }, async (lock) => {
        if (!lock) {
          // Another tab is already performing sync
          return { synced: 0, failed: 0 };
        }
        return executeSync();
      });
    }

    return executeSync();
  }, [refreshQueue]);

  // Setup online/offline and BroadcastChannel event listeners
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const timer = window.setTimeout(() => {
      refreshQueue();
    }, 0);

    let bc: BroadcastChannel | null = null;
    if ('BroadcastChannel' in window) {
      try {
        bc = new BroadcastChannel('resto_pos_sync');
        bc.onmessage = (event) => {
          if (event.data?.type === 'SYNC_DONE') {
            refreshQueue();
          }
        };
      } catch {
        // Ignore
      }
    }

    const handleOnline = () => {
      setIsOnline(true);
      syncQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const count = PosOfflineQueue.getQueuedSales().length;
        if (count > 0) {
          syncQueue();
        }
      }
    }, 45000);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
      if (bc) {
        bc.close();
      }
    };
  }, [refreshQueue, syncQueue]);

  return {
    isOnline,
    isSyncing,
    pendingCount: queuedSales.length,
    queuedSales,
    refreshQueue,
    syncNow: syncQueue,
    lastSyncResult,
  };
}