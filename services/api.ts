

import { Candle, SymbolType, TimeframeType } from '../types';

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
const sanitizeCandles = (data: any[]): Candle[] => {
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

            return {
                time: timeVal,
                open: parseFloat(item.open),
                high: parseFloat(item.high),
                low: parseFloat(item.low),
                close: parseFloat(item.close),
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

/**
 * Initial Load by Date: Fetch context data leading up to the start time.
 * FIXED: Added AbortSignal, no-store cache, and CUSTOM symbol support.
 */
export const fetchContextCandles = async (
    symbol: SymbolType, 
    timeframe: TimeframeType, 
    endTime: number, 
    limit: number = 500, // Increased default limit
    signal?: AbortSignal
): Promise<Candle[]> => {
    // 1. Handle CUSTOM (CSV) Data locally
    if (symbol === 'CUSTOM') {
        const allData = getCustomData();
        // Simple filter for context: all candles BEFORE endTime, take the last 'limit'
        const context = allData.filter(c => c.time < endTime);
        // Return the last N candles
        return context.slice(-limit);
    }

    // 2. Handle Server Data
    try {
        const url = new URL(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}`);
        url.searchParams.set('symbol', `eq.${symbol}`);
        url.searchParams.set('tf', `eq.${timeframe}`);
        url.searchParams.set('time', `lt.${toIsoString(endTime)}`); 
        url.searchParams.set('order', 'time.desc'); 
        url.searchParams.set('limit', limit.toString());

        console.log(`[API] Fetching Context: ${url.toString()}`);

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

        if (!response.ok) {
            console.error(`[API Error] Context: ${response.status}`);
            return []; 
        }

        const rawData = await response.json();
        const candles = sanitizeCandles(rawData);
        console.log(`[API] Context Result: ${candles.length} candles`);
        return candles; 
    } catch (error: any) {
        if (error.name !== 'AbortError') {
            console.error('Fetch context failed:', error);
        }
        return [];
    }
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
    // 1. Handle CUSTOM (CSV) Data locally
    if (symbol === 'CUSTOM') {
        const allData = getCustomData();
        // Filter for future: all candles AFTER startTime, take the first 'limit'
        const future = allData.filter(c => c.time > startTime);
        return future.slice(0, limit);
    }

    try {
        const url = new URL(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}`);
        url.searchParams.set('symbol', `eq.${symbol}`);
        url.searchParams.set('tf', `eq.${timeframe}`);
        url.searchParams.set('time', `gt.${toIsoString(startTime)}`); 
        url.searchParams.set('order', 'time.asc'); 
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
        return sanitizeCandles(rawData);
    } catch (error: any) {
        return [];
    }
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
    // 1. Handle CUSTOM (CSV) Data locally
    if (symbol === 'CUSTOM') {
        const allData = getCustomData();
        // Filter for history: all candles BEFORE beforeTimestamp
        const history = allData.filter(c => c.time < beforeTimestamp);
        // Since we want the "latest" of the history (closest to beforeTimestamp) going backwards
        // We take the last N from that filtered list
        return history.slice(-limit);
    }

    try {
        const url = new URL(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}`);
        url.searchParams.set('symbol', `eq.${symbol}`);
        url.searchParams.set('tf', `eq.${timeframe}`);
        url.searchParams.set('time', `lt.${toIsoString(beforeTimestamp)}`);
        url.searchParams.set('order', 'time.desc');
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
        return sanitizeCandles(rawData);
    } catch (error: any) {
        return [];
    }
};

/**
 * Fetch the absolute first candle available in the database (Oldest).
 * If timeframe is omitted, it fetches the absolute oldest candle across ALL timeframes.
 */
export const fetchFirstCandle = async (
    symbol: SymbolType, 
    timeframe?: TimeframeType, // Optional: if undefined, fetch across all TFs
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
        }
        url.searchParams.set('order', 'time.asc'); 
        url.searchParams.set('limit', '1');

        console.log(`[API] Finding First Candle (${timeframe || 'ALL'}): ${url.toString()}`);

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
        return candles.length > 0 ? candles[0] : null;
    } catch (error: any) {
        if (error.name !== 'AbortError') {
            console.error('Fetch first candle failed:', error);
        }
        return null;
    }
};

/**
 * Fetch the absolute last candle available in the database (Newest).
 * If timeframe is omitted, it fetches the absolute newest candle across ALL timeframes.
 */
export const fetchLastCandle = async (
    symbol: SymbolType, 
    timeframe?: TimeframeType, // Optional: if undefined, fetch across all TFs
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

        console.log(`[API] Finding Last Candle (${timeframe || 'ALL'}): ${url.toString()}`);

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
        return candles.length > 0 ? candles[0] : null;
    } catch (error: any) {
        if (error.name !== 'AbortError') {
             console.error('Fetch last candle failed:', error);
        }
        return null;
    }
};

export const fetchCandles = async (symbol: SymbolType, timeframe: TimeframeType): Promise<Candle[]> => {
    const now = Math.floor(Date.now() / 1000);
    return fetchContextCandles(symbol, timeframe, now, 1000);
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
                } catch (err) {}
            }

            if (parsedData.length > 0) {
                const sorted = sanitizeCandles(parsedData);
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
