import { openDB, IDBPDatabase } from 'idb';
import { Candle } from '../types';

const DB_NAME = 'ProTradeReplayDB';
const STORE_NAME = 'candles';
const STORE_POSITIONS = 'positions';
const STORE_DRAWINGS = 'drawings';
const DB_VERSION = 2;

export interface CachedCandle extends Candle {
    symbol: string;
    timeframe: string;
    // Composite key: symbol + timeframe + time
    id: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('symbol_tf_time', ['symbol', 'timeframe', 'time']);
                }
                if (!db.objectStoreNames.contains(STORE_POSITIONS)) {
                    db.createObjectStore(STORE_POSITIONS, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORE_DRAWINGS)) {
                    db.createObjectStore(STORE_DRAWINGS, { keyPath: 'id' });
                }
            },
        });
    }
    return dbPromise;
}

export const localDB = {
    async saveCandles(symbol: string, timeframe: string, candles: Candle[]) {
        const db = await getDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        
        for (const candle of candles) {
            const id = `${symbol}_${timeframe}_${candle.time}`;
            await store.put({
                ...candle,
                symbol,
                timeframe,
                id
            });
        }
        await tx.done;
    },

    async getCandles(symbol: string, timeframe: string, startTime: number, endTime: number): Promise<Candle[]> {
        const db = await getDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const index = tx.store.index('symbol_tf_time');
        
        // Use a range query to get candles for this symbol and timeframe within the time range
        const range = IDBKeyRange.bound(
            [symbol, timeframe, startTime],
            [symbol, timeframe, endTime]
        );
        
        const results = await index.getAll(range);
        return results.map(({ id, symbol, timeframe, ...candle }) => candle as Candle);
    },

    async getCandlesBefore(symbol: string, timeframe: string, beforeTime: number, limit: number): Promise<Candle[]> {
        const db = await getDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const index = tx.store.index('symbol_tf_time');
        // Upper bound is [symbol, timeframe, beforeTime] (open)
        // Lower bound is [symbol, timeframe, 0]
        const range = IDBKeyRange.bound(
            [symbol, timeframe, 0],
            [symbol, timeframe, beforeTime],
            false, true // lower open? no. upper open? yes (beforeTime is exclusive usually, or inclusive? let's say exclusive for 'lt')
        );
        
        // We want the *last* N candles, so we iterate backwards (prev)
        let cursor = await index.openCursor(range, 'prev');
        const results: Candle[] = [];
        
        while (cursor && results.length < limit) {
            const { id, symbol: s, timeframe: tf, ...candle } = cursor.value;
            results.push(candle as Candle);
            cursor = await cursor.continue();
        }
        
        // Results are in reverse order (newest first), so reverse them back
        return results.reverse();
    },

    async getCandlesAfter(symbol: string, timeframe: string, afterTime: number, limit: number): Promise<Candle[]> {
        const db = await getDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const index = tx.store.index('symbol_tf_time');
        // Lower bound is [symbol, timeframe, afterTime] (exclusive)
        const range = IDBKeyRange.bound(
            [symbol, timeframe, afterTime],
            [symbol, timeframe, Infinity],
            true, false // lower open (exclusive), upper closed
        );
        
        let cursor = await index.openCursor(range, 'next');
        const results: Candle[] = [];
        
        while (cursor && results.length < limit) {
            const { id, symbol: s, timeframe: tf, ...candle } = cursor.value;
            results.push(candle as Candle);
            cursor = await cursor.continue();
        }
        
        return results;
    },

    async getLatestTime(symbol: string, timeframe: string): Promise<number | null> {
        const db = await getDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const index = tx.store.index('symbol_tf_time');
        const range = IDBKeyRange.bound([symbol, timeframe, 0], [symbol, timeframe, Infinity]);
        const cursor = await index.openCursor(range, 'prev');
        return cursor ? cursor.value.time : null;
    },

    async getEarliestTime(symbol: string, timeframe: string): Promise<number | null> {
        const db = await getDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const index = tx.store.index('symbol_tf_time');
        const range = IDBKeyRange.bound([symbol, timeframe, 0], [symbol, timeframe, Infinity]);
        const cursor = await index.openCursor(range, 'next');
        return cursor ? cursor.value.time : null;
    },

    // Persistence Methods
    async savePosition(position: any) {
        const db = await getDB();
        await db.put(STORE_POSITIONS, position);
    },
    async deletePosition(id: string) {
        const db = await getDB();
        await db.delete(STORE_POSITIONS, id);
    },
    async getAllPositions(): Promise<any[]> {
        const db = await getDB();
        return await db.getAll(STORE_POSITIONS);
    },
    async saveDrawing(drawing: any) {
        const db = await getDB();
        await db.put(STORE_DRAWINGS, drawing);
    },
    async deleteDrawing(id: string) {
        const db = await getDB();
        await db.delete(STORE_DRAWINGS, id);
    },
    async getAllDrawings(): Promise<any[]> {
        const db = await getDB();
        return await db.getAll(STORE_DRAWINGS);
    }
};
