
import { Candle, TimeframeType } from "../types";
import { getContractSize, DEFAULT_LEVERAGE, TF_SECONDS } from "../constants";

// --- CANDLE RESAMPLING ---
export const resampleCandles = (baseData: Candle[], targetTimeframe: TimeframeType): Candle[] => {
    const periodSeconds = TF_SECONDS[targetTimeframe];
    if (!periodSeconds || baseData.length === 0) return baseData;

    // Use a map to aggregate to handle gaps gracefully
    const buckets = new Map<number, Candle[]>();

    baseData.forEach(c => {
        // Floor the time to the nearest period start
        const bucketTime = Math.floor(c.time / periodSeconds) * periodSeconds;
        if (!buckets.has(bucketTime)) {
            buckets.set(bucketTime, []);
        }
        buckets.get(bucketTime)!.push(c);
    });

    const resampled: Candle[] = [];
    const sortedTimes = Array.from(buckets.keys()).sort((a, b) => a - b);

    sortedTimes.forEach(time => {
        const group = buckets.get(time)!;
        // Sort group by time to ensure Open is first and Close is last
        group.sort((a, b) => a.time - b.time);

        const open = group[0].open;
        const close = group[group.length - 1].close;
        let high = -Infinity;
        let low = Infinity;
        let volume = 0;

        group.forEach(c => {
            if (c.high > high) high = c.high;
            if (c.low < low) low = c.low;
            volume += (c.volume || 0);
        });

        resampled.push({
            time,
            open,
            high,
            low,
            close,
            volume
        });
    });

    return resampled;
};

// --- STANDARD MOVING AVERAGES ---

// Simple Moving Average (SMA)
export const calculateSMA = (data: Candle[], period: number): { time: number; value: number }[] => {
  const smaData = [];
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const sum = slice.reduce((acc, curr) => acc + curr.close, 0);
    smaData.push({
      time: data[i].time,
      value: sum / period,
    });
  }
  return smaData;
};

// Exponential Moving Average (EMA) - Standard with SMA Seed
export const calculateEMA = (data: Candle[], period: number): { time: number; value: number }[] => {
  if (data.length < period) return [];
  
  const k = 2 / (period + 1);
  const emaData: { time: number; value: number }[] = [];

  // 1. Initialize with SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
      sum += data[i].close;
  }
  let ema = sum / period;
  
  // Push first point at index = period - 1
  emaData.push({ time: data[period - 1].time, value: ema });

  // 2. Calculate subsequent EMAs
  for (let i = period; i < data.length; i++) {
    const price = data[i].close;
    ema = (price * k) + (ema * (1 - k));
    emaData.push({ time: data[i].time, value: ema });
  }
  
  return emaData;
};

/**
 * Standard RSI (Wilder's Smoothing)
 * Correct Implementation:
 * - Needs 'period' + 1 data points to start.
 * - First value calculated using SMA of gains/losses.
 * - Subsequent values use Wilder's smoothing.
 */
export const calculateRSI = (data: Candle[], period: number = 14): { time: number; value: number }[] => {
    if (data.length <= period) return [];

    const rsiData: { time: number; value: number }[] = [];
    
    let avgGain = 0;
    let avgLoss = 0;

    // 1. Initial Calculation (SMA Phase)
    // Calculate sum of gains/losses for the first 'period'
    for (let i = 1; i <= period; i++) {
        const change = data[i].close - data[i - 1].close;
        if (change > 0) avgGain += change;
        else avgLoss += Math.abs(change);
    }

    avgGain /= period;
    avgLoss /= period;

    // Calculate first RSI at index 'period'
    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    let rsi = 100 - (100 / (1 + rs));
    rsiData.push({ time: data[period].time, value: rsi });

    // 2. Smoothing Phase (Wilder's)
    for (let i = period + 1; i < data.length; i++) {
        const change = data[i].close - data[i - 1].close;
        const currentGain = change > 0 ? change : 0;
        const currentLoss = change < 0 ? Math.abs(change) : 0;

        // Wilder's Smoothing Formula
        avgGain = ((avgGain * (period - 1)) + currentGain) / period;
        avgLoss = ((avgLoss * (period - 1)) + currentLoss) / period;

        rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi = 100 - (100 / (1 + rs));

        rsiData.push({ time: data[i].time, value: rsi });
    }

    return rsiData;
}

/**
 * Standard MACD
 * - Fast EMA (12)
 * - Slow EMA (26)
 * - Signal (9)
 * Note: Uses SMA seeding for EMAs, so valid values start later than index 0.
 */
export const calculateMACD = (data: Candle[], fastLen: number = 12, slowLen: number = 26, signalLen: number = 9) => {
    // Need at least enough data for the slow EMA to start
    if (data.length < slowLen) return { macd: [], signal: [], histogram: [] };

    // Helper for pure number arrays to easier handling
    const closes = data.map(c => c.close);
    const times = data.map(c => c.time);

    const calcEMAArray = (values: number[], period: number): (number | null)[] => {
        const k = 2 / (period + 1);
        const result: (number | null)[] = new Array(values.length).fill(null);
        
        let sum = 0;
        for (let i = 0; i < period; i++) sum += values[i];
        
        let ema = sum / period;
        result[period - 1] = ema;

        for (let i = period; i < values.length; i++) {
            ema = (values[i] * k) + (ema * (1 - k));
            result[i] = ema;
        }
        return result;
    };

    const fastEMA = calcEMAArray(closes, fastLen);
    const slowEMA = calcEMAArray(closes, slowLen);

    const macdLine: { time: number; value: number }[] = [];
    const macdValues: number[] = [];
    const validIndices: number[] = [];

    // Calculate MACD Line (Fast - Slow)
    for (let i = 0; i < data.length; i++) {
        if (fastEMA[i] !== null && slowEMA[i] !== null) {
            const val = (fastEMA[i] as number) - (slowEMA[i] as number);
            macdLine.push({ time: times[i], value: val });
            macdValues.push(val);
            validIndices.push(i); // Keep track of original indices
        }
    }

    // Calculate Signal Line (EMA of MACD)
    // Signal line applies EMA logic to the MACD values
    const signalValuesRaw = calcEMAArray(macdValues, signalLen);
    
    const signalLine: { time: number; value: number }[] = [];
    const histogram: { time: number; value: number }[] = [];

    for (let i = 0; i < signalValuesRaw.length; i++) {
        if (signalValuesRaw[i] !== null) {
            const sigVal = signalValuesRaw[i] as number;
            const macdVal = macdValues[i];
            // Map back to original time
            const originalIndex = validIndices[i];
            const time = times[originalIndex];

            signalLine.push({ time, value: sigVal });
            histogram.push({ time, value: macdVal - sigVal });
        }
    }

    // We also need to filter the MACD line to match where Signal starts?
    // Usually trading platforms show MACD line as soon as it's available, 
    // but Histogram/Signal appear later.
    // However, for clean charting, we return all available points.
    
    return { macd: macdLine, signal: signalLine, histogram };
}

export type MarketTrend = 
    | 'BULLISH_MOMENTUM' 
    | 'BEARISH_MOMENTUM' 
    | 'SIDEWAY_UP' 
    | 'SIDEWAY_DOWN' 
    | 'UNKNOWN';

export const analyzeMarketTrend = (data: Candle[]): MarketTrend => {
    // Need substantial data for standard MACD to be valid
    if (data.length < 50) return 'UNKNOWN'; 
    
    const { macd, signal } = calculateMACD(data);
    
    if (macd.length === 0 || signal.length === 0) return 'UNKNOWN';

    // Get latest values
    const lastMacd = macd[macd.length - 1].value;
    const lastSignal = signal[signal.length - 1].value;

    if (lastMacd > lastSignal) {
        return lastMacd > 0 ? 'BULLISH_MOMENTUM' : 'SIDEWAY_UP';
    } else {
        return lastMacd < 0 ? 'BEARISH_MOMENTUM' : 'SIDEWAY_DOWN';
    }
};

export const calculatePositionSize = (
  accountBalance: number,
  riskPercentage: number,
  entryPrice: number,
  stopLoss: number,
  symbol: string
): number => {
  const riskAmount = accountBalance * (riskPercentage / 100);
  const priceDiff = Math.abs(entryPrice - stopLoss);
  
  if (priceDiff === 0) return 0;

  const contractSize = getContractSize(symbol);
  
  const lots = riskAmount / (priceDiff * contractSize);
  
  return Math.floor(lots * 100) / 100;
};

// --- STATIC RATES FOR CROSS PAIR CONVERSION ---
const STATIC_RATES: Record<string, number> = {
    'EUR': 1.08, 
    'GBP': 1.27, 
    'AUD': 0.65, 
    'NZD': 0.60, 
    'CAD': 0.73, 
    'CHF': 1.13,
    'USD': 1.0
};

// --- MARGIN CALCULATION LOGIC ---
export const calculateRequiredMargin = (symbol: string, lots: number, price: number): number => {
    const contractSize = getContractSize(symbol);
    const leverage = DEFAULT_LEVERAGE; 

    const baseMargin = (lots * contractSize) / leverage;

    if (symbol.startsWith('USD')) {
        return baseMargin;
    }

    if (symbol.endsWith('USD')) {
        return baseMargin * price;
    }

    const base = symbol.substring(0, 3);
    const conversionRate = STATIC_RATES[base] || 1.0;
    
    return baseMargin * conversionRate;
};

// --- PNL CONVERSION LOGIC ---
export const calculatePnLInUSD = (symbol: string, rawPnL: number, price: number): number => {
    if (rawPnL === 0) return 0;
    
    if (symbol.endsWith('USD')) {
        return rawPnL;
    }

    const base = symbol.substring(0, 3);
    const baseRate = STATIC_RATES[base] || 1.0;
    
    if (price === 0) return 0;

    return rawPnL * (baseRate / price);
};
