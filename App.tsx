
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { INITIAL_BALANCE, SYMBOL_CONFIG, getContractSize, TF_SECONDS, DEFAULT_LEVERAGE, STOP_OUT_LEVEL } from './constants';
import { AccountState, SimulationState, OrderSide, OrderType, Trade, OrderStatus, ToolType, DrawingObject, IndicatorType, DrawingSettings, SymbolType, TimeframeType, Candle, TraderProfile, TradeJournal } from './types';
import { ChartContainer, ChartRef } from './components/ChartContainer';
import { ControlBar } from './components/ControlBar';
import { AccountDashboard } from './components/AccountDashboard';
import { OrderPanel } from './components/OrderPanel';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { DrawingManager } from './components/DrawingManager';
import { DrawingSettingsModal } from './components/DrawingSettingsModal';
import { ChallengeSetupModal } from './components/ChallengeSetupModal';
import { DetailedStats } from './components/DetailedStats';
import { MarketStructureWidget } from './components/MarketStructureWidget';
import { calculateSMA, calculateRSI, calculateMACD } from './services/logicEngine';
import { fetchCandles, parseCSV, fetchHistoricalData, fetchContextCandles, fetchFutureCandles, fetchFirstCandle } from './services/api';

const STORAGE_KEY = 'protrade_profiles_v2'; 

const App: React.FC = () => {
  // --- STATE ---
  const [profiles, setProfiles] = useState<TraderProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState<TraderProfile | null>(null);

  const [activeSymbol, setActiveSymbol] = useState<SymbolType>('EURUSD');
  const [activeTimeframe, setActiveTimeframe] = useState<TimeframeType>('H1');
  
  const [chartData, setChartData] = useState<Candle[]>([]);
  
  // Use Ref to access latest data inside tick without resetting interval
  const chartDataRef = useRef<Candle[]>([]);
  useEffect(() => { chartDataRef.current = chartData; }, [chartData]);
  
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
    isLoadedRef.current = true; // Mark initial load as complete
    setIsLoading(false);
  }, []);

  useEffect(() => { 
      // Only save to localStorage if initial load is complete to avoid overwriting with empty array on mount
      if (isLoadedRef.current) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles)); 
      }
  }, [profiles]);

  // Sync state back to profile
  useEffect(() => {
    if (activeProfileId) {
        setProfiles(prev => prev.map(p => {
            if (p.id === activeProfileId) {
                // We don't sync timePlayed here to avoid excessive re-renders/loop, 
                // timePlayed is handled by the dedicated timer below updating the specific profile.
                return {
                    ...p, lastPlayed: Date.now(), account, activeSymbol, activeTimeframe,
                    currentSimTime: currentSimTime > 0 ? currentSimTime : p.currentSimTime, drawings: allDrawings
                };
            }
            return p;
        }));
    }
  }, [account, activeSymbol, activeTimeframe, currentSimTime, activeProfileId, allDrawings]);

  // --- TIME INVESTED TIMER ---
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
              // Also update the local activeProfile state to reflect time in UI immediately if needed
              setActiveProfile(prev => prev ? { ...prev, timePlayed: (prev.timePlayed || 0) + 1 } : null);
          }, 1000);
      }
      return () => clearInterval(interval);
  }, [activeProfileId]);

  // --- HANDLERS ---
  const handleCreateProfile = (name: string, balance: number, symbols: SymbolType[], startDate: number, endDate: number, timeframe: TimeframeType = 'H1', customDigits?: number) => {
      const newProfile: TraderProfile = {
          id: Math.random().toString(36).substr(2, 9), name, createdAt: Date.now(), lastPlayed: Date.now(),
          timePlayed: 0, // Init time invested
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
      setShowDataError(false);
      setIsLoading(true); 
  };

  const handleSymbolChange = (newSymbol: SymbolType) => {
      setActiveSymbol(newSymbol); setChartData([]);
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
      setChartData([]); setAllDrawings([]); setShowDataError(false);
  };

  // --- HELPER: AUTO DETECT PRECISION ---
  // Calculates the appropriate number of decimals based on price magnitude
  const getDynamicPrecision = () => {
      if (activeProfile?.customDigits) return activeProfile.customDigits;
      if (SYMBOL_CONFIG[activeSymbol]) return SYMBOL_CONFIG[activeSymbol].digits;
      
      // Fallback: Guess based on current data
      if (chartData.length > 0) {
          const sample = chartData[chartData.length-1].close;
          if (sample > 500) return 2; // e.g. Gold, Indices
          if (sample > 20) return 3;  // e.g. JPY pairs, Oil
          return 5; // e.g. Forex
      }
      return 5;
  };
  const currentDigits = getDynamicPrecision();

  // --- DATA LOADING PIPELINE ---

  // 1. Initial Load: Fetch Context Data (<= simTime)
  useEffect(() => {
     if (!activeSymbol || !activeProfileId || !activeProfile) return;
     
     const controller = new AbortController();

     const loadInitialData = async () => {
         setIsLoading(true);
         setShowDataError(false); 
         
         try {
             // Precise Time Sync Logic:
             // We use currentSimTime as the absolute 'lt' (less than) limit for the API.
             // This ensures that if we are at 12:00, we fetch all candles strictly before 12:00
             // regardless of the timeframe (H1, M15, M5).
             const targetTime = currentSimTime > 0 ? currentSimTime : activeProfile.startDate;
             
             // 1. Try to fetch context at targetTime
             // INCREASED LIMIT TO 1000 to fill wider screens
             let contextData = await fetchContextCandles(activeSymbol, activeTimeframe, targetTime, 1000, controller.signal);
             
             if (controller.signal.aborted) return;

             // 2. AUTO-RECOVERY: If no context data found
             if (contextData.length === 0) {
                 console.log("No context data found. Attempting auto-recovery...");
                 const firstCandle = await fetchFirstCandle(activeSymbol, activeTimeframe, controller.signal);
                 
                 if (controller.signal.aborted) return;

                 if (firstCandle) {
                     console.log("Found data starting at:", new Date(firstCandle.time * 1000).toISOString());
                     const recoveryTarget = firstCandle.time + TF_SECONDS[activeTimeframe];
                     contextData = await fetchContextCandles(activeSymbol, activeTimeframe, recoveryTarget, 1000, controller.signal);
                 }
             }
             
             if (controller.signal.aborted) return;

             if (contextData.length > 0) {
                 setChartData(contextData);
                 setSimState(prev => ({ 
                     ...prev, 
                     currentIndex: contextData.length - 1, 
                     maxIndex: contextData.length 
                 }));
                 
                 const lastCandle = contextData[contextData.length - 1];
                 const nextSimTime = lastCandle.time + TF_SECONDS[activeTimeframe];
                 setCurrentSimTime(nextSimTime);
                 
                 setTimeout(() => { 
                     if (!controller.signal.aborted) {
                        chartRef.current?.fitContent(); 
                     }
                 }, 100);

             } else {
                 setChartData([]);
                 setShowDataError(true);
             }
         } catch (e) {
             console.error("Data load error", e);
             setChartData([]);
             setShowDataError(true);
         } finally {
             if (!controller.signal.aborted) {
                setIsLoading(false);
             }
         }
     };

     loadInitialData();
     return () => controller.abort();
  }, [activeSymbol, activeTimeframe, activeProfileId]); 

  // 2. Stream Buffering: Auto-Fetch Future Data
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

  // Sync simState.maxIndex with chartData length
  useEffect(() => {
     setSimState(prev => {
         if (prev.maxIndex !== chartData.length) {
             return { ...prev, maxIndex: chartData.length };
         }
         return prev;
     });
  }, [chartData.length]);


  // Handler for Infinite Scroll (History)
  const handleLoadMoreHistory = async () => {
      if (isLoadingHistory || chartData.length === 0) return;
      setIsLoadingHistory(true);
      const oldestTime = chartData[0].time;
      const moreData = await fetchHistoricalData(activeSymbol, activeTimeframe, oldestTime, 500); 
      if (moreData.length > 0) {
          setChartData(prev => [...moreData, ...prev]);
          setSimState(prev => ({
              ...prev,
              currentIndex: prev.currentIndex + moreData.length,
              maxIndex: prev.maxIndex + moreData.length
          }));
      }
      setIsLoadingHistory(false);
  };

  // --- TIME & PRICE SYNC ---
  useEffect(() => {
      if (chartData.length > 0 && chartData[simState.currentIndex]) {
          const chartCandle = chartData[simState.currentIndex];
          const duration = TF_SECONDS[activeTimeframe];
          
          setCurrentRealTimePrice(chartCandle.close);
          setCurrentSimTime(chartCandle.time + duration);
      }
  }, [simState.currentIndex, chartData, activeTimeframe]);

  const [indicators, setIndicators] = useState<IndicatorType[]>(['MACD']);
  const [smaData, setSmaData] = useState<{ time: number; value: number }[]>([]);
  const [rsiData, setRsiData] = useState<{ time: number; value: number }[]>([]);
  const [macdData, setMacdData] = useState<{ macd: any[], signal: any[], histogram: any[] }>({ macd: [], signal: [], histogram: [] });
  const [showIndicatorMenu, setShowIndicatorMenu] = useState<boolean>(false);
  const indicatorMenuRef = useRef<HTMLDivElement>(null);

  // Click outside to close indicator menu
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
      setSmaData(calculateSMA(chartData, 14));
      setRsiData(calculateRSI(chartData, 14));
      setMacdData(calculateMACD(chartData, 12, 26, 9));
  }, [chartData]);

  const toggleIndicator = (i: IndicatorType) => setIndicators(prev => prev.includes(i) ? prev.filter(ind => ind !== i) : [...prev, i]);

  const [activeTool, setActiveTool] = useState<ToolType>('CURSOR');
  const [magnetMode, setMagnetMode] = useState<boolean>(false);
  const [showDrawingManager, setShowDrawingManager] = useState<boolean>(false);
  const [showMarketStructure, setShowMarketStructure] = useState<boolean>(false); // NEW STATE
  const currentDrawings = allDrawings.filter(d => d.symbol === activeSymbol);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [editingDrawingId, setEditingDrawingId] = useState<string | null>(null);
  const [drawingSettings, setDrawingSettings] = useState<DrawingSettings>({ color: '#38bdf8', lineWidth: 2, lineStyle: 'solid' });

  const chartRef = useRef<ChartRef>(null);
  
  const currentSlice = chartData.slice(0, simState.currentIndex + 1);
  const lastTime = currentSlice.length > 0 ? currentSlice[currentSlice.length-1].time : 0;
  const tradingPrice = currentRealTimePrice || (currentSlice.length > 0 ? currentSlice[currentSlice.length-1].close : 0);
  
  const handleJumpToDate = async (dateStr: string) => {
    const targetStart = new Date(dateStr).getTime() / 1000;
    setSimState(prev => ({ ...prev, isPlaying: false }));
    setIsLoading(true);
    setShowDataError(false); 
    
    let context = await fetchContextCandles(activeSymbol, activeTimeframe, targetStart, 500);
    
    if (context.length === 0) {
         const firstCandle = await fetchFirstCandle(activeSymbol, activeTimeframe);
         if (firstCandle) {
             const recoveryTarget = firstCandle.time + TF_SECONDS[activeTimeframe];
             context = await fetchContextCandles(activeSymbol, activeTimeframe, recoveryTarget, 500);
         }
    }

    if (context.length > 0) {
        setChartData(context);
        setSimState(prev => ({ ...prev, currentIndex: context.length - 1, maxIndex: context.length }));
        setCurrentSimTime(context[context.length-1].time + TF_SECONDS[activeTimeframe]);
    } else {
        setChartData([]);
        setShowDataError(true);
    }
    setIsLoading(false);
  };

  const handleJumpToFirstData = async () => {
     setIsLoading(true);
     setShowDataError(false);
     const firstCandle = await fetchFirstCandle(activeSymbol, activeTimeframe);
     
     if (firstCandle) {
         const targetTime = firstCandle.time + TF_SECONDS[activeTimeframe];
         const dateStr = new Date(targetTime * 1000).toISOString();
         handleJumpToDate(dateStr); 
     } else {
         alert("Database appears to be completely empty for this symbol.");
         setIsLoading(false);
         setShowDataError(true);
     }
  };

  // --- TICK (PLAY) LOGIC ---
  const tick = useCallback(() => {
    setSimState(prev => {
      const currentData = chartDataRef.current;
      const totalLen = currentData.length;
      if (totalLen === 0 || prev.currentIndex >= totalLen - 1) return prev;
      return { ...prev, currentIndex: prev.currentIndex + 1, maxIndex: totalLen };
    });
  }, []); 

  useEffect(() => {
    let timer: number;
    if (simState.isPlaying) timer = window.setInterval(tick, simState.speed);
    return () => clearInterval(timer);
  }, [simState.isPlaying, simState.speed, tick]);

  // --- ORDER CLOSE LOGIC (Updated to handle SL/TP price correctly) ---
  const handleCloseOrder = (tradeId: string, exitPrice?: number) => {
      setAccount(prevAcc => {
          let realizedPnL = 0;
          let oldFloatingPnL = 0;

          const updatedHistory = prevAcc.history.map(trade => {
              if (trade.id === tradeId && (trade.status === OrderStatus.OPEN || trade.status === OrderStatus.PENDING)) {
                  if (trade.status === OrderStatus.PENDING) return { ...trade, status: OrderStatus.CLOSED, pnl: 0 };
                  
                  oldFloatingPnL = trade.pnl || 0;

                  // Use passed price (e.g. SL level) if available, otherwise current market price
                  const finalPrice = exitPrice !== undefined ? exitPrice : (trade.symbol === activeSymbol ? tradingPrice : trade.entryPrice); 
                  
                  const multiplier = trade.side === OrderSide.LONG ? 1 : -1;
                  const contractSize = getContractSize(trade.symbol);
                  realizedPnL = (finalPrice - trade.entryPrice) * trade.quantity * contractSize * multiplier;
                  
                  return { ...trade, status: OrderStatus.CLOSED, closePrice: finalPrice, closeTime: currentSimTime, pnl: realizedPnL };
              }
              return trade;
          });
          
          const newBalance = prevAcc.balance + realizedPnL;
          
          // Adjust equity immediately to prevent flash jumps: 
          // New Equity = Old Equity - This Trade's Floating PnL + Realized PnL
          const newEquity = prevAcc.equity - oldFloatingPnL + realizedPnL;

          return { ...prevAcc, history: updatedHistory, balance: newBalance, equity: newEquity };
      });
  };

  // --- TRADING LOOP (PNL & STOP OUT LOGIC) ---
  useEffect(() => {
      if (chartData.length === 0 || !tradingPrice || account.history.length === 0) return;
      
      let floatingPnL = 0;
      let usedMargin = 0;

      // 1. Calculate PnL and Margin for all OPEN trades
      const updatedHistory = account.history.map(t => {
          if (t.status === OrderStatus.OPEN) {
               const contractSize = getContractSize(t.symbol);
               // Margin Calc (simplified: entryPrice * quantity * size / leverage)
               usedMargin += (t.entryPrice * t.quantity * contractSize) / DEFAULT_LEVERAGE;

               if (t.symbol === activeSymbol) {
                   const mult = t.side === OrderSide.LONG ? 1 : -1;
                   const newPnL = (tradingPrice - t.entryPrice) * t.quantity * contractSize * mult;
                   return { ...t, pnl: newPnL }; 
               }
               // For trades in other symbols (not currently active), preserve existing PnL 
               // (In a real app, we would need real-time prices for ALL symbols)
               return t;
          }
          return t;
      });

      updatedHistory.forEach(t => { if (t.status === OrderStatus.OPEN) floatingPnL += (t.pnl || 0); });
      const currentEquity = account.balance + floatingPnL;
      
      // Calculate Margin Level
      // Margin Level = (Equity / Margin) * 100
      const marginLevel = usedMargin > 0 ? (currentEquity / usedMargin) * 100 : 999999;

      // --- STOP OUT (LIQUIDATION) LOGIC ---
      // Trigger if Equity <= 0 OR Margin Level <= STOP_OUT_LEVEL (0)
      if (currentEquity <= 0 || marginLevel <= STOP_OUT_LEVEL) {
          
          console.warn(`STOP OUT TRIGGERED: Equity=${currentEquity}, MarginLevel=${marginLevel}`);
          
          // Force Close ALL Open Positions
          const stopOutHistory = updatedHistory.map(t => {
              if (t.status === OrderStatus.OPEN) {
                   // Close at current calculated market price (or just blow it)
                   const closeP = t.symbol === activeSymbol ? tradingPrice : t.entryPrice; 
                   return { 
                       ...t, 
                       status: OrderStatus.CLOSED, 
                       closePrice: closeP, 
                       closeTime: currentSimTime,
                       pnl: t.pnl // Realize the loss
                   };
              }
              return t;
          });

          // Reset Account (Blown)
          setAccount(prev => ({
              ...prev,
              history: stopOutHistory,
              equity: currentEquity <= 0 ? 0 : currentEquity, // Can't be negative in simple model
              balance: currentEquity <= 0 ? 0 : currentEquity, // Balance becomes what's left (often 0)
              maxDrawdown: Math.max(prev.maxDrawdown, prev.maxEquity - 0)
          }));

          setSimState(prev => ({ ...prev, isPlaying: false }));
          alert(`⚠️ พอร์ตแตก! \n\nEquity: $${currentEquity.toFixed(2)} \nMargin Level: ${marginLevel.toFixed(2)}% \n\nระบบบังคับปิดออเดอร์ทั้งหมด (Force Close All)`);
          return; // Stop processing further updates this tick
      }

      // Normal Update if not blown
      setAccount(prev => ({
          ...prev, history: updatedHistory, equity: currentEquity,
          maxEquity: Math.max(prev.maxEquity, currentEquity),
          maxDrawdown: Math.max(prev.maxDrawdown, prev.maxEquity - currentEquity)
      }));

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
                     setAccount(prev => ({
                         ...prev,
                         history: prev.history.map(t => t.id === trade.id ? { ...t, status: OrderStatus.OPEN, entryTime: currentCandle.time } : t)
                     }));
                  }
              }
          });
      }
  }, [tradingPrice, activeSymbol, simState.currentIndex]); 

  const handlePlaceOrder = (side: OrderSide, type: OrderType, entry: number, sl: number, tp: number, quantity: number) => {
      // 1. Check for blown account
      if (account.equity <= 0) {
          alert("ไม่สามารถเปิดออเดอร์ได้: พอร์ตแตกแล้ว (Equity = 0)\nกรุณารีเซ็ตโปรไฟล์ใหม่ หรือเติมเงิน");
          return;
      }

      const isMarket = type === OrderType.MARKET;
      const executionPrice = isMarket ? tradingPrice : entry;

      // NEW: Zero Price Check
      if (executionPrice <= 0) {
          alert(`ไม่สามารถส่งคำสั่งได้: ราคาตลาดไม่ถูกต้อง (Price = ${executionPrice})\nสาเหตุอาจเกิดจาก:\n1. ข้อมูลกราฟยังโหลดไม่เสร็จ\n2. อยู่ในช่วงตลาดปิด\n3. กรุณากดปุ่ม Play เพื่อเริ่มการจำลอง`);
          return;
      }

      // 2. Calculate Required Margin for NEW trade
      const contractSize = getContractSize(activeSymbol);
      const requiredMargin = (executionPrice * quantity * contractSize) / DEFAULT_LEVERAGE;

      // 3. Calculate Currently Used Margin
      let currentUsedMargin = 0;
      account.history.forEach(t => {
          if (t.status === OrderStatus.OPEN) {
              const tSize = getContractSize(t.symbol);
              currentUsedMargin += (t.entryPrice * t.quantity * tSize) / DEFAULT_LEVERAGE;
          }
      });

      const freeMargin = account.equity - currentUsedMargin;

      // 4. Check Margin Validity
      if (requiredMargin > freeMargin) {
           alert(`Margin ไม่เพียงพอ (Insufficient Margin)!\n\nต้องการใช้: $${requiredMargin.toFixed(2)}\nมีให้ใช้ (Free Margin): $${freeMargin.toFixed(2)}\n\nกรุณาลดขนาด Lot Size หรือฝากเงินเพิ่ม`);
           return;
      }

      const newTrade: Trade = {
          id: Math.random().toString(36).substr(2, 9),
          symbol: activeSymbol, side, type, entryPrice: executionPrice,
          initialStopLoss: sl, // Track initial SL for R:R
          entryTime: isMarket ? currentSimTime : undefined,
          orderTime: currentSimTime, stopLoss: sl, takeProfit: tp, quantity, status: isMarket ? OrderStatus.OPEN : OrderStatus.PENDING, pnl: 0
      };
      setAccount(prev => ({ ...prev, history: [...prev.history, newTrade] }));
  };

  const handleModifyTrade = (tradeId: string, newSl: number, newTp: number) => {
      setAccount(prev => ({ ...prev, history: prev.history.map(t => t.id === tradeId ? { ...t, stopLoss: newSl, takeProfit: newTp } : t) }));
  };

  // --- NEW: Handle Trade Journaling ---
  const handleUpdateTrade = (tradeId: string, journal: TradeJournal) => {
      setAccount(prev => ({
          ...prev,
          history: prev.history.map(t => t.id === tradeId ? { ...t, journal } : t)
      }));
  };

  const handleDrawingCreate = (d: DrawingObject) => {
      const symbolDrawing = { ...d, symbol: activeSymbol };
      const isPosition = d.type === 'LONG_POSITION' || d.type === 'SHORT_POSITION';
      if (d.type === 'FIB') {
        symbolDrawing.fibLevels = [{ level: 0, color: '#94a3b8', visible: true },{ level: 0.236, color: '#ef4444', visible: true },{ level: 0.382, color: '#ef4444', visible: true },{ level: 0.5, color: '#22c55e', visible: true },{ level: 0.618, color: '#eab308', visible: true },{ level: 0.786, color: '#3b82f6', visible: true },{ level: 1, color: '#a1a1aa', visible: true }];
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
      }
      setAllDrawings(prev => [...prev, symbolDrawing]); setSelectedDrawingId(d.id); setActiveTool('CURSOR'); 
  };
  const handleDrawingUpdate = (updated: DrawingObject) => setAllDrawings(prev => prev.map(d => d.id === updated.id ? updated : d));
  const handleDrawingDelete = (id: string) => setAllDrawings(prev => prev.filter(d => d.id !== id));

  if (!activeProfileId || !activeProfile) {
      return (
        <ChallengeSetupModal 
            profiles={profiles} onStart={handleSelectProfile} onCreate={handleCreateProfile} onDelete={handleDeleteProfile}
        />
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
      
      {/* NO DATA ALERT MODAL */}
      {showDataError && !isLoading && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
              <div className="glass-panel p-8 rounded-2xl shadow-2xl max-w-md text-center">
                  <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                      <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">No Data Found</h3>
                  <p className="text-zinc-400 mb-6 text-sm leading-relaxed">
                      ไม่พบข้อมูลในช่วงเวลาที่เลือก ระบบจะทำการค้นหาข้อมูลที่ใกล้เคียงที่สุด
                  </p>
                  <div className="space-y-3">
                      <button 
                          onClick={handleJumpToFirstData}
                          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-900/30 transition-all active:scale-[0.98] flex items-center justify-center space-x-2"
                      >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" /></svg>
                          <span>Jump to First Available Data</span>
                      </button>
                      <button 
                          onClick={() => setShowDataError(false)}
                          className="text-zinc-500 hover:text-zinc-300 text-xs font-bold uppercase tracking-wider"
                      >
                          Dismiss
                      </button>
                  </div>
              </div>
          </div>
      )}

      {showStats && (
        <DetailedStats 
            account={account} 
            sessionStart={activeProfile.startDate}
            currentSimTime={currentSimTime}
            timePlayed={activeProfile.timePlayed || 0}
            activeTimeframe={activeTimeframe}
            onClose={() => setShowStats(false)} 
            onUpdateTrade={handleUpdateTrade}
        />
      )}
      <div className="flex flex-1 overflow-hidden relative p-3 gap-3">
        {/* NEW FLOATING TOOLBAR */}
        <div className="glass-bubble w-14 rounded-2xl flex flex-col items-center py-4 space-y-3 z-20">
             
             {/* Main Tools Group */}
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
                    onClick={() => { setActiveTool('FIB'); setSelectedDrawingId(null); }} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${activeTool === 'FIB' ? 'bg-blue-500/20 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)] ring-1 ring-blue-500/50' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'}`} 
                    title="Fibonacci"
                >
                    <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
             </div>

             <div className="w-8 h-[1px] bg-white/10"></div>

             {/* Position Tools Group */}
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

             {/* Utility Group */}
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
                        {(['SMA', 'RSI', 'MACD'] as IndicatorType[]).map(i => (
                            <button 
                                key={i} 
                                onClick={() => toggleIndicator(i)} 
                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold flex justify-between items-center transition-all ${indicators.includes(i) ? 'bg-purple-500/20 text-purple-300' : 'hover:bg-white/5 text-zinc-300'}`}
                            >
                                <span>{i}</span>
                                {indicators.includes(i) && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_5px_rgba(192,132,252,0.8)]"></span>}
                            </button>
                        ))}
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

             {showDrawingManager && <DrawingManager drawings={currentDrawings} settings={drawingSettings} selectedId={selectedDrawingId} onUpdateSettings={setDrawingSettings} onSelect={setSelectedDrawingId} onToggleVisible={(id) => handleDrawingUpdate({...allDrawings.find(d => d.id === id)!, visible: !allDrawings.find(d => d.id === id)!.visible})} onToggleLock={(id) => handleDrawingUpdate({...allDrawings.find(d => d.id === id)!, locked: !allDrawings.find(d => d.id === id)!.locked})} onDelete={handleDrawingDelete} onClose={() => setShowDrawingManager(false)} />}
        </div>
        
        <div className="flex-1 flex flex-col min-w-0 relative gap-3">
            <div className="flex-1 relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/5">
                <ChartContainer 
                    key={activeSymbol} 
                    activeSymbol={activeSymbol}
                    interval={TF_SECONDS[activeTimeframe]} // Pass interval to chart
                    ref={chartRef} 
                    data={currentSlice} 
                    smaData={smaData.filter(d => d.time <= lastTime)} rsiData={rsiData.filter(d => d.time <= lastTime)} macdData={{ macd: macdData.macd.filter(d => d.time <= lastTime), signal: macdData.signal.filter(d => d.time <= lastTime), histogram: macdData.histogram.filter(d => d.time <= lastTime) }} 
                    trades={account.history.filter(t => t.symbol === activeSymbol)} onModifyTrade={handleModifyTrade}
                    activeTool={activeTool} magnetMode={magnetMode} drawingSettings={drawingSettings} indicators={indicators} 
                    onDrawingCreate={handleDrawingCreate} onDrawingUpdate={handleDrawingUpdate} onDrawingEdit={(d) => setEditingDrawingId(d.id)} onDrawingSelect={setSelectedDrawingId} onDrawingDelete={handleDrawingDelete} 
                    onLoadMore={handleLoadMoreHistory} 
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
            <div className="glass-bubble rounded-2xl overflow-hidden">
                <AnalyticsPanel account={account} initialBalance={activeProfile.account.maxEquity || INITIAL_BALANCE} />
                <ControlBar simState={simState} onPlayPause={() => setSimState(s => ({...s, isPlaying: !s.isPlaying}))} onNext={tick} onSpeedChange={(v) => setSimState(s => ({...s, speed: v}))} />
            </div>
        </div>
        
        {/* RIGHT PANEL - Floating Bubble Style */}
        <div className="glass-bubble w-80 rounded-2xl flex flex-col shadow-2xl overflow-hidden ring-1 ring-white/5">
            <OrderPanel activeSymbol={activeSymbol} currentPrice={tradingPrice} account={account} onPlaceOrder={handlePlaceOrder} onCloseOrder={handleCloseOrder} />
        </div>
        
        {editingDrawingId && allDrawings.find(d => d.id === editingDrawingId) && <DrawingSettingsModal drawing={allDrawings.find(d => d.id === editingDrawingId)!} onClose={() => setEditingDrawingId(null)} onSave={(u) => { handleDrawingUpdate(u); setEditingDrawingId(null); }} />}
      </div>
    </div>
  );
};

export default App;
