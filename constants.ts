
import { Candle, SymbolType, TimeframeType } from './types';

export const INITIAL_BALANCE = 10000;
export const DEFAULT_LEVERAGE = 100; // Leverage 1:100
export const STOP_OUT_LEVEL = 0;   // Stop Out at Margin Level 0% (Equity <= 0)

// Standard Contract Sizes based on User Specification
// Forex: 100,000 units per lot (Standard)
// XAUUSD: 100 oz per lot (1 Pip = $1 at 1 Lot)
export const CONTRACT_SIZES: Record<string, number> = {
    'FOREX': 100000,
    'XAUUSD': 100, 
    'DEFAULT': 1
};

export const getContractSize = (symbol: string): number => {
    // Exact match for Gold
    if (symbol === 'XAUUSD') return CONTRACT_SIZES['XAUUSD'];
    
    // Silver usually 5000 or 1000, assume 5000 for standard
    if (symbol === 'XAGUSD') return 5000;
    
    // Forex Pairs (6 letters, usually contain USD, JPY, EUR, etc.)
    // Logic: If it's a currency pair, use 100,000
    if (symbol.length === 6 && !symbol.includes('XAU') && !symbol.includes('XAG')) {
        return CONTRACT_SIZES['FOREX'];
    }
    
    return CONTRACT_SIZES['DEFAULT'];
};

export const SYMBOL_CONFIG: Record<SymbolType, { base: number, current: number, vol: number, digits: number }> = {
    'AUDUSD': { base: 0.6500, current: 0.6550, vol: 0.0011, digits: 5 },
    'EURAUD': { base: 1.6200, current: 1.6350, vol: 0.0018, digits: 5 },
    'EURJPY': { base: 155.00, current: 163.50, vol: 0.45, digits: 3 },
    'EURUSD': { base: 1.0500, current: 1.0580, vol: 0.0010, digits: 5 },
    'GBPAUD': { base: 1.9000, current: 1.9500, vol: 0.0022, digits: 5 },
    'GBPJPY': { base: 180.00, current: 196.00, vol: 0.55, digits: 3 },
    'GBPUSD': { base: 1.2200, current: 1.2650, vol: 0.0015, digits: 5 },
    'NZDUSD': { base: 0.5900, current: 0.5850, vol: 0.0011, digits: 5 },
    'USDCHF': { base: 0.9000, current: 0.8850, vol: 0.0012, digits: 5 },
    'USDJPY': { base: 145.50, current: 154.00, vol: 0.40, digits: 3 },
    'XAGUSD': { base: 23.50, current: 31.50, vol: 0.45, digits: 3 },
    'XAUUSD': { base: 2050.00, current: 2650.00, vol: 15.50, digits: 2 },
    'CUSTOM': { base: 1.0000, current: 1.0000, vol: 0.0010, digits: 5 }
};

export const TF_SECONDS: Record<TimeframeType, number> = {
    'M2': 120,
    'M5': 300,
    'M15': 900,
    'M30': 1800,
    'H1': 3600,
    'H2': 7200,
    'H4': 14400,
    'D1': 86400
};

export const generateData = (symbol: SymbolType, timeframe: TimeframeType, count: number): Candle[] => [];
export const MOCK_DATA: Candle[] = [];