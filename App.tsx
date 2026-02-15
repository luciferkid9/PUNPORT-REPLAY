
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { INITIAL_BALANCE, SYMBOL_CONFIG, getContractSize, TF_SECONDS, DEFAULT_LEVERAGE, STOP_OUT_LEVEL } from './constants';
import { AccountState, SimulationState, OrderSide, OrderType, Trade, OrderStatus, ToolType, DrawingObject, IndicatorConfig, IndicatorType, DrawingSettings, SymbolType, TimeframeType, Candle, TraderProfile, TradeJournal, KillZoneConfig, DragTradeUpdate } from './types';
import { ChartContainer, ChartRef } from './components/ChartContainer';
import { AccountDashboard } from './components/AccountDashboard';
import { OrderPanel } from './components/OrderPanel';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { DrawingManager } from './components/DrawingManager';
import { DrawingSettingsModal } from './components/DrawingSettingsModal';
import { ChallengeSetupModal } from './components/ChallengeSetupModal';
import { DetailedStats } from './components/DetailedStats';
import { MarketStructureWidget } from './components/MarketStructureWidget';
import { IndicatorSettingsModal } from './components/IndicatorSettingsModal';
import { calculateSMA, calculateEMA, calculateRSI, calculateMACD, calculateRequiredMargin, calculatePnLInUSD, resampleCandles } from './services/logicEngine';
import { fetchCandles, parseCSV, fetchHistoricalData, fetchContextCandles, fetchFutureCandles, fetchFirstCandle } from './services/api';

const STORAGE_KEY = 'protrade_profiles_v2'; 

// CONSTANTS FOR DATA BUFFERING
const VISIBLE_CANDLES = 1000;
const WARMUP_BUFFER = 500; 
const MIN_WARMUP = 200;

const DEFAULT_KILLZONE_CONFIG: KillZoneConfig = {
    asian: { enabled: true, label: 'Asian', color: '#e91e63', start: '06:00', end: '11:00' }, 
    london: { enabled: true, label: 'London', color: '#00bcd4', start: '14:00', end: '17:00' },
    ny: { enabled: true, label: 'New York', color: '#ff5d00', start: '19:00', end: '04:00' },
    showHighLowLines: false,
    showAverage: false,     
    extend: false,
    showLabel: true,        
    opacity: 0.15           
};

const App: React.FC = () => {
  // --- STATE ---
  const [profiles, setProfiles] = useState<TraderProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState<TraderProfile | null>(null);

  const [activeSymbol, setActiveSymbol] = useState<SymbolType>('EURUSD');
  const [activeTimeframe, setActiveTimeframe] = useState<TimeframeType>('H1');
  
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

  const [account, setAccount] = useState<AccountState>({ balance: INITIAL_BALANCE, equity: INITIAL_BALANCE, maxEquity: INITIAL_BALANCE, maxDrawdown: 0, history: [] });
  const [showStats, setShowStats] = useState<boolean>(false);
  const [allDrawings, setAllDrawings] = useState<DrawingObject[]>([]);
  const [currentRealTimePrice, setCurrentRealTimePrice] = useState<number>(0);
  const [dataVersion, setDataVersion] = useState(0);

  // Dragging State for Trade Lines
  const [activeDragTrade, setActiveDragTrade] = useState<DragTradeUpdate | null>(null);

  const chartRef = useRef<ChartRef>(null);
  const [activeTool, setActiveTool] = useState<ToolType>('CURSOR');
  const [magnetMode, setMagnetMode] = useState<boolean>(false);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [editingDrawingId, setEditingDrawingId] = useState<string | null>(null);
  const [showMarketStructure, setShowMarketStructure] = useState<boolean>(false);
  const [showDrawingManager, setShowDrawingManager] = useState<boolean>(false);
  const [drawingSettings, setDrawingSettings] = useState<DrawingSettings>({ 
      color: '#3b82f6', 
      lineWidth: 2, 
      lineStyle: 'solid' 
  });

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

  const currentDrawings = useMemo(() => {
      return allDrawings.filter(d => d.symbol === activeSymbol);
  }, [allDrawings, activeSymbol]);

  // Check if Kill Zone exists
  const hasKillZone = useMemo(() => {
      return currentDrawings.some(d => d.type === 'KILLZONE');
  }, [currentDrawings]);

  // 1. INIT & PERSISTENCE
  const isLoadedRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { 
        try { 
            setProfiles(JSON.parse(saved)); 
        } catch(e) {
            console.error("Failed to parse profiles", e);
        } 
    }
    isLoadedRef.current = true;
    setIsLoading(false);
  }, []);

  useEffect(() => { 
      if (isLoadedRef.current) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles)); 
      }
  }, [profiles]);

  useEffect(() => {
    if (activeProfileId) {
        setProfiles(prev => prev.map(p => {
            if (p.id === activeProfileId) {
                return {
                    ...p, lastPlayed: Date.now(), account, activeSymbol, activeTimeframe,
                    currentSimTime: currentSimTime > 0 ? currentSimTime : p.currentSimTime, drawings: allDrawings
                };
            }
            return p;
        }));
    }
  }, [account, activeSymbol, activeTimeframe, currentSimTime, activeProfileId, allDrawings]);

  useEffect(() => {
      let interval: number;
      if (activeProfileId) {
          interval = window.setInterval(() => {
              setProfiles(prev => prev.map(p => {
                  if (p.id === activeProfileId) {
                      return { ...p, timePlayed: (p.timePlayed || 0) + 1 };
                  }
                  return p;
              }));
              setActiveProfile(prev => prev ? { ...prev, timePlayed: (prev.timePlayed || 0) + 1 } : null);
          }, 1000);
      }
      return () => clearInterval(interval);
  }, [activeProfileId]);

  // ... (Rest of Handlers) ...
  const handleCreateProfile = (name: string, balance: number, symbols: SymbolType[], startDate: number, endDate: number, timeframe: TimeframeType = 'H1', customDigits?: number) => {
      const newProfile: TraderProfile = {
          id: Math.random().toString(36).substr(2, 9), name, createdAt: Date.now(), lastPlayed: Date.now(),
          timePlayed: 0,
          account: { balance, equity: balance, maxEquity: balance, maxDrawdown: 0, history: [] },
          activeSymbol: symbols[0], activeTimeframe: timeframe, currentSimTime: startDate,
          selectedSymbols: symbols, startDate, endDate, drawings: [],
          customDigits
      };
      setProfiles(prev => [...prev, newProfile]);
      handleSelectProfile(newProfile);
  };

  const handleSelectProfile = (profile: TraderProfile) => {
      setAccount(profile.account); setActiveSymbol(profile.activeSymbol); setActiveTimeframe(profile.activeTimeframe);
      setCurrentSimTime(profile.currentSimTime); setActiveProfileId(profile.id); setActiveProfile(profile);
      setAllDrawings(profile.drawings || []); setChartData([]);
      warmupDataRef.current = [];
      setShowDataError(false);
      setIsLoading(true); 
  };

  const handleSymbolChange = (newSymbol: SymbolType) => {
      setActiveSymbol(newSymbol); setChartData([]);
      warmupDataRef.current = [];
      setShowDataError(false);
      setSimState(prev => ({ ...prev, isPlaying: false }));
  };

  const handleDeleteProfile = (id: string) => {
      setProfiles(prev => prev.filter(p => p.id !== id));
      if (activeProfileId === id) { setActiveProfileId(null); setActiveProfile(null); }
  };

  const handleExitProfile = () => {
      setSimState(prev => ({ ...prev, isPlaying: false })); setActiveProfileId(null); setActiveProfile(null);
      setAccount({ balance: INITIAL_BALANCE, equity: INITIAL_BALANCE, maxEquity: INITIAL_BALANCE, maxDrawdown: 0, history: [] });
      setChartData([]); setAllDrawings([]); setShowDataError(false); warmupDataRef.current = [];
  };

  const tick = useCallback(() => {
      setSimState(prev => {
          const nextIndex = prev.currentIndex + 1;
          if (nextIndex >= prev.maxIndex) {
              return { ...prev, isPlaying: false };
          }
          return { ...prev, currentIndex: nextIndex };
      });
  }, []);

  const handleJumpToDate = (dateStr: string) => {
      const target = new Date(dateStr).getTime() / 1000;
      if (!isNaN(target)) {
          setSimState(prev => ({ ...prev, isPlaying: false }));
          setCurrentSimTime(target);
          setDataVersion(v => v + 1);
      }
  };

  const handleJumpToFirstData = async () => {
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
  };

  useEffect(() => {
      let interval: number;
      if (simState.isPlaying) {
          interval = window.setInterval(tick, simState.speed);
      }
      return () => clearInterval(interval);
  }, [simState.isPlaying, simState.speed, tick]);

  const getDynamicPrecision = () => {
      if (activeProfile?.customDigits) return activeProfile.customDigits;
      if (SYMBOL_CONFIG[activeSymbol]) return SYMBOL_CONFIG[activeSymbol].digits;
      if (chartData.length > 0) {
          const sample = chartData[chartData.length-1].close;
          if (sample > 500) return 2; 
          if (sample > 20) return 3;  
          return 5;
      }
      return 5;
  };
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
                         try {
                             const granularData = await fetchContextCandles(activeSymbol, 'M2', simTime + 1, 300, controller.signal); 
                             const relevant = granularData.filter(c => c.time >= activeCandle.time && c.time <= simTime);
                             if (relevant.length > 0) {
                                 let open = relevant[0].open;
                                 let close = relevant[relevant.length - 1].close;
                                 let high = -Infinity;
                                 let low = Infinity;
                                 let volume = 0;
                                 relevant.forEach(c => {
                                     if (c.high > high) high = c.high;
                                     if (c.low < low) low = c.low;
                                     volume += c.volume || 0;
                                 });
                                 finalVisible[newIndex] = { time: activeCandle.time, open, high, low, close, volume };
                                 setCurrentRealTimePrice(close);
                             } else { setCurrentRealTimePrice(activeCandle.close); }
                         } catch (err) { setCurrentRealTimePrice(activeCandle.close); }
                     } else { setCurrentRealTimePrice(activeCandle.close); }
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

  const handleLoadMoreHistory = async () => {
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
  };

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

  const handleStep = () => {
      setSimState(prev => {
          const nextIndex = prev.currentIndex + 1;
          if (nextIndex >= prev.maxIndex) return prev;
          const candles = chartDataRef.current;
          if (candles && candles[nextIndex]) {
              const duration = TF_SECONDS[activeTimeframe] || 60;
              setCurrentSimTime(candles[nextIndex].time + duration);
          }
          return { ...prev, currentIndex: nextIndex };
      });
  };

  // ... (Indicators) ...
  const [indicatorConfigs, setIndicatorConfigs] = useState<IndicatorConfig[]>([
      { id: 'default-macd', type: 'MACD', visible: true, fastLength: 12, slowLength: 26, signalLength: 9, color: '#2962ff', signalColor: '#f57c00', histogramColor: undefined },
      { id: 'default-rsi', type: 'RSI', visible: true, period: 14, upperLevel: 70, lowerLevel: 30, color: '#7e57c2' }, // Visible by default
      { id: 'default-ema', type: 'EMA', visible: false, period: 14, color: '#2962ff' } // Changed SMA to EMA
  ]);
  const [editingIndicator, setEditingIndicator] = useState<IndicatorConfig | null>(null);
  
  // EMA Data Map for multiple lines
  const [emaDataMap, setEmaDataMap] = useState<Map<string, { time: number; value: number }[]>>(new Map());
  
  const [rsiData, setRsiData] = useState<{ time: number; value: number }[]>([]);
  const [macdData, setMacdData] = useState<{ macd: any[], signal: any[], histogram: any[] }>({ macd: [], signal: [], histogram: [] });
  const [showIndicatorMenu, setShowIndicatorMenu] = useState<boolean>(false);
  const indicatorMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (indicatorMenuRef.current && !indicatorMenuRef.current.contains(event.target as Node)) {
              setShowIndicatorMenu(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
      if (chartData.length === 0) return;
      const rawFull = [...warmupDataRef.current, ...chartData];
      const fullSeries = rawFull.filter((v, i, a) => i === 0 || v.time > a[i - 1].time);
      const visibleStartTime = chartData[0].time;

      // Calculate Data for ALL visible EMAs
      const newEmaMap = new Map<string, { time: number; value: number }[]>();
      indicatorConfigs.filter(c => c.type === 'EMA' && c.visible).forEach(config => {
          const rawEma = calculateEMA(fullSeries, config.period || 14);
          newEmaMap.set(config.id, rawEma.filter(d => d.time >= visibleStartTime));
      });
      setEmaDataMap(newEmaMap);

      const rsiConfig = indicatorConfigs.find(c => c.type === 'RSI');
      if (rsiConfig?.visible) {
          const rawRsi = calculateRSI(fullSeries, rsiConfig.period || 14);
          setRsiData(rawRsi.filter(d => d.time >= visibleStartTime));
      }
      const macdConfig = indicatorConfigs.find(c => c.type === 'MACD');
      if (macdConfig?.visible) {
          const rawMacd = calculateMACD(fullSeries, macdConfig.fastLength || 12, macdConfig.slowLength || 26, macdConfig.signalLength || 9);
          setMacdData({
              macd: rawMacd.macd.filter(d => d.time >= visibleStartTime),
              signal: rawMacd.signal.filter(d => d.time >= visibleStartTime),
              histogram: rawMacd.histogram.filter(d => d.time >= visibleStartTime)
          });
      }
  }, [chartData, indicatorConfigs]);

  // FILTER EMA MAP BASED ON REPLAY TIME
  const slicedEmaMap = useMemo(() => {
      if (emaDataMap.size === 0) return undefined;
      const sliced = new Map<string, { time: number; value: number }[]>();
      emaDataMap.forEach((points, id) => {
          sliced.set(id, points.filter(p => p.time <= lastTime));
      });
      return sliced;
  }, [emaDataMap, lastTime]);

  // ... (Drawing Handlers) ...
  const toggleIndicator = (id: string) => {
      setIndicatorConfigs(prev => prev.map(c => c.id === id ? { ...c, visible: !c.visible } : c));
  };
  const handleRemoveIndicator = (id: string) => {
      setIndicatorConfigs(prev => prev.filter(c => c.id !== id));
  };
  const handleIndicatorUpdate = (newConfig: IndicatorConfig) => {
      setIndicatorConfigs(prev => prev.map(c => c.id === newConfig.id ? newConfig : c));
  };
  const handleAddIndicator = (type: IndicatorType) => {
      const newId = `custom-${type}-${Math.random().toString(36).substr(2, 5)}`;
      const baseConfig: Partial<IndicatorConfig> = {
          id: newId,
          type,
          visible: true
      };
      
      if (type === 'EMA') {
          baseConfig.period = 14;
          baseConfig.color = '#ff9800'; // Different color for new ones
      } else if (type === 'RSI') {
          baseConfig.period = 14;
          baseConfig.upperLevel = 70;
          baseConfig.lowerLevel = 30;
          baseConfig.color = '#e91e63';
      } else if (type === 'MACD') {
          baseConfig.fastLength = 12;
          baseConfig.slowLength = 26;
          baseConfig.signalLength = 9;
          baseConfig.color = '#00bcd4';
          baseConfig.signalColor = '#ff5722';
      }
      
      setIndicatorConfigs(prev => [...prev, baseConfig as IndicatorConfig]);
  };

  const handleAddAutoKillZone = () => {
      const exists = allDrawings.some(d => d.type === 'KILLZONE' && d.symbol === activeSymbol);
      if (exists) {
          const kz = allDrawings.find(d => d.type === 'KILLZONE' && d.symbol === activeSymbol);
          if (kz) setSelectedDrawingId(kz.id);
          return;
      }
      const newKZ: DrawingObject = {
          id: Math.random().toString(36).substr(2, 9),
          symbol: activeSymbol,
          type: 'KILLZONE',
          p1: { time: currentSimTime, price: tradingPrice },
          p2: { time: currentSimTime, price: tradingPrice },
          visible: true,
          locked: false,
          color: '#ffffff',
          lineWidth: 1,
          lineStyle: 'solid',
          killZoneConfig: { ...DEFAULT_KILLZONE_CONFIG }
      };
      setAllDrawings(prev => [...prev, newKZ]);
      setSelectedDrawingId(newKZ.id);
  };

  const handleDrawingCreate = (d: DrawingObject) => {
      const symbolDrawing = { ...d, symbol: activeSymbol };
      const isPosition = d.type === 'LONG_POSITION' || d.type === 'SHORT_POSITION';
      if (d.type === 'FIB') {
        symbolDrawing.fibLevels = [
            { level: 0, color: '#94a3b8', visible: true },
            { level: 0.236, color: '#ef4444', visible: false }, // HIDE DEFAULT
            { level: 0.382, color: '#ef4444', visible: true },
            { level: 0.5, color: '#22c55e', visible: true },
            { level: 0.618, color: '#eab308', visible: true },
            { level: 0.786, color: '#3b82f6', visible: true },
            { level: 1, color: '#a1a1aa', visible: true },
            { level: 1.272, color: '#f87171', visible: true },
            { level: 1.618, color: '#a855f7', visible: true }, // SHOW DEFAULT
        ];
      } else if (isPosition) {
        const isLong = d.type === 'LONG_POSITION';
        const entryPrice = d.p1.price;
        const diff = Math.abs(d.p2.price - entryPrice);
        const minThreshold = entryPrice * 0.0001; 
        const priceOffset = diff > minThreshold ? diff : entryPrice * 0.01;
        if (!d.targetPrice) symbolDrawing.targetPrice = isLong ? entryPrice + priceOffset : entryPrice - priceOffset;
        if (!d.stopPrice) {
            const slOffset = priceOffset * 0.5;
            symbolDrawing.stopPrice = isLong ? entryPrice - slOffset : entryPrice + slOffset;
        }
        const timeDiff = Math.abs(d.p2.time - d.p1.time);
        if (timeDiff === 0) {
            const barInterval = chartData.length > 1 ? chartData[1].time - chartData[0].time : 3600;
            symbolDrawing.p2.time = d.p1.time + (barInterval * 20);
        }
      } else if (d.type === 'TEXT') {
          symbolDrawing.text = "Text";
          symbolDrawing.fontSize = 14;
          symbolDrawing.color = '#ffffff'; 
      }
      setAllDrawings(prev => [...prev, symbolDrawing]); setSelectedDrawingId(d.id); setActiveTool('CURSOR'); 
  };
  const handleDrawingUpdate = (updated: DrawingObject) => setAllDrawings(prev => prev.map(d => d.id === updated.id ? updated : d));
  const handleDrawingDelete = (id: string) => setAllDrawings(prev => prev.filter(d => d.id !== id));

  const handleModifyTrade = (tradeId: string, newSl: number, newTp: number) => {
      setAccount(prev => ({ ...prev, history: prev.history.map(t => t.id === tradeId ? { ...t, stopLoss: newSl, takeProfit: newTp } : t) }));
  };
  const handleModifyOrderEntry = (tradeId: string, newEntryPrice: number) => {
      setAccount(prev => ({ ...prev, history: prev.history.map(t => t.id === tradeId && t.status === OrderStatus.PENDING ? { ...t, entryPrice: newEntryPrice } : t) }));
  };
  const handleUpdateTrade = (tradeId: string, journal: TradeJournal) => {
      setAccount(prev => ({ ...prev, history: prev.history.map(t => t.id === tradeId ? { ...t, journal } : t) }));
  };
  const handleCloseOrder = (tradeId: string, exitPrice?: number) => {
      setAccount(prevAcc => {
          let realizedPnL = 0;
          let oldFloatingPnL = 0;
          const updatedHistory = prevAcc.history.map(trade => {
              if (trade.id === tradeId && (trade.status === OrderStatus.OPEN || trade.status === OrderStatus.PENDING)) {
                  if (trade.status === OrderStatus.PENDING) return { ...trade, status: OrderStatus.CLOSED, pnl: 0 };
                  oldFloatingPnL = trade.pnl || 0;
                  const finalPrice = exitPrice !== undefined ? exitPrice : (trade.symbol === activeSymbol ? tradingPrice : trade.entryPrice); 
                  const multiplier = trade.side === OrderSide.LONG ? 1 : -1;
                  const contractSize = getContractSize(trade.symbol);
                  const rawPnL = (finalPrice - trade.entryPrice) * trade.quantity * contractSize * multiplier;
                  realizedPnL = calculatePnLInUSD(trade.symbol, rawPnL, finalPrice);
                  return { ...trade, status: OrderStatus.CLOSED, closePrice: finalPrice, closeTime: currentSimTime, pnl: realizedPnL };
              }
              return trade;
          });
          const newBalance = prevAcc.balance + realizedPnL;
          const newEquity = prevAcc.equity - oldFloatingPnL + realizedPnL;
          return { ...prevAcc, history: updatedHistory, balance: newBalance, equity: newEquity };
      });
  };
  const handlePlaceOrder = (side: OrderSide, type: OrderType, entry: number, sl: number, tp: number, quantity: number) => {
      if (account.equity <= 0) { alert("ไม่สามารถเปิดออเดอร์ได้: พอร์ตแตกแล้ว (Equity = 0)\nกรุณารีเซ็ตโปรไฟล์ใหม่ หรือเติมเงิน"); return; }
      const isMarket = type === OrderType.MARKET;
      const executionPrice = isMarket ? tradingPrice : entry;
      if (executionPrice <= 0) { alert(`ไม่สามารถส่งคำสั่งได้: ราคาตลาดไม่ถูกต้อง`); return; }
      const requiredMargin = calculateRequiredMargin(activeSymbol, quantity, executionPrice);
      let currentUsedMargin = 0;
      account.history.forEach(t => { if (t.status === OrderStatus.OPEN) currentUsedMargin += calculateRequiredMargin(t.symbol, t.quantity, t.entryPrice); });
      const freeMargin = account.equity - currentUsedMargin;
      if (requiredMargin > freeMargin) { alert(`Margin ไม่เพียงพอ (Insufficient Margin)!`); return; }
      const newTrade: Trade = {
          id: Math.random().toString(36).substr(2, 9),
          symbol: activeSymbol, side, type, entryPrice: executionPrice, initialStopLoss: sl,
          entryTime: isMarket ? currentSimTime : undefined, orderTime: currentSimTime, stopLoss: sl, takeProfit: tp, quantity, status: isMarket ? OrderStatus.OPEN : OrderStatus.PENDING, pnl: 0
      };
      setAccount(prev => ({ ...prev, history: [...prev.history, newTrade] }));
  };

  useEffect(() => {
      if (chartData.length === 0 || !tradingPrice || account.history.length === 0) return;
      let floatingPnL = 0;
      let usedMargin = 0;
      const updatedHistory = account.history.map(t => {
          if (t.status === OrderStatus.OPEN) {
               usedMargin += calculateRequiredMargin(t.symbol, t.quantity, t.entryPrice);
               if (t.symbol === activeSymbol) {
                   const contractSize = getContractSize(t.symbol);
                   const mult = t.side === OrderSide.LONG ? 1 : -1;
                   const rawPnL = (tradingPrice - t.entryPrice) * t.quantity * contractSize * mult;
                   const pnlUSD = calculatePnLInUSD(t.symbol, rawPnL, tradingPrice);
                   return { ...t, pnl: pnlUSD }; 
               }
               return t;
          }
          return t;
      });
      updatedHistory.forEach(t => { if (t.status === OrderStatus.OPEN) floatingPnL += (t.pnl || 0); });
      const currentEquity = account.balance + floatingPnL;
      const marginLevel = usedMargin > 0 ? (currentEquity / usedMargin) * 100 : 999999;
      if (currentEquity <= 0 || marginLevel <= STOP_OUT_LEVEL) {
          console.warn(`STOP OUT TRIGGERED: Equity=${currentEquity}, MarginLevel=${marginLevel}`);
          const stopOutHistory = updatedHistory.map(t => {
              if (t.status === OrderStatus.OPEN) {
                   const closeP = t.symbol === activeSymbol ? tradingPrice : t.entryPrice; 
                   return { ...t, status: OrderStatus.CLOSED, closePrice: closeP, closeTime: currentSimTime, pnl: t.pnl };
              }
              return t;
          });
          setAccount(prev => ({ ...prev, history: stopOutHistory, equity: currentEquity <= 0 ? 0 : currentEquity, balance: currentEquity <= 0 ? 0 : currentEquity, maxDrawdown: Math.max(prev.maxDrawdown, prev.maxEquity - 0) }));
          setSimState(prev => ({ ...prev, isPlaying: false }));
          alert(`⚠️ พอร์ตแตก! \n\nEquity: $${currentEquity.toFixed(2)} \nMargin Level: ${marginLevel.toFixed(2)}% \n\nระบบบังคับปิดออเดอร์ทั้งหมด (Force Close All)`);
          return; 
      }
      setAccount(prev => ({ ...prev, history: updatedHistory, equity: currentEquity, maxEquity: Math.max(prev.maxEquity, currentEquity), maxDrawdown: Math.max(prev.maxDrawdown, prev.maxEquity - currentEquity) }));
      const currentCandle = currentSlice.length > 0 ? currentSlice[currentSlice.length - 1] : null;
      if (currentCandle) {
          updatedHistory.filter(t => t.status === OrderStatus.OPEN).forEach(trade => {
             if (trade.symbol === activeSymbol) {
                 const hitHigh = currentCandle.high;
                 const hitLow = currentCandle.low;
                 if (trade.side === OrderSide.LONG) {
                     if (trade.stopLoss > 0 && hitLow <= trade.stopLoss) handleCloseOrder(trade.id, trade.stopLoss);
                     else if (trade.takeProfit > 0 && hitHigh >= trade.takeProfit) handleCloseOrder(trade.id, trade.takeProfit);
                 } else {
                     if (trade.stopLoss > 0 && hitHigh >= trade.stopLoss) handleCloseOrder(trade.id, trade.stopLoss);
                     else if (trade.takeProfit > 0 && hitLow <= trade.takeProfit) handleCloseOrder(trade.id, trade.takeProfit);
                 }
             }
          });
          updatedHistory.filter(t => t.status === OrderStatus.PENDING).forEach(trade => {
              if (trade.symbol === activeSymbol) {
                  const hitHigh = currentCandle.high >= trade.entryPrice;
                  const hitLow = currentCandle.low <= trade.entryPrice;
                  let triggered = false;
                  if (trade.side === OrderSide.LONG) {
                      if (trade.type === OrderType.LIMIT && hitLow) triggered = true;
                      if (trade.type === OrderType.STOP && hitHigh) triggered = true;
                  } else {
                      if (trade.type === OrderType.LIMIT && hitHigh) triggered = true;
                      if (trade.type === OrderType.STOP && hitLow) triggered = true;
                  }
                  if (triggered) {
                     setAccount(prev => ({ ...prev, history: prev.history.map(t => t.id === trade.id ? { ...t, status: OrderStatus.OPEN, entryTime: currentCandle.time } : t) }));
                  }
              }
          });
      }
  }, [tradingPrice, activeSymbol, simState.currentIndex]); 

  if (!activeProfileId || !activeProfile) {
      return (
        <ChallengeSetupModal profiles={profiles} onStart={handleSelectProfile} onCreate={handleCreateProfile} onDelete={handleDeleteProfile} />
      );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[#09090b] text-zinc-200 overflow-hidden">
      <AccountDashboard 
        account={account} currentPrice={tradingPrice} currentDate={currentSimTime} activeSymbol={activeSymbol} activeTimeframe={activeTimeframe} simState={simState} availableSymbols={activeProfile.selectedSymbols || []}
        pricePrecision={currentDigits}
        onSymbolChange={handleSymbolChange} onTimeframeChange={setActiveTimeframe} onPlayPause={() => setSimState(s => ({...s, isPlaying: !s.isPlaying}))} onNext={tick} onSpeedChange={(v) => setSimState(s => ({...s, speed: v}))} onJumpToDate={handleJumpToDate} onToggleStats={() => setShowStats(true)} onExit={handleExitProfile}
      />
      
      {isLoading && <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"><div className="flex flex-col items-center"><div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div><div className="text-blue-400 font-bold animate-pulse">Processing Data...</div></div></div>}
      
      {showDataError && !isLoading && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
              <div className="glass-panel p-8 rounded-2xl shadow-2xl max-w-md text-center">
                  <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                      <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">No Data Found</h3>
                  <p className="text-zinc-400 mb-6 text-sm leading-relaxed">ไม่พบข้อมูลในช่วงเวลาที่เลือก ระบบจะทำการค้นหาข้อมูลที่ใกล้เคียงที่สุด</p>
                  <div className="space-y-3">
                      <button onClick={handleJumpToFirstData} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-900/30 transition-all active:scale-[0.98] flex items-center justify-center space-x-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" /></svg>
                          <span>Jump to First Available Data</span>
                      </button>
                      <button onClick={() => setShowDataError(false)} className="text-zinc-500 hover:text-zinc-300 text-xs font-bold uppercase tracking-wider">Dismiss</button>
                  </div>
              </div>
          </div>
      )}

      {showStats && <DetailedStats account={account} sessionStart={activeProfile.startDate} currentSimTime={currentSimTime} timePlayed={activeProfile.timePlayed || 0} activeTimeframe={activeTimeframe} onClose={() => setShowStats(false)} onUpdateTrade={handleUpdateTrade} />}
      {editingIndicator && <IndicatorSettingsModal config={editingIndicator} onSave={handleIndicatorUpdate} onClose={() => setEditingIndicator(null)} />}

      <div className="flex flex-1 overflow-hidden relative p-3 gap-3">
        {/* FLOATING TOOLBAR */}
        <div className="glass-bubble w-14 rounded-2xl flex flex-col items-center py-4 space-y-3 z-20">
             <div className="space-y-2 w-full flex flex-col items-center">
                <button 
                    onClick={() => { setActiveTool('CURSOR'); setSelectedDrawingId(null); }} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${activeTool === 'CURSOR' ? 'bg-blue-500/20 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)] ring-1 ring-blue-500/50' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'}`} 
                    title="Cursor"
                >
                    <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" /></svg>
                </button>
                <button 
                    onClick={() => { setActiveTool('TRENDLINE'); setSelectedDrawingId(null); }} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${activeTool === 'TRENDLINE' ? 'bg-blue-500/20 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)] ring-1 ring-blue-500/50' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'}`} 
                    title="Trendline"
                >
                    <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                </button>
                <button 
                    onClick={() => { setActiveTool('TEXT'); setSelectedDrawingId(null); }} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${activeTool === 'TEXT' ? 'bg-blue-500/20 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)] ring-1 ring-blue-500/50' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'}`} 
                    title="Text Box"
                >
                    <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4h12M12 4v16" /></svg>
                </button>
                <button 
                    onClick={handleAddAutoKillZone} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${hasKillZone ? 'bg-blue-500/20 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)] ring-1 ring-blue-500/50' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'}`} 
                    title="Add Kill Zone (Auto)"
                >
                    <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16v16H4V4z" /></svg>
                </button>
                <button 
                    onClick={() => { setActiveTool('FIB'); setSelectedDrawingId(null); }} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${activeTool === 'FIB' ? 'bg-blue-500/20 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)] ring-1 ring-blue-500/50' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'}`} 
                    title="Fibonacci"
                >
                    <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
             </div>

             <div className="w-8 h-[1px] bg-white/10"></div>

             <div className="space-y-2 w-full flex flex-col items-center">
                 <button 
                    onClick={() => { setActiveTool('LONG_POSITION'); setSelectedDrawingId(null); }} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${activeTool === 'LONG_POSITION' ? 'bg-green-500/20 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.3)] ring-1 ring-green-500/50' : 'text-zinc-500 hover:text-green-400 hover:bg-white/5'}`} 
                    title="Long Position"
                 >
                    <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 11l3-3m0 0l3 3m-3-3v8m0-13a9 9 0 110 18 9 9 0 010-18z" /></svg>
                </button>
                <button 
                    onClick={() => { setActiveTool('SHORT_POSITION'); setSelectedDrawingId(null); }} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${activeTool === 'SHORT_POSITION' ? 'bg-red-500/20 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)] ring-1 ring-red-500/50' : 'text-zinc-500 hover:text-red-400 hover:bg-white/5'}`} 
                    title="Short Position"
                >
                    <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13l-3 3m0 0l-3-3m3 3V8m0 13a9 9 0 110-18 9 9 0 010 18z" /></svg>
                </button>
             </div>
             
             <div className="w-8 h-[1px] bg-white/10"></div>

             <div className="space-y-2 w-full flex flex-col items-center relative" ref={indicatorMenuRef}>
                <button 
                    onClick={() => setShowIndicatorMenu(!showIndicatorMenu)} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${showIndicatorMenu ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/50' : 'text-zinc-500 hover:text-purple-300 hover:bg-white/5'}`} 
                    title="Indicators"
                >
                    <span className="font-serif italic font-bold text-lg transition-transform group-hover:scale-110">fx</span>
                </button>
                {showIndicatorMenu && (
                    <div className="absolute left-14 top-0 glass-panel rounded-xl shadow-2xl p-2 z-50 w-36 space-y-1 animate-in fade-in slide-in-from-left-2 duration-200">
                        <div className="text-[10px] text-zinc-500 font-bold uppercase mb-1 px-2 py-1 tracking-wider">Indicators</div>
                        {/* List existing indicators */}
                        {indicatorConfigs.map(c => (
                            <button 
                                key={c.id} 
                                onClick={() => toggleIndicator(c.id)} 
                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold flex justify-between items-center transition-all ${c.visible ? 'bg-purple-500/20 text-purple-300' : 'hover:bg-white/5 text-zinc-300'}`}
                            >
                                <span className="truncate pr-2">{c.type} {c.type === 'EMA' ? c.period : ''}</span>
                                {c.visible && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_5px_rgba(192,132,252,0.8)] shrink-0"></span>}
                            </button>
                        ))}
                        <div className="h-[1px] bg-white/10 my-1"></div>
                        <button onClick={() => handleAddIndicator('EMA')} className="w-full text-left px-3 py-2 rounded-lg text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2">
                            <span>+ Add EMA</span>
                        </button>
                    </div>
                )}
             </div>

             <div className="mt-auto space-y-2 w-full flex flex-col items-center pt-2">
                 <button 
                    onClick={() => setShowMarketStructure(!showMarketStructure)} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${showMarketStructure ? 'bg-white/10 text-white ring-1 ring-white/20' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`} 
                    title="Market Structure"
                 >
                     <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                 </button>

                 <button 
                    onClick={() => setMagnetMode(!magnetMode)} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${magnetMode ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'text-zinc-500 hover:text-amber-300 hover:bg-white/5'}`} 
                    title="Magnet Mode"
                 >
                     <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /></svg>
                 </button>
                 <button 
                    onClick={() => setShowDrawingManager(!showDrawingManager)} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${showDrawingManager ? 'bg-white/10 text-white ring-1 ring-white/20' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`} 
                    title="Layers"
                 >
                     <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                 </button>
             </div>

             {showDrawingManager && <DrawingManager drawings={currentDrawings} indicatorConfigs={indicatorConfigs} settings={drawingSettings} selectedId={selectedDrawingId} onUpdateSettings={setDrawingSettings} onSelect={setSelectedDrawingId} onToggleVisible={(id) => handleDrawingUpdate({...allDrawings.find(d => d.id === id)!, visible: !allDrawings.find(d => d.id === id)!.visible})} onToggleLock={(id) => handleDrawingUpdate({...allDrawings.find(d => d.id === id)!, locked: !allDrawings.find(d => d.id === id)!.locked})} onDelete={handleDrawingDelete} onEdit={(id) => setEditingDrawingId(id)} onToggleIndicator={(id) => toggleIndicator(id)} onEditIndicator={setEditingIndicator} onClose={() => setShowDrawingManager(false)} />}
        </div>
        
        <div className="flex-1 flex flex-col min-w-0 relative gap-3">
            <div className="flex-1 relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/5">
                <ChartContainer 
                    key={activeSymbol} 
                    activeSymbol={activeSymbol}
                    interval={TF_SECONDS[activeTimeframe]} // Pass interval to chart
                    ref={chartRef} 
                    data={currentSlice} 
                    emaDataMap={slicedEmaMap} // PASS SLICED MAP HERE
                    rsiData={rsiData.filter(d => d.time <= lastTime)} macdData={{ macd: macdData.macd.filter(d => d.time <= lastTime), signal: macdData.signal.filter(d => d.time <= lastTime), histogram: macdData.histogram.filter(d => d.time <= lastTime) }} 
                    trades={account.history.filter(t => t.symbol === activeSymbol)} 
                    onModifyTrade={handleModifyTrade}
                    onModifyOrderEntry={handleModifyOrderEntry}
                    onTradeDrag={setActiveDragTrade} // Pass dragging callback
                    activeTool={activeTool} magnetMode={magnetMode} drawingSettings={drawingSettings} indicatorConfigs={indicatorConfigs} 
                    onDrawingCreate={handleDrawingCreate} onDrawingUpdate={handleDrawingUpdate} onDrawingEdit={(d) => setEditingDrawingId(d.id)} onDrawingSelect={setSelectedDrawingId} onDrawingDelete={handleDrawingDelete} 
                    onLoadMore={handleLoadMoreHistory} onIndicatorDblClick={setEditingIndicator}
                    onRemoveIndicator={handleRemoveIndicator} // Pass remove handler
                    drawings={currentDrawings} selectedDrawingId={selectedDrawingId} 
                    pricePrecision={currentDigits} 
                />
                
                {/* MARKET STRUCTURE WIDGET */}
                <MarketStructureWidget 
                    symbol={activeSymbol} 
                    currentSimTime={currentSimTime} 
                    isVisible={showMarketStructure} 
                    onClose={() => setShowMarketStructure(false)}
                />

            </div>
            
            {/* ControlBar Removed to maximize vertical space */}
        </div>
        
        {/* RIGHT PANEL - Floating Bubble Style */}
        <div className="glass-bubble w-80 rounded-2xl flex flex-col shadow-2xl overflow-hidden ring-1 ring-white/5">
            <OrderPanel activeSymbol={activeSymbol} currentPrice={tradingPrice} account={account} onPlaceOrder={handlePlaceOrder} onCloseOrder={handleCloseOrder} activeDragTrade={activeDragTrade} />
        </div>
        
        {editingDrawingId && allDrawings.find(d => d.id === editingDrawingId) && <DrawingSettingsModal drawing={allDrawings.find(d => d.id === editingDrawingId)!} onClose={() => setEditingDrawingId(null)} onSave={(u) => { handleDrawingUpdate(u); setEditingDrawingId(null); }} />}
      </div>
    </div>
  );
};

export default App;
