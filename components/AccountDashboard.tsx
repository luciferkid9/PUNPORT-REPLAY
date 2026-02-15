
import React, { useRef } from 'react';
import { AccountState, SymbolType, TimeframeType, SimulationState } from '../types';

interface Props {
  account: AccountState;
  currentPrice: number;
  currentDate: number;
  activeSymbol: SymbolType;
  activeTimeframe: TimeframeType;
  simState: SimulationState;
  availableSymbols?: SymbolType[];
  pricePrecision?: number;
  onSymbolChange: (s: SymbolType) => void;
  onTimeframeChange: (t: TimeframeType) => void;
  onPlayPause: () => void;
  onNext: () => void;
  onSpeedChange: (speed: number) => void;
  onJumpToDate: (dateStr: string) => void;
  onToggleStats: () => void;
  onExit: () => void;
}

export const AccountDashboard: React.FC<Props> = ({ 
    account, currentPrice, currentDate, activeSymbol, activeTimeframe, 
    simState, availableSymbols, pricePrecision = 5, onSymbolChange, onTimeframeChange, onPlayPause, onNext, onSpeedChange, onJumpToDate, onToggleStats, onExit
}) => {
  const isProfit = account.equity >= account.balance;
  const dateInputRef = useRef<HTMLInputElement>(null);

  const dateObj = currentDate > 0 ? new Date(currentDate * 1000) : new Date();
  const dateStr = currentDate > 0 
    ? dateObj.toLocaleString('th-TH', { 
        timeZone: 'Asia/Bangkok',
        day: '2-digit', month: 'short', year: 'numeric', 
        hour: '2-digit', minute: '2-digit',
        hour12: false
      }) 
    : '--';

  const handleCalendarClick = () => {
    if (dateInputRef.current) {
        try {
            if (typeof dateInputRef.current.showPicker === 'function') {
                dateInputRef.current.showPicker();
            } else {
                dateInputRef.current.click();
            }
        } catch (e) {}
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.value) {
          onJumpToDate(e.target.value);
          e.target.value = '';
      }
  };

  const formatCurrency = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatPrice = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: pricePrecision, maximumFractionDigits: pricePrecision });

  return (
    <div className="p-3 pb-0 z-30 relative w-full max-w-full box-border">
        <div className="glass-bubble rounded-2xl px-4 py-3 flex items-center justify-between shadow-lg ring-1 ring-white/5 overflow-hidden transition-all">
          
          {/* Left Group: Controls & Branding */}
          <div className="flex items-center space-x-4 shrink-0">
            <button 
                onClick={onExit}
                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/5 transition-all active:scale-95 shrink-0"
                title="Back to Profiles"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            </button>

            <h1 className="text-xl font-black text-zinc-200 tracking-wider hidden lg:block shrink-0">
                PRO<span className="text-blue-500">TRADE</span>
            </h1>
            
            <div className="flex items-center bg-black/40 rounded-xl p-1.5 border border-white/5 shadow-inner space-x-1 shrink-0">
                <button 
                    onClick={onPlayPause}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-bold text-xs transition-all shadow-sm ${simState.isPlaying ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/20' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20'}`}
                >
                    {simState.isPlaying ? (
                        <><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg><span className="hidden sm:inline">PAUSE</span></>
                    ) : (
                        <><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><span className="hidden sm:inline">PLAY</span></>
                    )}
                </button>
                <div className="h-6 w-[1px] bg-white/10 mx-1"></div>
                <div className="flex flex-col items-center px-1">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase leading-none mb-0.5">Speed</span>
                    <select value={simState.speed} onChange={(e) => onSpeedChange(Number(e.target.value))} className="bg-transparent text-zinc-300 text-xs font-bold outline-none cursor-pointer hover:text-white appearance-none text-center py-0">
                        <option value={1000} className="bg-zinc-900">1x</option>
                        <option value={500} className="bg-zinc-900">2x</option>
                        <option value={200} className="bg-zinc-900">5x</option>
                        <option value={50} className="bg-zinc-900">10x</option>
                    </select>
                </div>
                <div className="h-6 w-[1px] bg-white/10 mx-1"></div>
                <button onClick={onNext} disabled={simState.isPlaying} className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 disabled:opacity-30 transition-all border border-transparent hover:border-white/5" title="Step Forward">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                    <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">STEP</span>
                </button>
            </div>

            <div className="h-10 w-[1px] bg-white/5 mx-1 hidden md:block"></div>
            <div className="hidden md:flex space-x-6 shrink-0">
               <div className="flex flex-col">
                <span className="text-zinc-500 text-[10px] font-bold tracking-widest uppercase mb-0.5">Balance</span>
                <span className="font-mono text-sm font-bold text-zinc-200">${formatCurrency(account.balance)}</span>
               </div>
               <div className="flex flex-col">
                <span className="text-zinc-500 text-[10px] font-bold tracking-widest uppercase mb-0.5">Equity</span>
                <span className={`font-mono text-sm font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>${formatCurrency(account.equity)}</span>
               </div>
            </div>
          </div>

          {/* Right Group: Info & Settings */}
          <div className="flex items-center space-x-3 bg-black/20 p-1.5 rounded-xl border border-white/5 shadow-inner shrink min-w-0 overflow-hidden ml-2">
            
            <button 
                 onClick={onToggleStats}
                 className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2 transition-all shrink-0"
            >
                 <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                 <span className="hidden sm:inline">Stats</span>
            </button>

            <div className="w-[1px] h-8 bg-white/10 mx-1 hidden sm:block"></div>

            <div className="px-3 flex flex-col justify-center border-r border-white/10 relative group shrink min-w-0 hidden sm:flex">
                <span className="text-[9px] text-zinc-500 font-bold uppercase mb-0.5 truncate">Replay Date</span>
                <div className="flex items-center space-x-2 cursor-pointer" onClick={handleCalendarClick}>
                    <span className="text-xs font-mono font-bold text-amber-400 min-w-[100px] text-center hover:text-amber-300 transition-colors truncate">{dateStr}</span>
                    <svg className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
                <input 
                    ref={dateInputRef}
                    type="date" 
                    className="absolute opacity-0 pointer-events-none top-0 left-0 w-full h-full"
                    onChange={handleDateChange}
                />
            </div>

            {/* Asset & TF */}
            <div className="flex items-center space-x-3 shrink-0">
                <div className="hidden md:flex flex-col">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase mb-0.5">Asset</span>
                    <div className="flex items-center space-x-2 bg-white/5 border border-white/5 rounded-lg px-3 py-1.5">
                        <span className={`w-2 h-2 rounded-full shadow-[0_0_6px_rgba(59,130,246,0.6)] ${activeSymbol === 'XAUUSD' ? 'bg-yellow-500' : 'bg-blue-500'}`}></span>
                        <span className="text-xs font-black text-white tracking-wide">{activeSymbol}</span>
                    </div>
                </div>

                <div className="flex flex-col">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase mb-0.5">TF</span>
                    <select value={activeTimeframe} onChange={(e) => onTimeframeChange(e.target.value as TimeframeType)} className="bg-white/5 text-white text-xs font-bold rounded-lg px-2 py-1.5 border border-white/5 outline-none focus:border-blue-500 w-16">
                        <option value="M2" className="bg-zinc-900">M2</option>
                        <option value="M5" className="bg-zinc-900">M5</option>
                        <option value="M15" className="bg-zinc-900">M15</option>
                        <option value="M30" className="bg-zinc-900">M30</option>
                        <option value="H1" className="bg-zinc-900">H1</option>
                        <option value="H2" className="bg-zinc-900">H2</option>
                        <option value="H4" className="bg-zinc-900">H4</option>
                        <option value="D1" className="bg-zinc-900">D1</option>
                    </select>
                </div>
            </div>

            <div className="w-[1px] h-8 bg-white/10 mx-1"></div>
            
            <div className="text-right min-w-[80px] px-2 shrink-0">
                <span className="text-zinc-500 text-[9px] block font-bold uppercase">Price</span>
                <span className={`font-mono text-lg font-bold drop-shadow-sm ${currentPrice > 0 ? 'text-yellow-400' : 'text-zinc-600'}`}>{currentPrice > 0 ? formatPrice(currentPrice) : '---'}</span>
            </div>
          </div>
        </div>
    </div>
  );
};
