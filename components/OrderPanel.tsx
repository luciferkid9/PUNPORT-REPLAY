
import React, { useState, useEffect } from 'react';
import { AccountState, OrderSide, Trade, OrderStatus, OrderType, SymbolType, DragTradeUpdate } from '../types';
import { getContractSize, DEFAULT_LEVERAGE } from '../constants';
import { calculateRequiredMargin, calculatePnLInUSD } from '../services/logicEngine';

interface Props {
  activeSymbol: SymbolType;
  currentPrice: number;
  account: AccountState;
  onPlaceOrder: (side: OrderSide, type: OrderType, entry: number, sl: number, tp: number, quantity: number) => void;
  onCloseOrder: (tradeId: string) => void;
  activeDragTrade: DragTradeUpdate | null;
}

export const OrderPanel: React.FC<Props> = ({ activeSymbol, currentPrice, account, onPlaceOrder, onCloseOrder, activeDragTrade }) => {
  const [activeTab, setActiveTab] = useState<'MARKET' | 'LIMIT' | 'STOP'>('MARKET');
  const [lotSizeStr, setLotSizeStr] = useState<string>("1.00");
  
  // Changed to String state to handle decimal typing correctly (e.g. "0.")
  const [limitPriceStr, setLimitPriceStr] = useState<string>("");
  const [slPriceStr, setSlPriceStr] = useState<string>("");
  const [tpPriceStr, setTpPriceStr] = useState<string>("");
  
  const [errorModal, setErrorModal] = useState<{ show: boolean; title: string; message: string }>({ show: false, title: '', message: '' });

  // Determine decimal places and pip scalar
  const isJpy = activeSymbol.includes('JPY');
  const isXau = activeSymbol.includes('XAU');
  
  const pipScalar = isJpy ? 0.01 : (isXau ? 0.01 : 0.0001); 
  const digits = isJpy ? 3 : (isXau ? 2 : 5);
  
  // Derived numeric values for calculation
  const limitPrice = parseFloat(limitPriceStr) || 0;
  const slPrice = parseFloat(slPriceStr) || 0;
  const tpPrice = parseFloat(tpPriceStr) || 0;

  const marketEntry = Number(currentPrice.toFixed(digits));
  const targetEntry = activeTab === 'MARKET' ? marketEntry : limitPrice;

  // Initialize prices - Only set if empty to avoid overwriting user input
  useEffect(() => {
     if (currentPrice > 0 && limitPriceStr === "") {
         setLimitPriceStr(currentPrice.toFixed(digits));
     }
  }, [currentPrice, digits]); 

  // Reset inputs when symbol changes
  useEffect(() => {
      setLimitPriceStr("");
      setSlPriceStr("");
      setTpPriceStr("");
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
      
      const contractSize = getContractSize(activeSymbol); 
      const priceDiff = Math.abs(targetEntry - targetPrice);
      const rawProfit = priceDiff * lotSize * contractSize;

      return calculatePnLInUSD(activeSymbol, rawProfit, targetPrice);
  };

  const riskAmount = calculateUSDValue(slPrice);
  const rewardAmount = calculateUSDValue(tpPrice);
  const riskPips = calculatePips(targetEntry, slPrice);
  const rewardPips = calculatePips(targetEntry, tpPrice);

  const riskPercent = account.equity > 0 ? (riskAmount / account.equity) * 100 : 0;

  const openTrades = account.history.filter(t => t.status === OrderStatus.OPEN || t.status === OrderStatus.PENDING);

  const calculateUsedMargin = () => {
      return openTrades.reduce((acc, t) => {
          if (t.status === OrderStatus.OPEN) {
              return acc + calculateRequiredMargin(t.symbol, t.quantity, t.entryPrice);
          }
          return acc;
      }, 0);
  };

  const formatCurrency = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handlePriceStringChange = (setter: (val: string) => void, val: string) => {
      // Allow empty string or valid decimal number format
      if (val === '' || /^\d*\.?\d*$/.test(val)) setter(val);
  };

  const handleLotChange = (val: string) => {
      if (val === '' || /^\d*\.?\d*$/.test(val)) setLotSizeStr(val);
  };

  // --- VALIDATION & PLACEMENT ---
  const validateAndPlaceOrder = (side: OrderSide) => {
      if (targetEntry <= 0) { setErrorModal({ show: true, title: 'Invalid Price', message: 'Market data is not available yet.' }); return; }
      if (lotSize <= 0) { setErrorModal({ show: true, title: 'Invalid Volume', message: 'Lot size must be greater than 0.' }); return; }

      const validEntry = Number(targetEntry.toFixed(digits));
      const current = Number(currentPrice.toFixed(digits));

      if (activeTab === 'LIMIT') {
          if (side === OrderSide.LONG && validEntry >= current) {
              setErrorModal({ show: true, title: 'Invalid Buy Limit', message: `Buy Limit Price (${validEntry}) must be LOWER than Current Price (${current}).` }); return;
          }
          if (side === OrderSide.SHORT && validEntry <= current) {
              setErrorModal({ show: true, title: 'Invalid Sell Limit', message: `Sell Limit Price (${validEntry}) must be HIGHER than Current Price (${current}).` }); return;
          }
      } else if (activeTab === 'STOP') {
          if (side === OrderSide.LONG && validEntry <= current) {
              setErrorModal({ show: true, title: 'Invalid Buy Stop', message: `Buy Stop Price (${validEntry}) must be HIGHER than Current Price (${current}).` }); return;
          }
          if (side === OrderSide.SHORT && validEntry >= current) {
              setErrorModal({ show: true, title: 'Invalid Sell Stop', message: `Sell Stop Price (${validEntry}) must be LOWER than Current Price (${current}).` }); return;
          }
      }

      const requiredMargin = calculateRequiredMargin(activeSymbol, lotSize, targetEntry);
      const usedMargin = calculateUsedMargin();
      const freeMargin = account.equity - usedMargin;

      if (requiredMargin > freeMargin) {
          setErrorModal({ show: true, title: 'Insufficient Margin', message: `Margin Required: $${formatCurrency(requiredMargin)}\nFree Margin: $${formatCurrency(freeMargin)}\n\nPlease reduce lot size.` });
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
                            type="text" inputMode="decimal"
                            value={limitPriceStr} 
                            onChange={(e) => handlePriceStringChange(setLimitPriceStr, e.target.value)}
                            className="input-bubble w-full rounded-xl pl-16 pr-4 py-3 text-right text-base font-mono font-bold text-blue-100 outline-none focus:border-blue-500/50 transition-colors"
                        />
                        <button 
                            onClick={() => setLimitPriceStr(currentPrice.toFixed(digits))}
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
                    <div className="text-xs font-mono font-bold">
                        {riskPercent > 0 && <span className={riskPercent > 2 ? 'text-red-500' : 'text-zinc-300'}>Risk: {riskPercent.toFixed(2)}%</span>}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* STOP LOSS */}
                    <div className="space-y-1">
                        <div className="relative group">
                            <label className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-red-500/70 uppercase">SL</label>
                            <input 
                                type="text" inputMode="decimal"
                                value={slPriceStr}
                                placeholder="0.0000"
                                onChange={(e) => handlePriceStringChange(setSlPriceStr, e.target.value)}
                                className="input-bubble w-full rounded-xl pl-8 pr-3 py-2.5 text-right text-sm font-mono font-bold text-red-200 outline-none focus:border-red-500/50 transition-colors placeholder-zinc-700"
                            />
                        </div>
                        <div className="text-[10px] text-right pr-1 font-mono font-bold h-4 flex justify-end items-center gap-1 whitespace-nowrap">
                            {riskAmount > 0 ? (
                                <>
                                    <span className="text-red-400">-${formatCurrency(riskAmount)}</span>
                                    <span className="text-red-500/60 text-[9px]">({riskPips.toFixed(2)} pips)</span>
                                </>
                            ) : ''}
                        </div>
                    </div>

                    {/* TAKE PROFIT */}
                    <div className="space-y-1">
                        <div className="relative group">
                            <label className="absolute left-3 top-1/2 -translate-y-1/2 text-green-500/70 uppercase">TP</label>
                            <input 
                                type="text" inputMode="decimal"
                                value={tpPriceStr}
                                placeholder="0.0000"
                                onChange={(e) => handlePriceStringChange(setTpPriceStr, e.target.value)}
                                className="input-bubble w-full rounded-xl pl-8 pr-3 py-2.5 text-right text-sm font-mono font-bold text-green-200 outline-none focus:border-green-500/50 transition-colors placeholder-zinc-700"
                            />
                        </div>
                        <div className="text-[10px] text-right pr-1 font-mono font-bold h-4 flex justify-end items-center gap-1 whitespace-nowrap">
                            {rewardAmount > 0 ? (
                                <>
                                    <span className="text-green-400">+${formatCurrency(rewardAmount)}</span>
                                    <span className="text-green-500/60 text-[9px]">({rewardPips.toFixed(2)} pips)</span>
                                </>
                            ) : ''}
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
            
            // Raw PnL in Quote Currency
            const rawPnL = (priceForCalc - trade.entryPrice) * trade.quantity * contractSize * (trade.side === OrderSide.LONG ? 1 : -1);
            
            // Convert to USD using robust logic
            const pnlUSD = calculatePnLInUSD(trade.symbol, rawPnL, priceForCalc);

            const isPositive = pnlUSD >= 0;
            
            // Correct digits for specific trade symbol
            const tradeDigits = trade.symbol.includes('JPY') ? 3 : (trade.symbol.includes('XAU') ? 2 : 5);
            
            // DRAG OVERRIDE LOGIC
            // If dragging, use the drag price. Otherwise use trade state.
            let displayEntry = trade.entryPrice;
            let displaySL = trade.stopLoss;
            let displayTP = trade.takeProfit;

            if (activeDragTrade && activeDragTrade.id === trade.id) {
                if (activeDragTrade.type === 'ENTRY') displayEntry = activeDragTrade.price;
                if (activeDragTrade.type === 'SL') displaySL = activeDragTrade.price;
                if (activeDragTrade.type === 'TP') displayTP = activeDragTrade.price;
            }

            // --- PROJECTED CASH CALCULATION ---
            const calculateProjectedCash = (targetPrice: number) => {
                if (targetPrice <= 0) return null;
                const multiplier = trade.side === OrderSide.LONG ? 1 : -1;
                // Projected PnL if hit
                const projRawPnL = (targetPrice - trade.entryPrice) * trade.quantity * contractSize * multiplier;
                return calculatePnLInUSD(trade.symbol, projRawPnL, targetPrice);
            };

            const tpCash = calculateProjectedCash(displayTP);
            const slCash = calculateProjectedCash(displaySL);

            return (
                <div key={trade.id} className={`glass-panel rounded-xl p-3 shadow-sm transition-all group border-l-2 ${trade.side === 'LONG' ? 'border-l-green-500' : 'border-l-red-500'} ${isPending ? 'opacity-90 bg-white/[0.01]' : 'bg-white/[0.03]'}`}>
                    <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center space-x-2">
                            <span className={`text-[10px] font-black uppercase tracking-wide ${trade.side === OrderSide.LONG ? 'text-green-400' : 'text-red-400'}`}>
                                {isPending ? `${trade.type} ${trade.side}` : trade.side}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-500 opacity-70">#{trade.id.substr(0,4)}</span>
                            <span className="text-xs font-bold text-white">{trade.quantity}</span>
                            <span className="text-[10px] font-bold text-zinc-500">{trade.symbol}</span>
                        </div>
                        
                        <button 
                            onClick={() => onCloseOrder(trade.id)} 
                            className="px-2 py-1 bg-white/5 hover:bg-red-500/10 border border-white/5 hover:border-red-500/30 rounded text-[9px] font-bold uppercase tracking-wider text-zinc-400 hover:text-red-400 transition-all flex items-center space-x-1"
                        >
                            <span>Close Order</span>
                        </button>
                    </div>
                    
                    <div className="flex justify-between items-center text-xs font-mono text-zinc-400">
                        {/* Display Entry Price (Updated if Pending + Dragging) */}
                        <span>@{displayEntry.toFixed(tradeDigits)}</span>
                        {!isPending && (
                            <span className={`font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                                {isPositive ? '+' : ''}{formatCurrency(pnlUSD)}
                            </span>
                        )}
                        {isPending && <span className="text-amber-500 text-[9px] font-sans font-bold px-1.5 py-0.5 rounded bg-amber-500/10">PENDING</span>}
                    </div>

                    {/* NEW: TP/SL Display with Cash - Stacked Layout */}
                    <div className="mt-2 pt-2 border-t border-white/5 flex flex-col space-y-1.5 text-[10px] font-mono">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center space-x-2">
                                <span className="text-zinc-600 font-bold w-4">TP</span>
                                <span className={displayTP > 0 ? "text-green-400" : "text-zinc-600"}>
                                    {displayTP > 0 ? displayTP.toFixed(tradeDigits) : '---'}
                                </span>
                            </div>
                            {tpCash !== null && (
                                <span className={`font-bold opacity-80 ${tpCash >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {tpCash >= 0 ? '+' : '-'}${formatCurrency(Math.abs(tpCash))}
                                </span>
                            )}
                        </div>
                        <div className="flex justify-between items-center">
                            <div className="flex items-center space-x-2">
                                <span className="text-zinc-600 font-bold w-4">SL</span>
                                <span className={displaySL > 0 ? "text-red-400" : "text-zinc-600"}>
                                    {displaySL > 0 ? displaySL.toFixed(tradeDigits) : '---'}
                                </span>
                            </div>
                            {slCash !== null && (
                                <span className={`font-bold opacity-80 ${slCash >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {slCash >= 0 ? '+' : '-'}${formatCurrency(Math.abs(slCash))}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            );
        })}
      </div>
    </div>
  );
};
