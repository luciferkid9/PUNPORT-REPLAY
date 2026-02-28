
import { Candle, SymbolType, TimeframeType } from '../types';
import { resampleCandles } from './logicEngine';
import { TF_SECONDS, SYMBOL_CONFIG } from '../constants';

// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = 'https://ruhtusfckrsqflgymawe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1aHR1c2Zja3JzcWZsZ3ltYXdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQwMDQ1MiwiZXhwIjoyMDgzOTc2NDUyfQ.tihc2r64M3Mt1EHZ63venpC6BecYB8CP1vZKTd96yfg';
const TABLE_NAME = 'market_data';

// Internal cache to prevent redundant master fetches
const DATA_CACHE: Record<string, Candle[]> = {};

// Helper: Convert Unix Timestamp (Seconds) to ISO 8601 String for PostgREST
const toIsoString = (timestamp: number): string => {
    if (!timestamp || isNaN(timestamp)) return new Date().toISOString();
    return new Date(timestamp * 1000).toISOString();
};

/**
 * Clean and format Supabase response to standard Candle format
 * FIXED: Added deduplication and robust date parsing
 */
const sanitizeCandles = (data: any[], symbol?: string): Candle[] => {
    if (!Array.isArray(data)) {
        console.warn("[API Warning] Received non-array data:", data);
        return [];
    }

    const validCandles = data
        .map((item): Candle | null => {
            let timeVal = item.time;
            // Handle various time formats
            if (typeof timeVal === 'string') {
                // Fix: Replace space with T to ensure ISO compliance for Safari/Firefox
                const safeTimeStr = timeVal.replace(' ', 'T');
                const parsed = new Date(safeTimeStr).getTime();
                if (!isNaN(parsed)) {
                    timeVal = Math.floor(parsed / 1000);
                } else {
                    return null; // Invalid date
                }
            } else {
                timeVal = Number(timeVal);
            }

            let open = parseFloat(item.open);
            let high = parseFloat(item.high);
            let low = parseFloat(item.low);
            let close = parseFloat(item.close);

            // AUTO-FIX: If XAUUSD or XAGUSD prices are scaled incorrectly (e.g. 26.50 instead of 2650.00)
            if (symbol === 'XAUUSD' && close < 500) {
                open *= 100; high *= 100; low *= 100; close *= 100;
            }
            if (symbol === 'XAGUSD' && close < 5) {
                open *= 10; high *= 10; low *= 10; close *= 10;
            }

            return {
                time: timeVal,
                open,
                high,
                low,
                close,
                volume: item.volume ? parseFloat(item.volume) : 0
            };
        })
        .filter((c): c is Candle => c !== null && !isNaN(c.time) && !isNaN(c.close) && c.close > 0)
        .sort((a, b) => a.time - b.time);

    // Deduplicate based on time
    const uniqueCandles: Candle[] = [];
    const timeSet = new Set<number>();
    
    for (const c of validCandles) {
        if (!timeSet.has(c.time)) {
            timeSet.add(c.time);
            uniqueCandles.push(c);
        }
    }

    return uniqueCandles;
};

// --- CUSTOM DATA HELPERS ---
const getCustomData = (): Candle[] => DATA_CACHE['CUSTOM-BASE'] || [];

// --- INTERNAL FETCH HELPER ---
const fetchRawCandles = async (
    symbol: SymbolType,
    timeframe: TimeframeType,
    operator: 'lt' | 'gt',
    timestamp: number,
    limit: number,
    order: 'asc' | 'desc',
    signal?: AbortSignal
): Promise<Candle[]> => {
    try {
        const url = new URL(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}`);
        url.searchParams.set('symbol', `eq.${symbol}`);
        url.searchParams.set('tf', `eq.${timeframe}`);
        url.searchParams.set('time', `${operator}.${toIsoString(timestamp)}`);
        url.searchParams.set('order', `time.${order}`);
        url.searchParams.set('limit', limit.toString());

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            cache: 'no-store',
            signal
        });

        if (!response.ok) return [];
        const rawData = await response.json();
        return sanitizeCandles(rawData, symbol);
    } catch (error: any) {
        if (error.name !== 'AbortError') console.error('Fetch raw failed:', error);
        return [];
    }
}

/**
 * Initial Load by Date: Fetch context data leading up to the start time.
 * UPDATED: Includes Fallback Logic (M2 -> Target TF) but NO Mock Data
 */
export const fetchContextCandles = async (
    symbol: SymbolType, 
    timeframe: TimeframeType, 
    endTime: number, 
    limit: number = 500,
    signal?: AbortSignal
): Promise<Candle[]> => {
    // 1. Handle CUSTOM (CSV) Data locally
    if (symbol === 'CUSTOM') {
        const allData = getCustomData();
        const baseContext = allData.filter(c => c.time < endTime);
        const resampled = resampleCandles(baseContext, timeframe);
        return resampled.slice(-limit);
    }

    // 2. Try Fetching Requested Timeframe directly
    let candles = await fetchRawCandles(symbol, timeframe, 'lt', endTime, limit, 'desc', signal);

    // 3. Fallback: If no data found and TF is NOT M2, try fetching M2 and resampling
    if (candles.length === 0 && timeframe !== 'M2') {
        const ratio = (TF_SECONDS[timeframe] || 3600) / TF_SECONDS['M2'];
        const fallbackLimit = Math.min(Math.floor(limit * ratio), 50000); 

        const baseCandles = await fetchRawCandles(symbol, 'M2', 'lt', endTime, fallbackLimit, 'desc', signal);
        
        if (baseCandles.length > 0) {
            const resampled = resampleCandles(baseCandles, timeframe);
            candles = resampled.slice(-limit);
        }
    }

    return candles;
};

/**
 * Stream on Play: Fetch future data starting from a specific time.
 */
export const fetchFutureCandles = async (
    symbol: SymbolType, 
    timeframe: TimeframeType, 
    startTime: number, 
    limit: number = 100,
    signal?: AbortSignal
): Promise<Candle[]> => {
    if (symbol === 'CUSTOM') {
        const allData = getCustomData();
        const baseFuture = allData.filter(c => c.time > startTime);
        const resampled = resampleCandles(baseFuture, timeframe);
        return resampled.filter(c => c.time > startTime).slice(0, limit);
    }

    // 1. Try Target TF
    let candles = await fetchRawCandles(symbol, timeframe, 'gt', startTime, limit, 'asc', signal);

    // 2. Fallback to M2 (Added for Robustness across all TFs)
    if (candles.length === 0 && timeframe !== 'M2') {
        const ratio = (TF_SECONDS[timeframe] || 3600) / TF_SECONDS['M2'];
        const fallbackLimit = Math.min(Math.floor(limit * ratio), 50000);

        const baseCandles = await fetchRawCandles(symbol, 'M2', 'gt', startTime, fallbackLimit, 'asc', signal);
        
        if (baseCandles.length > 0) {
            const resampled = resampleCandles(baseCandles, timeframe);
            candles = resampled.filter(c => c.time > startTime).slice(0, limit);
        }
    }

    return candles;
};

/**
 * Fetch more historical data before a specific timestamp
 */
export const fetchHistoricalData = async (
    symbol: SymbolType, 
    timeframe: TimeframeType, 
    beforeTimestamp: number, 
    limit: number = 200,
    signal?: AbortSignal
): Promise<Candle[]> => {
    if (symbol === 'CUSTOM') {
        const allData = getCustomData();
        const baseHistory = allData.filter(c => c.time < beforeTimestamp);
        const resampled = resampleCandles(baseHistory, timeframe);
        return resampled.slice(-limit);
    }

    // 1. Try Target TF
    let candles = await fetchRawCandles(symbol, timeframe, 'lt', beforeTimestamp, limit, 'desc', signal);

    // 2. Fallback to M2
    if (candles.length === 0 && timeframe !== 'M2') {
        const ratio = (TF_SECONDS[timeframe] || 3600) / TF_SECONDS['M2'];
        const fallbackLimit = Math.min(Math.floor(limit * ratio), 50000);

        const baseCandles = await fetchRawCandles(symbol, 'M2', 'lt', beforeTimestamp, fallbackLimit, 'desc', signal);
        
        if (baseCandles.length > 0) {
            const resampled = resampleCandles(baseCandles, timeframe);
            candles = resampled.slice(-limit);
        }
    }

    return candles;
};

/**
 * Fetch the absolute first candle available in the database (Oldest).
 */
export const fetchFirstCandle = async (
    symbol: SymbolType, 
    timeframe?: TimeframeType, 
    signal?: AbortSignal
): Promise<Candle | null> => {
    if (symbol === 'CUSTOM') {
        const allData = getCustomData();
        return allData.length > 0 ? allData[0] : null;
    }

    try {
        const url = new URL(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}`);
        url.searchParams.set('symbol', `eq.${symbol}`);
        if (timeframe) {
            url.searchParams.set('tf', `eq.${timeframe}`);
        } else {
            url.searchParams.set('tf', `eq.M2`);
        }
        url.searchParams.set('order', 'time.asc'); 
        url.searchParams.set('limit', '1');

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            cache: 'no-store',
            signal
        });

        if (!response.ok) return null;
        
        const rawData = await response.json();
        const candles = sanitizeCandles(rawData);
        
        if (candles.length > 0) return candles[0];
        return null;

    } catch (error: any) {
        return null;
    }
};

/**
 * Fetch the absolute last candle available in the database (Newest).
 */
export const fetchLastCandle = async (
    symbol: SymbolType, 
    timeframe?: TimeframeType,
    signal?: AbortSignal
): Promise<Candle | null> => {
    if (symbol === 'CUSTOM') {
        const allData = getCustomData();
        return allData.length > 0 ? allData[allData.length - 1] : null;
    }

    try {
        const url = new URL(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}`);
        url.searchParams.set('symbol', `eq.${symbol}`);
        if (timeframe) {
            url.searchParams.set('tf', `eq.${timeframe}`);
        }
        url.searchParams.set('order', 'time.desc'); // Descending order
        url.searchParams.set('limit', '1');

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            cache: 'no-store',
            signal
        });

        if (!response.ok) return null;
        
        const rawData = await response.json();
        const candles = sanitizeCandles(rawData);
        
        if (candles.length > 0) return candles[0];
        return null;

    } catch (error: any) {
        return null;
    }
};

export const fetchCandles = async (symbol: SymbolType, timeframe: TimeframeType): Promise<Candle[]> => {
    const now = Math.floor(Date.now() / 1000);
    return fetchContextCandles(symbol, timeframe, now, 1000);
};

// --- COUPON SYSTEM HELPERS ---

export interface CouponInfo {
    code: string;
    duration_days: number;
    is_active: boolean;
}

/**
 * Verify if a coupon code is valid and if the device has already used one.
 */
export const verifyCoupon = async (code: string, deviceId: string): Promise<{ success: boolean, coupon?: CouponInfo, error?: string }> => {
    try {
        // 1. Check if THIS SPECIFIC coupon code has already been used on THIS device
        const checkDeviceUrl = new URL(`${SUPABASE_URL}/rest/v1/device_used_coupons`);
        checkDeviceUrl.searchParams.set('device_id', `eq.${deviceId}`);
        checkDeviceUrl.searchParams.set('coupon_code', `eq.${code}`);
        
        const deviceResponse = await fetch(checkDeviceUrl.toString(), {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (deviceResponse.ok) {
            const usedData = await deviceResponse.json();
            if (usedData.length > 0) {
                return { success: false, error: "This device has already used this coupon." };
            }
        }

        // 2. Check if coupon code exists and is active
        const checkCouponUrl = new URL(`${SUPABASE_URL}/rest/v1/coupons`);
        checkCouponUrl.searchParams.set('code', `eq.${code}`);
        checkCouponUrl.searchParams.set('is_active', `eq.true`);

        const couponResponse = await fetch(checkCouponUrl.toString(), {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!couponResponse.ok) return { success: false, error: "Failed to verify coupon." };

        const couponData = await couponResponse.json();
        if (couponData.length === 0) {
            return { success: false, error: "Invalid or inactive coupon code." };
        }

        return { success: true, coupon: couponData[0] };

    } catch (error) {
        console.error("Coupon verification error:", error);
        return { success: false, error: "Network error during verification." };
    }
};

/**
 * Record coupon usage for a device.
 */
export const recordCouponUsage = async (code: string, deviceId: string, userId?: string): Promise<boolean> => {
    try {
        const url = new URL(`${SUPABASE_URL}/rest/v1/device_used_coupons`);
        const body: any = {
            device_id: deviceId,
            coupon_code: code,
            used_at: new Date().toISOString()
        };
        if (userId) {
            body.user_id = userId;
        }

        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(body)
        });

        return response.ok;
    } catch (error) {
        console.error("Failed to record coupon usage:", error);
        return false;
    }
};

export const parseCSV = async (file: File): Promise<{ success: boolean, start?: number, end?: number, count?: number, digits?: number, error?: string }> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (!text) { resolve({ success: false, error: "Empty file" }); return; }
            
            const lines = text.split('\n');
            const parsedData: Candle[] = [];
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line || /^[a-zA-Z]/.test(line[0])) continue;
                
                const parts = line.split(/[,\t;]/);
                if (parts.length < 5) continue; 

                try {
                    let timestamp: number;
                    let open, high, low, close, volume;
                    const datePart = parts[0].replace(/\./g, '-'); 
                    
                    if (parts[1] && parts[1].includes(':')) {
                         const timePart = parts[1];
                         timestamp = new Date(`${datePart}T${timePart}`).getTime() / 1000;
                         open = parseFloat(parts[2]);
                         high = parseFloat(parts[3]);
                         low = parseFloat(parts[4]);
                         close = parseFloat(parts[5]);
                         volume = parseFloat(parts[6] || '0');
                    } else {
                        const parsedDate = new Date(datePart);
                        if (isNaN(parsedDate.getTime())) continue;
                        timestamp = parsedDate.getTime() / 1000;
                        open = parseFloat(parts[1]);
                        high = parseFloat(parts[2]);
                        low = parseFloat(parts[3]);
                        close = parseFloat(parts[4]);
                        volume = parseFloat(parts[5] || '0');
                    }

                    if (isNaN(timestamp) || isNaN(close) || isNaN(open)) continue;
                    parsedData.push({ time: timestamp, open, high, low, close, volume });
                } catch (err) {
                    // Skip malformed rows
                }
            }

            if (parsedData.length > 0) {
                const sorted = sanitizeCandles(parsedData, 'CUSTOM');
                DATA_CACHE['CUSTOM-BASE'] = sorted;
                
                // Calculate digits from data
                let maxDecimals = 2;
                for(let i=0; i<Math.min(50, sorted.length); i++) {
                    const priceStr = sorted[i].close.toString();
                    if (priceStr.includes('.')) {
                        const decimals = priceStr.split('.')[1].length;
                        if (decimals > maxDecimals) maxDecimals = decimals;
                    }
                }

                resolve({ success: true, start: sorted[0].time, end: sorted[sorted.length-1].time, count: sorted.length, digits: maxDecimals });
            } else {
                resolve({ success: false, error: "No valid candles found." });
            }
        };
        reader.readAsText(file);
    });
};
