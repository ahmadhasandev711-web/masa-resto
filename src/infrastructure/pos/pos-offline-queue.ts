import { CreatePosOrderDto } from '../../application/pos/dto/pos.dto';
import {
  PosCategory,
  PosReceipt,
  PosResolvedLine,
  PosSettings,
  PosShift,
  PosTotals,
} from '../../domain/pos/contracts/pos.repository';

export interface QueuedPosSale {
  id: string;
  request: CreatePosOrderDto;
  receipt: PosReceipt;
  queuedAt: string;
  syncStatus: 'PENDING' | 'SYNCING' | 'FAILED';
  errorMessage?: string;
}

const STORAGE_KEY_QUEUE = 'resto_pos_offline_sales_queue';
const STORAGE_KEY_CATALOG = 'resto_pos_cached_catalog';
const STORAGE_KEY_SETTINGS = 'resto_pos_cached_settings';
const STORAGE_KEY_SHIFT = 'resto_pos_cached_shift';
const STORAGE_KEY_DEVICE_ID = 'resto_pos_device_id';
const STORAGE_KEY_LOCAL_SEQ = 'resto_pos_local_seq';

export class PosOfflineQueue {
  private static memoryStore = new Map<string, string>();

  private static getItem(key: string): string | null {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return this.memoryStore.get(key) ?? null;
      }
    }
    return this.memoryStore.get(key) ?? null;
  }

  private static setItem(key: string, value: string): void {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Fallback to memory
      }
    }
    this.memoryStore.set(key, value);
  }

  private static removeItem(key: string): void {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Fallback to memory
      }
    }
    this.memoryStore.delete(key);
  }

  public static clear(): void {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        window.localStorage.removeItem(STORAGE_KEY_QUEUE);
        window.localStorage.removeItem(STORAGE_KEY_CATALOG);
        window.localStorage.removeItem(STORAGE_KEY_SETTINGS);
        window.localStorage.removeItem(STORAGE_KEY_SHIFT);
      } catch {
        // Ignore
      }
    }
    this.memoryStore.clear();
  }

  public static getQueuedSales(): QueuedPosSale[] {
    try {
      const raw = this.getItem(STORAGE_KEY_QUEUE);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  public static enqueueSale(request: CreatePosOrderDto, receipt: PosReceipt): QueuedPosSale {
    const queue = this.getQueuedSales();
    const queuedSale: QueuedPosSale = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      request,
      receipt,
      queuedAt: new Date().toISOString(),
      syncStatus: 'PENDING',
    };
    queue.push(queuedSale);
    this.setItem(STORAGE_KEY_QUEUE, JSON.stringify(queue));
    return queuedSale;
  }

  public static removeQueuedSale(id: string): void {
    const queue = this.getQueuedSales().filter((item) => item.id !== id);
    this.setItem(STORAGE_KEY_QUEUE, JSON.stringify(queue));
  }

  
  public static enqueueOfflineSale(request: CreatePosOrderDto, receipt: PosReceipt): QueuedPosSale {
    return this.enqueueSale(request, receipt);
  }

  public static getPendingQueue(): QueuedPosSale[] {
    return this.getQueuedSales();
  }

  public static removeOfflineSale(id: string): void {
    return this.removeQueuedSale(id);
  }

  public static updateSyncStatus(
    id: string,
    status: 'PENDING' | 'SYNCING' | 'FAILED',
    errorMessage?: string
  ): void {
    return this.updateSaleStatus(id, status, errorMessage);
  }

  public static updateSaleStatus(
    id: string,
    status: 'PENDING' | 'SYNCING' | 'FAILED',
    errorMessage?: string
  ): void {
    const queue = this.getQueuedSales().map((item) => {
      if (item.id === id) {
        return { ...item, syncStatus: status, errorMessage };
      }
      return item;
    });
    this.setItem(STORAGE_KEY_QUEUE, JSON.stringify(queue));
  }

  public static getOrCreateDeviceId(): string {
    let deviceId = this.getItem(STORAGE_KEY_DEVICE_ID);
    if (!deviceId) {
      deviceId = Math.random().toString(36).substring(2, 6).toUpperCase();
      this.setItem(STORAGE_KEY_DEVICE_ID, deviceId);
    }
    return deviceId;
  }

  public static getNextLocalSeq(): number {
    const raw = this.getItem(STORAGE_KEY_LOCAL_SEQ);
    const current = raw ? parseInt(raw, 10) || 0 : 0;
    const next = current + 1;
    this.setItem(STORAGE_KEY_LOCAL_SEQ, String(next));
    return next;
  }

  public static createOfflineReceipt({
    request,
    branchName,
    branchCode,
    cashierId,
    totals,
    lines,
    currency,
    locale,
  }: {
    request: CreatePosOrderDto;
    branchName: string;
    branchCode?: string;
    cashierId: string;
    totals: PosTotals;
    lines: PosResolvedLine[];
    currency: string;
    locale: string;
  }): PosReceipt {
    const timestamp = Date.now();
    const cleanBranch = (branchCode || 'BR').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'BR';
    const deviceId = this.getOrCreateDeviceId();
    const localSeq = this.getNextLocalSeq();
    const orderNumber = `OFF-${cleanBranch}-${deviceId}-${String(localSeq).padStart(3, '0')}`;

    return {
      id: `offline-${request.idempotencyKey}`,
      orderNumber,
      branchId: request.branchId,
      branchName,
      cashierId,
      cashShiftId: request.cashShiftId,
      idempotencyKey: request.idempotencyKey,
      type: request.type,
      customerName: request.customerName ?? null,
      customerNotes: request.customerNotes ?? null,
      createdAt: new Date(timestamp).toISOString(),
      currency,
      locale,
      items: lines,
      payments: request.payments,
      subtotalMinor: totals.subtotalMinor,
      taxMinor: totals.taxMinor,
      serviceMinor: totals.serviceMinor ?? 0,
      discountMinor: totals.discountMinor,
      totalMinor: totals.totalMinor,
    };
  }

  
  public static clearQueue(): void {
    try {
      this.removeItem(STORAGE_KEY_QUEUE);
      this.memoryStore.clear();
    } catch {
      // Ignore
    }
  }

  public static cacheCatalog(catalog: PosCategory[]): void {
    try {
      this.setItem(STORAGE_KEY_CATALOG, JSON.stringify(catalog));
    } catch {
      // Ignore
    }
  }

  public static getCachedCatalog(): PosCategory[] | null {
    try {
      const raw = this.getItem(STORAGE_KEY_CATALOG);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  public static cacheSettings(settings: PosSettings): void {
    try {
      this.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch {
      // Ignore
    }
  }

  public static getCachedSettings(): PosSettings | null {
    try {
      const raw = this.getItem(STORAGE_KEY_SETTINGS);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  public static cacheActiveShift(shift: PosShift | null): void {
    try {
      if (shift) {
        this.setItem(STORAGE_KEY_SHIFT, JSON.stringify(shift));
      } else {
        this.removeItem(STORAGE_KEY_SHIFT);
      }
    } catch {
      // Ignore
    }
  }

  public static getCachedActiveShift(): PosShift | null {
    try {
      const raw = this.getItem(STORAGE_KEY_SHIFT);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}