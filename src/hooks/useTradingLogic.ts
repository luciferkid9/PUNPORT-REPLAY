import { useState, useEffect } from 'react';
import { AccountState, OrderSide, OrderType, Trade, OrderStatus, SymbolType, Candle, SimulationState, TradeJournal } from '../types';
import { INITIAL_BALANCE, STOP_OUT_LEVEL } from '../constants';
import { calculateRequiredMargin, calculatePnLInUSD, getContractSize } from '../services/logicEngine';

export function useTradingLogic(
    activeSymbol: SymbolType,
    tradingPrice: number,
    currentSimTime: number,
    currentSlice: Candle[],
    simState: SimulationState,
    setSimState: React.Dispatch<React.SetStateAction<SimulationState>>
) {
  const [account, setAccount] = useState<AccountState>({ balance: INITIAL_BALANCE, equity: INITIAL_BALANCE, maxEquity: INITIAL_BALANCE, maxDrawdown: 0, history: [] });

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
      if (currentSlice.length === 0 || !tradingPrice || account.history.length === 0) return;
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

  return {
      account,
      setAccount,
      handleModifyTrade,
      handleModifyOrderEntry,
      handleUpdateTrade,
      handleCloseOrder,
      handlePlaceOrder
  };
}
