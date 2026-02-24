import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Candle, SymbolType, TimeframeType, TraderProfile, SimulationState } from '../types';
import { TF_SECONDS, SYMBOL_CONFIG } from '../constants';
import { fetchContextCandles, fetchFutureCandles, fetchFirstCandle, fetchHistoricalData } from '../services/api';
import { ChartRef } from '../components/ChartContainer';

const VISIBLE_CANDLES = 1000;
const WARMUP_BUFFER = 500;
const MIN_WARMUP = 200;

export function useSimulationEngine(
  activeSymbol: SymbolType,
  activeTimeframe: TimeframeType,
  activeProfileId: string | null,
  activeProfile: TraderProfile | null,
  chartRef: React.RefObject<ChartRef | null>
) {
  const [chartData, setChartData] = useState<Candle[]>([]);
  const chartDataRef = useRef<Candle[]>([]);
  useEffect(() => { chartDataRef.current = chartData; }, [chartData]);

  const warmupDataRef = useRef<Candle[]>([]);
  const isSwitchingTfRef = useRef<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [isLoadingFuture, setIsLoadingFuture] = useState<boolean>(false);
  const [showDataError, setShowDataError] = useState<boolean>(false);

  const [simState, setSimState] = useState<SimulationState>({ isPlaying: false, speed: 500, currentIndex: 0, maxIndex: 0 });
  const [currentSimTime, setCurrentSimTime] = useState<number>(0);

  const [currentRealTimePrice, setCurrentRealTimePrice] = useState<number>(0);
  const lastKnownPriceRef = useRef<number>(0);
  useEffect(() => {
      lastKnownPriceRef.current = currentRealTimePrice;
  }, [currentRealTimePrice]);
  const [dataVersion, setDataVersion] = useState(0);

  const currentSlice = useMemo(() => {
      if (chartData.length === 0) return [];
      return chartData.slice(0, Math.min(simState.currentIndex + 1, chartData.length));
  }, [chartData, simState.currentIndex]);

  const tradingPrice = useMemo(() => {
      return currentSlice.length > 0 ? currentSlice[currentSlice.length - 1].close : 0;
  }, [currentSlice]);

  const lastTime = useMemo(() => {
      return currentSlice.length > 0 ? currentSlice[currentSlice.length - 1].time : 0;
  }, [currentSlice]);

  const handleSymbolChange = useCallback((newSymbol: SymbolType) => {
      setChartData([]);
      warmupDataRef.current = [];
      setShowDataError(false);
      setSimState(prev => ({ ...prev, isPlaying: false }));
  }, []);

  const tick = useCallback(() => {
      setSimState(prev => {
          const nextIndex = prev.currentIndex + 1;
          if (nextIndex >= prev.maxIndex) {
              return { ...prev, isPlaying: false };
          }
          return { ...prev, currentIndex: nextIndex };
      });
  }, []);

  const handleJumpToDate = useCallback((dateStr: string) => {
      const target = new Date(dateStr).getTime() / 1000;
      if (!isNaN(target)) {
          setSimState(prev => ({ ...prev, isPlaying: false }));
          setCurrentSimTime(target);
          setDataVersion(v => v + 1);
      }
  }, []);

  const handleJumpToFirstData = useCallback(async () => {
       setIsLoading(true);
       setSimState(prev => ({ ...prev, isPlaying: false }));
       setShowDataError(false);
       try {
           const first = await fetchFirstCandle(activeSymbol, activeTimeframe);
           if (first) {
               const target = first.time; 
               setCurrentSimTime(target);
               setDataVersion(v => v + 1);
           }
       } catch(e) { console.error(e); } finally { setIsLoading(false); }
  }, [activeSymbol, activeTimeframe]);

  useEffect(() => {
      let interval: number;
      if (simState.isPlaying) {
          interval = window.setInterval(tick, simState.speed);
      }
      return () => clearInterval(interval);
  }, [simState.isPlaying, simState.speed, tick]);

  const getDynamicPrecision = useCallback(() => {
      if (activeProfile?.customDigits) return activeProfile.customDigits;
      if (SYMBOL_CONFIG[activeSymbol]) return SYMBOL_CONFIG[activeSymbol].digits;
      if (chartData.length > 0) {
          const sample = chartData[chartData.length-1].close;
          if (sample > 500) return 2; 
          if (sample > 20) return 3;  
          return 5;
      }
      return 5;
  }, [activeProfile, activeSymbol, chartData]);
  
  const currentDigits = getDynamicPrecision();

  // --- DATA LOADING & BUFFERING ---
  useEffect(() => {
     if (!activeSymbol || !activeProfileId || !activeProfile) return;
     const controller = new AbortController();
     
     const loadInitialData = async () => {
         isSwitchingTfRef.current = true;
         setIsLoading(true); setShowDataError(false); 
         try {
             const simTime = currentSimTime > 0 ? currentSimTime : activeProfile.startDate;
             const startSession = activeProfile.startDate;
             const tfSecs = TF_SECONDS[activeTimeframe] || 60;
             const alignedTime = Math.floor(simTime / tfSecs) * tfSecs;

             const totalContextNeeded = VISIBLE_CANDLES + WARMUP_BUFFER;
             const context = await fetchContextCandles(activeSymbol, activeTimeframe, alignedTime + tfSecs, totalContextNeeded, controller.signal);
             const future = await fetchFutureCandles(activeSymbol, activeTimeframe, alignedTime, VISIBLE_CANDLES, controller.signal);
             
             if (controller.signal.aborted) return;

             if (future.length > 0 || context.length > 0) {
                 const validHistory = context.filter(c => c.time >= startSession);
                 let finalWarmup = context.filter(c => c.time < startSession);
                 if (finalWarmup.length < MIN_WARMUP) {
                     const first = context.length > 0 ? context[0] : (future.length > 0 ? future[0] : null);
                     if (first) {
                         const paddingCount = MIN_WARMUP - finalWarmup.length;
                         const padding = Array(paddingCount).fill(null).map((_, i) => ({ ...first, time: first.time - ((paddingCount - i) * tfSecs) }));
                         finalWarmup = [...padding, ...finalWarmup];
                     }
                 }
                 const visibleMap = new Map<number, Candle>();
                 validHistory.forEach(c => visibleMap.set(c.time, c));
                 future.forEach(c => visibleMap.set(c.time, c));
                 
                 const finalVisible = Array.from(visibleMap.values()).sort((a, b) => a.time - b.time);
                 let newIndex = 0;
                 if (finalVisible.length > 0) {
                     for (let i = finalVisible.length - 1; i >= 0; i--) {
                         if (finalVisible[i].time <= simTime) { newIndex = i; break; }
                     }
                 }
                 const activeCandle = finalVisible[newIndex];
                 if (activeCandle) {
                     const candleEndTime = activeCandle.time + tfSecs;
                     if (simTime < candleEndTime - 1) {
                         let open = activeCandle.open;
                         let close = lastKnownPriceRef.current || open;
                         let high = Math.max(open, close);
                         let low = Math.min(open, close);
                         finalVisible[newIndex] = { ...activeCandle, open, high, low, close };
                         setCurrentRealTimePrice(close);
                     } else { 
                         setCurrentRealTimePrice(activeCandle.close); 
                     }
                 }
                 warmupDataRef.current = finalWarmup;
                 setChartData(finalVisible);
                 setSimState(prev => ({ ...prev, currentIndex: newIndex, maxIndex: finalVisible.length }));
                 setTimeout(() => { if (!controller.signal.aborted) { chartRef.current?.fitContent(); isSwitchingTfRef.current = false; } }, 50);
             } else {
                 if (context.length === 0 && future.length === 0) {
                      const firstCandle = await fetchFirstCandle(activeSymbol, activeTimeframe, controller.signal);
                      if (firstCandle) {
                          const absoluteFuture = await fetchFutureCandles(activeSymbol, activeTimeframe, firstCandle.time - 1, VISIBLE_CANDLES, controller.signal);
                          if (absoluteFuture.length > 0) {
                              const f = absoluteFuture[0];
                              const fake = Array(MIN_WARMUP).fill(null).map((_, i) => ({ ...f, time: f.time - ((MIN_WARMUP - i) * tfSecs) }));
                              warmupDataRef.current = fake;
                              setChartData(absoluteFuture);
                              setSimState(prev => ({ ...prev, currentIndex: 0, maxIndex: absoluteFuture.length }));
                              setCurrentSimTime(absoluteFuture[0].time + tfSecs);
                              setTimeout(() => { if (!controller.signal.aborted) { chartRef.current?.fitContent(); isSwitchingTfRef.current = false; } }, 100);
                              setIsLoading(false);
                              return;
                          }
                      }
                 }
                 setChartData([]); setShowDataError(true);
             }
         } catch (e) { console.error(e); setChartData([]); setShowDataError(true); } finally { if (!controller.signal.aborted) setIsLoading(false); }
     };
     loadInitialData();
     return () => { controller.abort(); isSwitchingTfRef.current = false; };
  }, [activeSymbol, activeTimeframe, activeProfileId, dataVersion]); 

  // Stream Buffering
  useEffect(() => {
      if (!chartData.length || isLoadingFuture) return;
      const bufferThreshold = 50; 
      const remaining = chartData.length - 1 - simState.currentIndex;
      if (remaining < bufferThreshold) {
          const loadFuture = async () => {
              setIsLoadingFuture(true);
              const lastCandle = chartData[chartData.length - 1];
              const lastTime = lastCandle.time;
              const moreData = await fetchFutureCandles(activeSymbol, activeTimeframe, lastTime, 100);
              if (moreData.length > 0) {
                  setChartData(prev => {
                       if (prev.length === 0) return moreData;
                       const lastPrevTime = prev[prev.length - 1].time;
                       const newUnique = moreData.filter(c => c.time > lastPrevTime);
                       if (newUnique.length === 0) return prev;
                       return [...prev, ...newUnique];
                  });
              }
              setIsLoadingFuture(false);
          };
          loadFuture();
      }
  }, [simState.currentIndex, chartData, activeSymbol, activeTimeframe, isLoadingFuture]);

  useEffect(() => {
     setSimState(prev => {
         if (prev.maxIndex !== chartData.length) {
             return { ...prev, maxIndex: chartData.length };
         }
         return prev;
     });
  }, [chartData.length]);

  const handleLoadMoreHistory = useCallback(async () => {
      if (isLoadingHistory || chartData.length === 0) return;
      setIsLoadingHistory(true);
      const oldestTime = warmupDataRef.current.length > 0 ? warmupDataRef.current[0].time : chartData[0].time;
      const totalToFetch = 500 + WARMUP_BUFFER; 
      const rawData = await fetchHistoricalData(activeSymbol, activeTimeframe, oldestTime, totalToFetch); 
      if (rawData.length > 0) {
          if (rawData.length > WARMUP_BUFFER) {
              const newWarmup = rawData.slice(0, WARMUP_BUFFER);
              const newVisible = rawData.slice(WARMUP_BUFFER);
              const oldWarmup = warmupDataRef.current;
              warmupDataRef.current = newWarmup;
              setChartData(prev => [...newVisible, ...oldWarmup, ...prev]);
              setSimState(prev => ({ ...prev, currentIndex: prev.currentIndex + newVisible.length + oldWarmup.length, maxIndex: prev.maxIndex + newVisible.length + oldWarmup.length }));
          } else {
              const oldWarmup = warmupDataRef.current;
              const first = rawData[0];
              const tfSecs = TF_SECONDS[activeTimeframe] || 60;
              const fake = Array(MIN_WARMUP).fill(null).map((_, i) => ({ ...first, time: first.time - ((MIN_WARMUP - i) * tfSecs) }));
              warmupDataRef.current = fake;
              setChartData(prev => [...rawData, ...oldWarmup, ...prev]);
              setSimState(prev => ({ ...prev, currentIndex: prev.currentIndex + rawData.length + oldWarmup.length, maxIndex: prev.maxIndex + rawData.length + oldWarmup.length }));
          }
      }
      setIsLoadingHistory(false);
  }, [isLoadingHistory, chartData, activeSymbol, activeTimeframe]);

  // --- SYNC ENGINE ---
  useEffect(() => {
      if (chartData.length > 0 && chartData[simState.currentIndex]) {
          const chartCandle = chartData[simState.currentIndex];
          setCurrentRealTimePrice(chartCandle.close);
          if (!isSwitchingTfRef.current && !isLoading) {
              if (simState.isPlaying) {
                  const duration = TF_SECONDS[activeTimeframe] || 60;
                  setCurrentSimTime(chartCandle.time + duration);
              }
          }
      }
  }, [simState.currentIndex, chartData, activeTimeframe, simState.isPlaying, isLoading]);

  const handleStep = useCallback(() => {
      const candles = chartDataRef.current;
      const prevIndex = simState.currentIndex;
      const maxIndex = simState.maxIndex;

      if (!candles || prevIndex + 1 >= maxIndex) return;

      const nextIndex = prevIndex + 1;
      const nextCandle = candles[nextIndex];

      // 1. Advance Index
      setSimState(prev => ({ ...prev, currentIndex: nextIndex }));

      // 2. Explicitly Advance Time so switching TFs aligns correctly
      if (nextCandle) {
          const duration = TF_SECONDS[activeTimeframe] || 60;
          setCurrentSimTime(nextCandle.time + duration);
      }
  }, [simState.currentIndex, simState.maxIndex, activeTimeframe]);

  const resetSimulation = useCallback(() => {
      setSimState(prev => ({ ...prev, isPlaying: false }));
      setChartData([]);
      warmupDataRef.current = [];
      setShowDataError(false);
  }, []);

  return {
      chartData,
      setChartData,
      warmupDataRef,
      isLoading,
      setIsLoading,
      showDataError,
      setShowDataError,
      simState,
      setSimState,
      currentSimTime,
      setCurrentSimTime,
      currentSlice,
      tradingPrice,
      lastTime,
      currentDigits,
      handleSymbolChange,
      handleJumpToDate,
      handleJumpToFirstData,
      handleLoadMoreHistory,
      handleStep,
      resetSimulation
  };
}
