
import React, { useState, useEffect, useRef } from 'react';
import { TraderProfile, SymbolType, TimeframeType } from '../types';
import { SYMBOL_CONFIG } from '../constants';
import { fetchFirstCandle, fetchLastCandle } from '../services/api';

interface Props {
  profiles: TraderProfile[];
  onStart: (profile: TraderProfile) => void;
  onCreate: (name: string, balance: number, symbols: SymbolType[], startDate: number, endDate: number, timeframe: TimeframeType, customDigits?: number) => void;
  onDelete: (id: string) => void;
}

export const ChallengeSetupModal: React.FC<Props> = ({ profiles, onStart, onCreate, onDelete }) => {
  const [view, setView] = useState<'LIST' | 'CREATE'>(profiles.length === 0 ? 'CREATE' : 'LIST');

  // Form State
  const [name, setName] = useState('New Session');
  const [balance, setBalance] = useState(100000);
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolType | ''>('');
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isAssetDropdownOpen, setIsAssetDropdownOpen] = useState(false);
  
  // Data Availability State
  const [validSymbols, setValidSymbols] = useState<SymbolType[]>([]);
  const [isSyncingDates, setIsSyncingDates] = useState(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // If no profiles exist, force create view
  useEffect(() => {
    if (profiles.length === 0) setView('CREATE');
  }, [profiles]);

  // Click outside to close asset dropdown
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
              setIsAssetDropdownOpen(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 1. POPULATE SYMBOLS FROM CONFIG
  useEffect(() => {
      if (view === 'CREATE') {
          const candidates = Object.keys(SYMBOL_CONFIG).filter(s => s !== 'CUSTOM') as SymbolType[];
          setValidSymbols(candidates);
          
          // Auto-select first symbol if none selected
          if (candidates.length > 0 && !selectedSymbol) {
              setSelectedSymbol(candidates[0]);
          }
      }
  }, [view]);

  // 2. SYNC DATES WHEN SYMBOL CHANGES
  useEffect(() => {
      if (selectedSymbol && view === 'CREATE') {
          const syncDates = async () => {
              setIsSyncingDates(true);
              try {
                  const [first, last] = await Promise.all([
                      fetchFirstCandle(selectedSymbol as SymbolType),
                      fetchLastCandle(selectedSymbol as SymbolType)
                  ]);

                  if (first) {
                      const firstDateStr = new Date(first.time * 1000).toISOString().split('T')[0];
                      // User requirement: Start at 2024-01-01 to allow 2023 data as context for indicators
                      const targetStart = '2024-01-01';
                      
                      // If data starts AFTER 2024-01-01, we must start there. 
                      // Otherwise, use 2024-01-01 to ensure previous data exists for MACD calc.
                      if (firstDateStr > targetStart) {
                          setStartDate(firstDateStr);
                      } else {
                          setStartDate(targetStart);
                      }
                  } else {
                      setStartDate('2024-01-01');
                  }
                  
                  if (last) {
                      const endStr = new Date(last.time * 1000).toISOString().split('T')[0];
                      setEndDate(endStr);
                  } else {
                       setEndDate(new Date().toISOString().split('T')[0]);
                  }

              } catch (e) {
                  console.error("Failed to sync dates", e);
              } finally {
                  setIsSyncingDates(false);
              }
          };
          syncDates();
      }
  }, [selectedSymbol, view]);

  const handleCreate = () => {
      if (!name.trim()) { alert("Please enter a session name"); return; }
      if (!selectedSymbol) { alert("Please select an asset"); return; }
      
      const startTs = new Date(startDate).getTime() / 1000;
      const endTs = new Date(endDate).getTime() / 1000;
      const symbol = selectedSymbol as SymbolType;
      
      // Default to H1 for initial view
      onCreate(name, balance, [symbol], startTs, endTs, 'H1', undefined);
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleString('th-TH', { 
    day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute:'2-digit' 
  });

  return (
    // Updated background to solid zinc-950 to match main app
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#09090b]">
      
      {/* Brand Title Outside Box */}
      <h1 className="text-4xl md:text-6xl font-black text-white tracking-tighter mb-8 uppercase drop-shadow-2xl animate-in fade-in slide-in-from-top-4 duration-500">
        PUNPORT <span className="text-blue-500">FX</span>
      </h1>

      <div className="relative glass-bubble border border-white/10 rounded-3xl shadow-2xl w-[800px] min-h-[780px] flex flex-col max-h-[95vh] overflow-hidden font-sans text-slate-200 ring-1 ring-white/5 animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-white/5 bg-white/[0.02]">
             <div>
                <h2 className="text-2xl font-black text-white tracking-tight mb-1">
                    {view === 'CREATE' ? 'New Simulation' : 'Select Session'}
                </h2>
                <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold">ProTrade Replay</p>
             </div>
             
             {view === 'LIST' && (
                 <button 
                    onClick={() => setView('CREATE')}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-lg shadow-blue-900/30 hover:scale-105 active:scale-95"
                 >
                    + CREATE NEW
                 </button>
             )}
             {view === 'CREATE' && profiles.length > 0 && (
                 <button onClick={() => setView('LIST')} className="text-zinc-400 hover:text-white flex items-center space-x-2 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    <span className="text-xs font-bold uppercase">Back</span>
                 </button>
             )}
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            
            {view === 'LIST' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {profiles.map(profile => {
                        const isProfit = profile.account.equity >= profile.account.balance;
                        const pnl = profile.account.equity - profile.account.balance;
                        const pnlPercent = (pnl / profile.account.balance) * 100;
                        const mainSymbol = profile.selectedSymbols && profile.selectedSymbols.length > 0 ? profile.selectedSymbols[0] : '???';

                        return (
                            <div key={profile.id} className="group relative bg-black/20 hover:bg-black/40 border border-white/5 hover:border-blue-500/30 rounded-2xl transition-all shadow-lg hover:shadow-blue-900/10 hover:-translate-y-1 overflow-hidden">
                                {/* Clickable Main Area */}
                                <div className="p-5 cursor-pointer" onClick={() => onStart(profile)}>
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center space-x-4">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shadow-inner ${isProfit ? 'bg-green-500/10 text-green-400 ring-1 ring-green-500/20' : 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20'}`}>
                                                {profile.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="text-base font-bold text-white group-hover:text-blue-400 transition-colors">{profile.name}</div>
                                                <div className="text-[10px] text-zinc-500 font-medium">Last played: {formatDate(profile.lastPlayed)}</div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4 mb-2">
                                        <div className="bg-white/5 rounded-lg p-2">
                                            <div className="text-[9px] text-zinc-500 uppercase font-bold">Equity</div>
                                            <div className="text-sm font-mono font-bold text-zinc-200">${profile.account.equity.toLocaleString()}</div>
                                        </div>
                                        <div className="bg-white/5 rounded-lg p-2">
                                            <div className="text-[9px] text-zinc-500 uppercase font-bold">PnL %</div>
                                            <div className={`text-sm font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                                                {pnl >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer Action Area - Separated */}
                                <div className="flex justify-between items-center px-5 py-2 border-t border-white/5 bg-black/20 relative z-10">
                                     <div className="flex items-center space-x-2 cursor-pointer flex-1 py-1" onClick={() => onStart(profile)}>
                                         <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"></span>
                                         <span className="text-xs font-bold text-zinc-400">{mainSymbol}</span>
                                     </div>
                                     <button 
                                        type="button"
                                        onMouseDown={(e) => e.stopPropagation()} 
                                        onClick={(e) => { 
                                            e.stopPropagation(); 
                                            e.preventDefault();
                                            if(window.confirm('Delete this profile permanently?')) {
                                                onDelete(profile.id); 
                                            }
                                        }}
                                        className="text-zinc-600 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-all opacity-100 relative z-50 cursor-pointer"
                                        title="Delete Session"
                                     >
                                         <svg className="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                     </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {view === 'CREATE' && (
                <div className="max-w-md mx-auto space-y-6">
                    
                    {/* Name Input */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider ml-1">Session Name</label>
                        <input 
                            type="text" 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="input-bubble w-full rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500/50 outline-none transition-colors placeholder-zinc-600"
                            placeholder="e.g. Price Action Strategy"
                        />
                    </div>

                    {/* Balance Input */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider ml-1">Starting Balance</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">$</span>
                            <input 
                                type="number" 
                                value={balance}
                                onChange={(e) => setBalance(Number(e.target.value))}
                                className="input-bubble w-full rounded-xl pl-8 pr-4 py-3 text-sm text-white focus:border-blue-500/50 outline-none transition-colors font-mono"
                            />
                        </div>
                    </div>

                    {/* Single Asset Select */}
                    <div className="space-y-2 relative" ref={dropdownRef}>
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider ml-1">Asset Class</label>
                        <div 
                            className={`input-bubble w-full rounded-xl px-4 py-3 cursor-pointer focus-within:border-blue-500/50 transition-colors flex items-center justify-between hover:bg-white/5`}
                            onClick={() => setIsAssetDropdownOpen(!isAssetDropdownOpen)}
                        >
                            <div className="flex items-center space-x-3">
                                <span className={`w-2 h-2 rounded-full shadow-lg ${selectedSymbol === 'XAUUSD' ? 'bg-yellow-500 shadow-yellow-500/50' : 'bg-blue-500 shadow-blue-500/50'}`}></span>
                                <span className="font-bold text-sm text-white">{selectedSymbol || (validSymbols.length > 0 ? 'Select Asset' : 'No Assets')}</span>
                            </div>
                            <span className="text-zinc-500">
                                <svg className={`w-4 h-4 transition-transform ${isAssetDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </span>
                        </div>
                        
                        {isAssetDropdownOpen && (
                            <div className="absolute top-full left-0 w-full mt-2 glass-panel border border-white/10 rounded-xl shadow-2xl z-50 max-h-[400px] overflow-y-auto custom-scrollbar p-1">
                                {validSymbols.length > 0 ? (
                                    validSymbols.map(sym => (
                                        <div 
                                            key={sym} 
                                            onClick={() => { setSelectedSymbol(sym); setIsAssetDropdownOpen(false); }}
                                            className={`px-3 py-2.5 rounded-lg hover:bg-white/10 cursor-pointer flex items-center justify-between text-sm transition-colors mb-1 ${selectedSymbol === sym ? 'bg-blue-600/20 text-blue-300' : 'text-zinc-400'}`}
                                        >
                                            <span className="font-bold">{sym}</span>
                                            {selectedSymbol === sym && <span className="text-blue-500">✓</span>}
                                        </div>
                                    ))
                                ) : (
                                    <div className="px-3 py-4 text-center text-xs text-zinc-500 italic">
                                        No assets configured.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Dates */}
                    <div className="relative pt-2">
                        {isSyncingDates && (
                            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-10 rounded-xl backdrop-blur-sm border border-blue-500/20">
                                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                                <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider animate-pulse">Syncing Data...</span>
                            </div>
                        )}
                        <div className={`grid grid-cols-2 gap-4 ${isSyncingDates ? 'opacity-30' : ''}`}>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider ml-1">Start Date</label>
                                <input 
                                    type="date" 
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="input-bubble w-full rounded-xl px-3 py-2.5 text-sm text-white focus:border-blue-500/50 outline-none"
                                    disabled={isSyncingDates}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider ml-1">End Date</label>
                                <input 
                                    type="date" 
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="input-bubble w-full rounded-xl px-3 py-2.5 text-sm text-white focus:border-blue-500/50 outline-none"
                                    disabled={isSyncingDates}
                                />
                            </div>
                        </div>
                    </div>

                </div>
            )}
        </div>
        
        {/* Footer */}
        {view === 'CREATE' && (
            <div className="p-6 border-t border-white/5 flex justify-end space-x-4 bg-black/20">
                <button 
                    onClick={() => profiles.length > 0 ? setView('LIST') : {}}
                    className={`text-xs font-bold px-6 py-3 rounded-xl transition-colors uppercase tracking-wide ${profiles.length > 0 ? 'text-zinc-400 hover:text-white hover:bg-white/5' : 'text-zinc-700 cursor-not-allowed'}`}
                >
                    Cancel
                </button>
                <button 
                    onClick={handleCreate}
                    disabled={isSyncingDates}
                    className={`bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-xs font-bold px-8 py-3 rounded-xl transition-all shadow-lg shadow-blue-900/30 uppercase tracking-widest hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                    {isSyncingDates ? 'Syncing...' : 'Start Session'}
                </button>
            </div>
        )}
      </div>
    </div>
  );
};
