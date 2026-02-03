
import React, { useState, useEffect } from 'react';
import { AccountState, OrderSide, Trade, OrderStatus, OrderType, SymbolType } from '../types';
import { getContractSize, DEFAULT_LEVERAGE } from '../constants';

interface Props {
  activeSymbol: SymbolType;
  currentPrice: number;
  account: AccountState;
  onPlaceOrder: (side: OrderSide, type: OrderType, entry: number, sl: number, tp: number, quantity: number) => void;
  onCloseOrder: (tradeId: string) => void;
}

export const OrderPanel: React.FC<Props> = ({ activeSymbol, currentPrice, account, onPlaceOrder, onCloseOrder }) => {
  const [activeTab, setActiveTab] = useState<'MARKET' | 'LIMIT' | 'STOP'>('MARKET');
  const [lotSizeStr, setLotSizeStr] = useState<string>("1.00");
  const [limitPrice, setLimitPrice] = useState<number>(0);
  const [slPrice, setSlPrice] = useState<number>(0);
  const [tpPrice, setTpPrice] = useState<number>(0);
  const [errorModal, setErrorModal] = useState<{ show: boolean; title: string; message: string }>({ show: false, title: '', message: '' });

  // Determine decimal places and pip scalar
  // JPY pairs: 2-3 decimals, pip is 0.01
  // XAUUSD: 2 decimals, pip is 0.01 (or 0.1 depending on broker, treating 0.01 as tick here)
  // Forex: 4-5 decimals, pip is 0.0001
  const isJpy = activeSymbol.includes('JPY');
  const isXau = activeSymbol.includes('XAU');
  
  const pipScalar = isJpy ? 0.01 : (isXau ? 0.01 : 0.0001); 
  const digits = isJpy ? 3 : (isXau ? 2 : 5);
  
  const marketEntry = Number(currentPrice.toFixed(digits));
  const targetEntry = activeTab === 'MARKET' ? marketEntry : limitPrice;

  // Initialize prices
  useEffect(() => {
     if (currentPrice > 0 && limitPrice === 0) {
         setLimitPrice(Number(currentPrice.toFixed(digits)));
     }
  }, [currentPrice, digits]); 

  // Reset inputs when symbol changes
  useEffect(() => {
      setLimitPrice(0);
      setSlPrice(0);
      setTpPrice(0);
  }, [activeSymbol]);

  const lotSize = parseFloat(lotSizeStr) || 0;

  // --- STANDARD CALCULATION LOGIC ---
  const calculatePips = (price1: number, price2: number) => {
      if (price1 <= 0 || price2 <= 0) return 0;
      const diff = Math.abs(price1 - price2);
      return diff / pipScalar;
  };

  const calculateUSDValue = (targetPrice: number) => {
      if (targetPrice <= 0 || targetEntry <= 0 || lotSize <= 0) return 0;
      
      const pips = calculatePips(targetEntry, targetPrice);
      const contractSize = getContractSize(activeSymbol); // Standard: 100,000 for Forex
      
      // Basic Formula: Profit = (Close - Open) * Volume * ContractSize
      const priceDiff = Math.abs(targetEntry - targetPrice);
      const rawProfit = priceDiff * lotSize * contractSize;

      // Conversion to USD (Base Currency of Account)
      // 1. XXX/USD (e.g. EURUSD) -> Profit is in USD (Quote) -> No conversion needed
      if (activeSymbol.endsWith('USD')) {
          return rawProfit;
      }
      
      // 2. USD/XXX (e.g. USDJPY, USDCAD) -> Profit is in XXX (Quote) -> Convert to USD
      // We need to divide by the Exchange Rate (Current Price is close enough for estimation)
      if (activeSymbol.startsWith('USD') && currentPrice > 0) {
          return rawProfit / currentPrice;
      }
      
      // 3. Crosses (e.g. EURJPY) -> Profit is in JPY -> Convert JPY to USD
      // Since we don't have cross-rates in this simple app, we approximate.
      // If it ends in JPY, divide by USDJPY rate (approximated by currentPrice if it was USDJPY, but it's not)
      // For simplicity in this demo, if it includes JPY, we divide by currentPrice (assuming price magnitude reflects rate)
      if (activeSymbol.includes('JPY') && currentPrice > 0) {
           // This is an approximation for simulation. Real app needs USDJPY rate.
           return rawProfit / currentPrice; 
      }
      
      // Fallback
      return rawProfit;
  };

  const riskAmount = calculateUSDValue(slPrice);
  const rewardAmount = calculateUSDValue(tpPrice);
  const riskPips = calculatePips(targetEntry, slPrice);
  const rewardPips = calculatePips(targetEntry, tpPrice);

  const riskPercent = account.equity > 0 ? (riskAmount / account.equity) * 100 : 0;
  const rrRatio = riskAmount > 0 ? rewardAmount / riskAmount : 0;

  const openTrades = account.history.filter(t => t.status === OrderStatus.OPEN || t.status === OrderStatus.PENDING);

  const calculateUsedMargin = () => {
      return openTrades.reduce((acc, t) => {
          if (t.status === OrderStatus.OPEN) {
            const size = getContractSize(t.symbol);
            let margin = 0;
            // Standard Margin Formula: (Price * Lots * Contract) / Leverage
            // For USDXXX: (1 * Lots * 100000) / Leverage
            // For XXXUSD: (Price * Lots * 100000) / Leverage
            if (t.symbol.startsWith('USD')) margin = (t.quantity * size) / DEFAULT_LEVERAGE;
            else margin = (t.entryPrice * t.quantity * size) / DEFAULT_LEVERAGE;
            return acc + margin;
          }
          return acc;
      }, 0);
  };

  const handlePriceChange = (setter: (val: number) => void, val: string) => {
      const v = parseFloat(val);
      if (!isNaN(v)) setter(v);
  };

  const handleLotChange = (val: string) => {
      if (val === '' || /^\d*\.?\d*$/.test(val)) setLotSizeStr(val);
  };

  // --- VALIDATION & PLACEMENT ---
  const validateAndPlaceOrder = (side: OrderSide) => {
      if (targetEntry <= 0) { setErrorModal({ show: true, title: 'Invalid Price', message: 'Market data is not available yet.' }); return; }
      if (lotSize <= 0) { setErrorModal({ show: true, title: 'Invalid Volume', message: 'Lot size must be greater than 0.' }); return; }

      // Validate Order Types logic vs Price
      const validEntry = Number(targetEntry.toFixed(digits));
      const current = Number(currentPrice.toFixed(digits));

      if (activeTab === 'LIMIT') {
          if (side === OrderSide.LONG && validEntry >= current) {
              setErrorModal({ show: true, title: 'Invalid Buy Limit', message: `Buy Limit Price (${validEntry}) must be LOWER than Current Price (${current}).\n\nDid you mean Buy Stop?` }); return;
          }
          if (side === OrderSide.SHORT && validEntry <= current) {
              setErrorModal({ show: true, title: 'Invalid Sell Limit', message: `Sell Limit Price (${validEntry}) must be HIGHER than Current Price (${current}).\n\nDid you mean Sell Stop?` }); return;
          }
      } else if (activeTab === 'STOP') {
          if (side === OrderSide.LONG && validEntry <= current) {
              setErrorModal({ show: true, title: 'Invalid Buy Stop', message: `Buy Stop Price (${validEntry}) must be HIGHER than Current Price (${current}).\n\nDid you mean Buy Limit?` }); return;
          }
          if (side === OrderSide.SHORT && validEntry >= current) {
              setErrorModal({ show: true, title: 'Invalid Sell Stop', message: `Sell Stop Price (${validEntry}) must be LOWER than Current Price (${current}).\n\nDid you mean Sell Limit?` }); return;
          }
      }

      const contractSize = getContractSize(activeSymbol);
      let requiredMargin = 0;
      if (activeSymbol.startsWith('USD')) requiredMargin = (lotSize * contractSize) / DEFAULT_LEVERAGE;
      else requiredMargin = (targetEntry * lotSize * contractSize) / DEFAULT_LEVERAGE;

      const usedMargin = calculateUsedMargin();
      const freeMargin = account.equity - usedMargin;

      if (requiredMargin > freeMargin) {
          setErrorModal({ show: true, title: 'Insufficient Margin', message: `Margin Required: $${requiredMargin.toFixed(2)}\nFree Margin: $${freeMargin.toFixed(2)}\n\nPlease reduce lot size.` });
          return;
      }

      const validSl = Number(slPrice.toFixed(digits));
      const validTp = Number(tpPrice.toFixed(digits));

      if (side === OrderSide.LONG) {
          if (validSl > 0 && validSl >= validEntry) { setErrorModal({ show: true, title: 'Invalid Stop Loss', message: 'Buy Position: Stop Loss must be LOWER than Entry Price' }); return; }
          if (validTp > 0 && validTp <= validEntry) { setErrorModal({ show: true, title: 'Invalid Take Profit', message: 'Buy Position: Take Profit must be HIGHER than Entry Price' }); return; }
      } else {
          if (validSl > 0 && validSl <= validEntry) { setErrorModal({ show: true, title: 'Invalid Stop Loss', message: 'Sell Position: Stop Loss must be HIGHER than Entry Price' }); return; }
          if (validTp > 0 && validTp >= validEntry) { setErrorModal({ show: true, title: 'Invalid Take Profit', message: 'Sell Position: Take Profit must be LOWER than Entry Price' }); return; }
      }
      
      let finalType = OrderType.MARKET;
      if (activeTab === 'LIMIT') finalType = OrderType.LIMIT;
      if (activeTab === 'STOP') finalType = OrderType.STOP;

      onPlaceOrder(side, finalType, validEntry, validSl, validTp, lotSize);
  };

  return (
    <div className="w-full h-full flex flex-col font-sans relative text-zinc-200">
      
      {/* Error Modal */}
      {errorModal.show && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200 rounded-2xl">
              <div className="glass-panel border border-red-500/30 rounded-2xl shadow-2xl w-full p-5 relative bg-[#09090b]">
                  <div className="flex items-center space-x-2 mb-3 text-red-500">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <h3 className="font-bold uppercase tracking-wider text-sm">{errorModal.title}</h3>
                  </div>
                  <p className="text-zinc-300 text-sm mb-5 whitespace-pre-line leading-relaxed">{errorModal.message}</p>
                  <button onClick={() => setErrorModal({ ...errorModal, show: false })} className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition-colors border border-white/10">Dismiss</button>
              </div>
          </div>
      )}

      {/* Header */}
      <div className="p-5 border-b border-white/5 bg-white/[0.02]">
        <div className="flex justify-between items-center mb-5">
             <h2 className="text-base font-black text-zinc-300 uppercase tracking-widest flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
                Order Entry
             </h2>
             <div className="text-xs bg-black/40 border border-white/5 px-3 py-1.5 rounded-lg text-zinc-400 font-mono">
                 ${Math.floor(account.equity).toLocaleString()}
             </div>
        </div>
        
        {/* Order Type Tabs */}
        <div className="flex bg-black/40 p-1.5 rounded-xl mb-6 border border-white/5 shadow-inner">
            {(['MARKET', 'LIMIT', 'STOP'] as const).map(type => (
                <button 
                    key={type}
                    onClick={() => setActiveTab(type)}
                    className={`flex-1 py-2.5 text-xs font-black tracking-wider rounded-lg transition-all ${
                        activeTab === type 
                        ? 'bg-zinc-700 text-white shadow-md ring-1 ring-white/10' 
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                    }`}
                >
                    {type}
                </button>
            ))}
        </div>

        <div className="space-y-6">
            
            {/* 1. ENTRY & VOLUME GROUP */}
            <div className="space-y-3">
                <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider pl-1">Volume & Price</div>
                
                {/* Lot Size */}
                <div className="relative group">
                    <label className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-500 uppercase">Lot</label>
                    <input 
                        type="text" inputMode="decimal"
                        value={lotSizeStr} 
                        onChange={(e) => handleLotChange(e.target.value)}
                        onBlur={() => { if(lotSizeStr === '' || parseFloat(lotSizeStr) === 0) setLotSizeStr("0.01"); else setLotSizeStr(parseFloat(lotSizeStr).toString()); }}
                        className="input-bubble w-full rounded-xl pl-12 pr-4 py-3 text-right text-base font-mono font-bold text-white outline-none focus:border-blue-500/50 transition-colors"
                    />
                </div>

                {/* Entry Price (Hidden for Market) */}
                {activeTab !== 'MARKET' && (
                    <div className="relative animate-in fade-in slide-in-from-top-1">
                        <label className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-blue-400 uppercase">Price</label>
                        <input 
                            type="number" step={pipScalar}
                            value={limitPrice} 
                            onChange={(e) => handlePriceChange(setLimitPrice, e.target.value)}
                            className="input-bubble w-full rounded-xl pl-16 pr-4 py-3 text-right text-base font-mono font-bold text-blue-100 outline-none focus:border-blue-500/50 transition-colors"
                        />
                        <button 
                            onClick={() => setLimitPrice(Number(currentPrice.toFixed(digits)))}
                            className="absolute right-[-30px] top-1/2 -translate-y-1/2 text-zinc-600 hover:text-blue-400 transition-colors p-2"
                            title="Set to Current"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                        </button>
                    </div>
                )}
            </div>

            {/* 2. RISK MANAGEMENT GROUP */}
            <div className="space-y-3 pt-4 border-t border-white/5">
                <div className="flex justify-between items-center pl-1">
                    <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Protection</div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                        {riskPercent > 0 && <span className={riskPercent > 2 ? 'text-red-400' : 'text-zinc-400'}>Risk: {riskPercent.toFixed(2)}%</span>}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* STOP LOSS */}
                    <div className="space-y-1">
                        <div className="relative group">
                            <label className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-red-500/70 uppercase">SL</label>
                            <input 
                                type="number" step={pipScalar}
                                value={slPrice > 0 ? slPrice : ''}
                                placeholder="0.0000"
                                onChange={(e) => handlePriceChange(setSlPrice, e.target.value)}
                                className="input-bubble w-full rounded-xl pl-8 pr-3 py-2.5 text-right text-sm font-mono font-bold text-red-200 outline-none focus:border-red-500/50 transition-colors placeholder-zinc-700"
                            />
                        </div>
                        <div className="text-[9px] text-right pr-1 font-mono text-zinc-500 h-3">
                            {riskAmount > 0 ? `-$${riskAmount.toFixed(2)} (${riskPips.toFixed(1)} pips)` : ''}
                        </div>
                    </div>

                    {/* TAKE PROFIT */}
                    <div className="space-y-1">
                        <div className="relative group">
                            <label className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-green-500/70 uppercase">TP</label>
                            <input 
                                type="number" step={pipScalar}
                                value={tpPrice > 0 ? tpPrice : ''}
                                placeholder="0.0000"
                                onChange={(e) => handlePriceChange(setTpPrice, e.target.value)}
                                className="input-bubble w-full rounded-xl pl-8 pr-3 py-2.5 text-right text-sm font-mono font-bold text-green-200 outline-none focus:border-green-500/50 transition-colors placeholder-zinc-700"
                            />
                        </div>
                        <div className="text-[9px] text-right pr-1 font-mono text-zinc-500 h-3">
                            {rewardAmount > 0 ? `+$${rewardAmount.toFixed(2)} (${rewardPips.toFixed(1)} pips)` : ''}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4 mt-8">
            <button 
                onClick={() => validateAndPlaceOrder(OrderSide.SHORT)} 
                className="relative overflow-hidden bg-red-600 hover:bg-red-500 text-white rounded-xl p-4 transition-all transform active:scale-[0.98] shadow-lg shadow-red-900/30 group"
            >
                <div className="flex flex-col items-center relative z-10">
                    <span className="text-sm font-black tracking-widest">
                        {activeTab === 'MARKET' ? 'SELL' : `SELL ${activeTab}`}
                    </span>
                    <span className="text-xs opacity-70 font-mono mt-1">{targetEntry.toFixed(digits)}</span>
                </div>
                <div className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent group-hover:left-full transition-all duration-500 ease-in-out"></div>
            </button>

            <button 
                onClick={() => validateAndPlaceOrder(OrderSide.LONG)} 
                className="relative overflow-hidden bg-green-600 hover:bg-green-500 text-white rounded-xl p-4 transition-all transform active:scale-[0.98] shadow-lg shadow-green-900/30 group"
            >
                <div className="flex flex-col items-center relative z-10">
                    <span className="text-sm font-black tracking-widest">
                        {activeTab === 'MARKET' ? 'BUY' : `BUY ${activeTab}`}
                    </span>
                    <span className="text-xs opacity-70 font-mono mt-1">{targetEntry.toFixed(digits)}</span>
                </div>
                <div className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent group-hover:left-full transition-all duration-500 ease-in-out"></div>
            </button>
        </div>
      </div>

      {/* Active Orders List */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-black/10">
        <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest">Positions</h3>
            <span className="text-[10px] font-bold text-zinc-400 bg-white/5 px-2.5 py-0.5 rounded-full border border-white/5">{openTrades.length}</span>
        </div>
        
        {openTrades.length === 0 && (
            <div className="flex flex-col items-center justify-center h-28 text-zinc-700 border border-dashed border-white/5 rounded-xl bg-white/[0.01]">
                <span className="text-xs font-bold uppercase tracking-wider">No Open Positions</span>
            </div>
        )}

        {openTrades.map(trade => {
            const isPending = trade.status === OrderStatus.PENDING;
            const priceForCalc = trade.symbol === activeSymbol ? currentPrice : trade.entryPrice;
            const contractSize = getContractSize(trade.symbol);
            const rawPnL = (priceForCalc - trade.entryPrice) * trade.quantity * contractSize * (trade.side === OrderSide.LONG ? 1 : -1);
            let pnlUSD = rawPnL;
            
            // Basic conversion for display (Estimation)
            if (trade.symbol.startsWith('USD') && currentPrice > 0) pnlUSD = rawPnL / currentPrice;
            else if (trade.symbol.includes('JPY') && currentPrice > 0) pnlUSD = rawPnL / currentPrice;

            const isPositive = pnlUSD >= 0;
            
            return (
                <div key={trade.id} className={`glass-panel rounded-xl p-3 shadow-sm transition-all group border-l-2 ${trade.side === 'LONG' ? 'border-l-green-500' : 'border-l-red-500'} ${isPending ? 'opacity-90 bg-white/[0.01]' : 'bg-white/[0.03]'}`}>
                    <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center space-x-2">
                            <span className={`text-[10px] font-black uppercase tracking-wide ${trade.side === OrderSide.LONG ? 'text-green-400' : 'text-red-400'}`}>
                                {isPending ? `${trade.type} ${trade.side}` : trade.side}
                            </span>
                            <span className="text-xs font-bold text-white">{trade.quantity}</span>
                            <span className="text-[10px] font-bold text-zinc-500">{trade.symbol}</span>
                        </div>
                        <button onClick={() => onCloseOrder(trade.id)} className="text-[10px] font-bold text-zinc-500 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors">✕</button>
                    </div>
                    
                    <div className="flex justify-between items-center text-xs font-mono text-zinc-400">
                        <span>@{trade.entryPrice.toFixed(digits)}</span>
                        {!isPending && (
                            <span className={`font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                                {isPositive ? '+' : ''}{pnlUSD.toFixed(2)}
                            </span>
                        )}
                        {isPending && <span className="text-amber-500 text-[9px] font-sans font-bold px-1.5 py-0.5 rounded bg-amber-500/10">PENDING</span>}
                    </div>
                </div>
            );
        })}
      </div>
    </div>
  );
};
