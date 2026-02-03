
import { Candle } from "../types";
import { getContractSize } from "../constants";

// Simulate ta.sma(close, length)
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

// Simulate ta.ema(close, length)
export const calculateEMA = (data: Candle[], period: number): { time: number; value: number }[] => {
  const k = 2 / (period + 1);
  const emaData = [];
  if (data.length === 0) return [];
  
  let ema = data[0].close;

  for (let i = 0; i < data.length; i++) {
    const price = data[i].close;
    if (i === 0) {
      ema = price;
    } else {
      ema = price * k + ema * (1 - k);
    }
    emaData.push({ time: data[i].time, value: ema });
  }
  return emaData;
};

// Simulate ta.rsi(close, length)
export const calculateRSI = (data: Candle[], period: number = 14): { time: number; value: number }[] => {
    const rsiData = [];
    if (data.length <= period) return [];

    let gains = 0;
    let losses = 0;

    // Initial calculation
    for (let i = 1; i <= period; i++) {
        const change = data[i].close - data[i - 1].close;
        if (change > 0) gains += change;
        else losses += Math.abs(change);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < data.length; i++) {
        const change = data[i].close - data[i - 1].close;
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? Math.abs(change) : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        let rsi = 100 - (100 / (1 + rs));

        rsiData.push({ time: data[i].time, value: rsi });
    }
    return rsiData;
}

/**
 * ProMACD Logic (Hybrid Adaptive Calculation)
 * Ensures valid MACD values from Candle #1 (Index 0).
 */
export const calculateMACD = (data: Candle[], fastLen: number = 12, slowLen: number = 26, signalLen: number = 9) => {
    if (data.length === 0) return { macd: [], signal: [], histogram: [] };

    const macdLine: { time: number; value: number }[] = [];
    const signalLine: { time: number; value: number }[] = [];
    const histogram: { time: number; value: number }[] = [];

    // State variables for EMA calculation (used after index 26)
    let prevFastEMA = 0;
    let prevSlowEMA = 0;
    let prevSignalEMA = 0;

    const kFast = 2 / (fastLen + 1);
    const kSlow = 2 / (slowLen + 1);
    const kSignal = 2 / (signalLen + 1);

    for (let i = 0; i < data.length; i++) {
        const candle = data[i];
        const close = candle.close;
        const time = candle.time;

        let fastVal = 0;
        let slowVal = 0;
        let macdVal = 0;

        // --- 1. FAST & SLOW Line Calculation ---

        if (i === 0) {
            // [Bar 0] Price Action Fallback
            // Use (Close - Open) to determine initial momentum
            const bodySize = close - candle.open;
            
            // If body is effectively zero (Doji), force a tiny positive epsilon to avoid division by zero later
            const momentum = bodySize !== 0 ? bodySize : 0.00001;
            
            // We manipulate Fast/Slow to produce MACD = momentum
            // Fast = Close + momentum, Slow = Close
            // MACD = Fast - Slow = momentum
            fastVal = close + momentum; 
            slowVal = close;
            
            // Seed EMAs
            prevFastEMA = fastVal;
            prevSlowEMA = slowVal;

        } else if (i < slowLen) {
            // [Bar 1 - 25] Early Stage: Cumulative SMA
            // Use average of ALL available data points for Slow Line
            // This ensures stability while history is building up
            
            const startFast = Math.max(0, i + 1 - fastLen);
            const fastSlice = data.slice(startFast, i + 1);
            fastVal = fastSlice.reduce((sum, c) => sum + c.close, 0) / fastSlice.length;

            const slowSlice = data.slice(0, i + 1);
            slowVal = slowSlice.reduce((sum, c) => sum + c.close, 0) / slowSlice.length;

            prevFastEMA = fastVal;
            prevSlowEMA = slowVal;
        } else {
            // [Bar 26+] Standard EMA Logic
            fastVal = (close * kFast) + (prevFastEMA * (1 - kFast));
            slowVal = (close * kSlow) + (prevSlowEMA * (1 - kSlow));
            
            prevFastEMA = fastVal;
            prevSlowEMA = slowVal;
        }

        macdVal = fastVal - slowVal;
        macdLine.push({ time, value: macdVal });

        // --- 2. SIGNAL Line Calculation ---

        let signalVal = 0;
        
        if (i < signalLen) {
            // Early Signal: Use 50% of MACD value to force a visible Histogram
            // If MACD is 10, Signal is 5 -> Hist is 5 (Visible)
            signalVal = macdVal * 0.5;
            prevSignalEMA = signalVal;
        } else {
            // Standard Signal EMA
            signalVal = (macdVal * kSignal) + (prevSignalEMA * (1 - kSignal));
            prevSignalEMA = signalVal;
        }

        signalLine.push({ time, value: signalVal });
        histogram.push({ time, value: macdVal - signalVal });
    }

    return { macd: macdLine, signal: signalLine, histogram };
}

export type MarketTrend = 
    | 'BULLISH_MOMENTUM' 
    | 'BEARISH_MOMENTUM' 
    | 'SIDEWAY_UP' 
    | 'SIDEWAY_DOWN' 
    | 'BULLISH_EARLY'       
    | 'BEARISH_EARLY' 
    | 'SIDEWAY_UP_EARLY' 
    | 'SIDEWAY_DOWN_EARLY'
    | 'UNKNOWN';

export const analyzeMarketTrend = (data: Candle[]): MarketTrend => {
    if (data.length === 0) return 'UNKNOWN';
    
    // Calculate using ProMACD logic
    const { macd, signal } = calculateMACD(data);
    
    if (macd.length === 0 || signal.length === 0) return 'UNKNOWN';

    const lastMacd = macd[macd.length - 1].value;
    const lastSignal = signal[signal.length - 1].value;

    const isEarly = data.length < 26; 

    // Absolute Fallback: Even if calculations yield 0, use Price Action
    const isTinyValues = Math.abs(lastMacd) < 0.00000001;

    if (isTinyValues) {
        const lastCandle = data[data.length - 1];
        const isBullishCandle = lastCandle.close >= lastCandle.open;
        return isBullishCandle ? 'BULLISH_EARLY' : 'BEARISH_EARLY';
    }

    // Standard Trend Logic
    if (lastMacd > lastSignal) {
        if (lastMacd > 0) return isEarly ? 'BULLISH_EARLY' : 'BULLISH_MOMENTUM';
        else return isEarly ? 'SIDEWAY_UP_EARLY' : 'SIDEWAY_UP';
    } 
    else {
        if (lastMacd < 0) return isEarly ? 'BEARISH_EARLY' : 'BEARISH_MOMENTUM';
        else return isEarly ? 'SIDEWAY_DOWN_EARLY' : 'SIDEWAY_DOWN';
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
