
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { AccountState, OrderStatus, Trade, TradeJournal, TimeframeType } from '../types';
import { 
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, 
    BarChart, Bar, Cell, LineChart, Line, ReferenceLine
} from 'recharts';
import { JournalModal } from './JournalModal';
import html2canvas from 'html2canvas';

interface Props {
  account: AccountState;
  sessionStart: number;
  currentSimTime: number;
  timePlayed: number; // Real-world seconds
  activeTimeframe: TimeframeType;
  onClose: () => void;
  onUpdateTrade?: (id: string, journal: TradeJournal) => void;
}

const MetricCard: React.FC<{ label: string; value: string; sub?: string; color?: string }> = ({ label, value, sub, color }) => (
    <div className="glass-panel p-4 rounded-xl flex flex-col justify-center bg-white/[0.02] border border-white/5">
        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">{label}</span>
        <span className={`text-xl font-mono font-black tracking-tight ${color || 'text-white'}`}>{value}</span>
        {sub && <span className="text-[10px] text-zinc-600 font-medium mt-1">{sub}</span>}
    </div>
);

export const DetailedStats: React.FC<Props> = ({ account, sessionStart, currentSimTime, timePlayed, activeTimeframe, onClose, onUpdateTrade }) => {
  const { history: trades, balance, maxDrawdown } = account;
  
  // Filter out cancelled pending orders. 
  // A valid trade must be CLOSED AND have an entryTime.
  const closedTrades = trades.filter(t => t.status === OrderStatus.CLOSED && t.entryTime !== undefined);
  
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [calendarDate, setCalendarDate] = useState(() => new Date(currentSimTime * 1000));

  // UPDATED: Segregate trades strictly
  const wins = closedTrades.filter(t => (t.pnl || 0) > 0);
  const losses = closedTrades.filter(t => (t.pnl || 0) < 0); // Strictly less than 0
  const breakEvens = closedTrades.filter(t => (t.pnl || 0) === 0); // Exactly 0

  const totalPnL = closedTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
  
  // Win Rate Calculation: Wins / (Wins + Losses). Exclude Break-evens from the ratio.
  const decisiveTrades = wins.length + losses.length;
  const winRate = decisiveTrades > 0 ? (wins.length / decisiveTrades) * 100 : 0;
  
  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + (b.pnl || 0), 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + (b.pnl || 0), 0) / losses.length : 0;
  
  // Expectancy per trade (including BEs is fairer for overall system value, or exclude them? Standard usually includes all "Valid" trades)
  // Let's stick to Total PnL / Total Trades (including BE) for Expectancy to show "Value per Click"
  const expectancy = closedTrades.length > 0 ? totalPnL / closedTrades.length : 0;

  let totalDuration = 0;
  closedTrades.forEach(t => { if (t.entryTime && t.closeTime) totalDuration += (t.closeTime - t.entryTime); });
  const avgDurationSeconds = closedTrades.length > 0 ? totalDuration / closedTrades.length : 0;

  const formatDuration = (seconds: number) => {
      if (!seconds && seconds !== 0) return "--";
      const absSeconds = Math.abs(seconds);
      
      const days = Math.floor(absSeconds / (3600 * 24));
      const hours = Math.floor((absSeconds % (3600 * 24)) / 3600);
      const minutes = Math.floor((absSeconds % 3600) / 60);
      const secs = Math.floor(absSeconds % 60);

      const parts = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0) parts.push(`${hours}h`);
      if (minutes > 0) parts.push(`${minutes}m`);
      if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

      return parts.join(' ');
  };

  const formatDate = (ts: number | undefined) => {
      if (!ts) return "--";
      return new Date(ts * 1000).toLocaleString('th-TH', { 
          day: '2-digit', month: 'short', year: '2-digit', 
          hour: '2-digit', minute: '2-digit', hour12: false 
      });
  };

  // UPDATED: R:R Calculation Logic for Average
  let totalRMultiple = 0;
  let countR = 0;
  closedTrades.forEach(t => {
      // Skip Break-Evens for R:R Avg to avoid skewing data
      if ((t.pnl || 0) === 0) return;

      // Fallback: Use current stopLoss if initialStopLoss is 0 (entry without SL)
      const effectiveSL = (t.initialStopLoss && t.initialStopLoss > 0) ? t.initialStopLoss : t.stopLoss;
      const riskDist = effectiveSL > 0 ? Math.abs(t.entryPrice - effectiveSL) : 0;

      if (riskDist > 0 && t.closePrice) {
          let priceMove = t.closePrice - t.entryPrice;
          if (t.side === 'SHORT') priceMove = -priceMove;
          
          const r = priceMove / riskDist;
          totalRMultiple += r;
          countR++;
      }
  });
  const avgRR = countR > 0 ? (totalRMultiple / countR) : 0;
  
  const initialBalance = balance - totalPnL;
  const gainPercent = ((balance - initialBalance) / initialBalance) * 100;

  let runningBalance = initialBalance;
  const equityData = [{ id: 0, balance: initialBalance, pnl: 0 }];
  closedTrades.forEach((t, i) => {
      runningBalance += (t.pnl || 0);
      equityData.push({ id: i + 1, balance: runningBalance, pnl: t.pnl || 0 });
  });

  const getHour = (ts: number) => new Date(ts * 1000).getHours();
  const getDay = (ts: number) => new Date(ts * 1000).getDay(); 
  const sessionData = [{ name: 'Asia', pnl: 0, count: 0, color: '#fcd34d' }, { name: 'London', pnl: 0, count: 0, color: '#3b82f6' }, { name: 'New York', pnl: 0, count: 0, color: '#a855f7' }];
  const dayData = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => ({ name: d, pnl: 0, count: 0 }));

  closedTrades.forEach(t => {
      if (!t.entryTime) return;
      const h = getHour(t.entryTime);
      const d = getDay(t.entryTime);
      dayData[d].pnl += (t.pnl || 0);
      dayData[d].count++;
      if (h >= 22 || h < 7) { sessionData[0].pnl += (t.pnl || 0); sessionData[0].count++; }
      else if (h >= 7 && h < 13) { sessionData[1].pnl += (t.pnl || 0); sessionData[1].count++; }
      else { sessionData[2].pnl += (t.pnl || 0); sessionData[2].count++; }
  });

  const getCalendarCells = () => {
      const year = calendarDate.getFullYear();
      const month = calendarDate.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const daysInMonth = lastDay.getDate();
      const startDayOffset = firstDay.getDay(); 
      const pnlMap: Record<string, number> = {};
      const tradeCountMap: Record<string, number> = {};
      closedTrades.forEach(t => {
          if (t.closeTime) {
              const d = new Date(t.closeTime * 1000);
              const dateKey = d.toLocaleDateString('en-CA'); 
              pnlMap[dateKey] = (pnlMap[dateKey] || 0) + (t.pnl || 0);
              tradeCountMap[dateKey] = (tradeCountMap[dateKey] || 0) + 1;
          }
      });
      const totalSlots = 42; 
      const cells = [];
      for (let i = 0; i < totalSlots; i++) {
          const dayNumber = i - startDayOffset + 1;
          if (dayNumber > 0 && dayNumber <= daysInMonth) {
               const currentDate = new Date(year, month, dayNumber);
               const dateKey = currentDate.toLocaleDateString('en-CA');
               const pnl = pnlMap[dateKey];
               const count = tradeCountMap[dateKey];
               let cellBg = "bg-white/5";
               let textColor = "text-zinc-500";
               let pnlText = "";
               if (pnl !== undefined) {
                   if (pnl > 0) { cellBg = "bg-green-500/10 hover:bg-green-500/20"; textColor = "text-green-400"; pnlText = `+${pnl.toFixed(0)}`; } 
                   else if (pnl < 0) { cellBg = "bg-red-500/10 hover:bg-red-500/20"; textColor = "text-red-400"; pnlText = `${pnl.toFixed(0)}`; } 
                   else { cellBg = "bg-white/10"; textColor = "text-zinc-400"; pnlText = "0"; }
               } else { cellBg = "bg-white/5 hover:bg-white/10"; }
               cells.push(
                   <div key={i} className={`relative p-2 flex flex-col justify-between transition-colors rounded-lg m-0.5 ${cellBg}`}>
                       <span className={`text-[11px] font-bold ${pnl !== undefined ? 'text-zinc-300' : 'text-zinc-600'}`}>{dayNumber}</span>
                       {pnl !== undefined && (
                           <div className="text-right mt-auto">
                               <div className={`text-xs font-black tracking-tight leading-none ${textColor}`}>{pnlText}</div>
                               <div className="text-[10px] text-zinc-500 font-medium leading-none mt-1">{count} trds</div>
                           </div>
                       )}
                   </div>
               );
          } else { cells.push(<div key={i} className=""></div>); }
      }
      return cells;
  };

  const changeMonth = (delta: number) => {
      setCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const handleExport = async () => {
      if (!dashboardRef.current) return;
      setIsExporting(true);
      try {
          await new Promise(resolve => setTimeout(resolve, 100));
          const canvas = await html2canvas(dashboardRef.current, { backgroundColor: '#09090b', scale: 2, useCORS: true, logging: false });
          const link = document.createElement('a');
          const dateStr = new Date().toISOString().split('T')[0];
          link.download = `ProTrade_Session_${dateStr}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
      } catch (e) { console.error("Export failed", e); alert("Could not export image."); } finally { setIsExporting(false); }
  };

  return (
    <div ref={dashboardRef} className="fixed inset-0 z-50 bg-[#09090b]/95 backdrop-blur-xl flex flex-col overflow-hidden animate-in fade-in duration-200 font-sans">
      
      {editingTradeId && onUpdateTrade && (
          <JournalModal 
             trade={closedTrades.find(t => t.id === editingTradeId)!}
             activeTimeframe={activeTimeframe} 
             onSave={onUpdateTrade} 
             onClose={() => setEditingTradeId(null)} 
          />
      )}

      {/* Header */}
      <div className="h-16 border-b border-white/5 bg-white/[0.02] flex items-center justify-between px-6 shrink-0" data-html2canvas-ignore>
          <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-black text-white tracking-tight uppercase">Dashboard <span className="text-blue-500">PRO</span></h1>
              <div className="h-6 w-[1px] bg-white/10"></div>
              <span className="text-sm font-mono text-zinc-400 hidden sm:block">SESSION ANALYTICS</span>
          </div>
          <div className="flex items-center space-x-3">
              <button onClick={handleExport} disabled={isExporting} className="flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase transition-colors disabled:opacity-50 shadow-lg shadow-blue-900/20">
                  {isExporting ? <span className="animate-pulse">Saving...</span> : <><span>Export PNG</span></>}
              </button>
              <button onClick={onClose} className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold uppercase transition-colors">Close</button>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
        <div className="max-w-[1600px] mx-auto space-y-6 pb-20">
            
            {/* KEY METRICS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                <MetricCard label="Total Trades" value={closedTrades.length.toString()} sub={`W:${wins.length} L:${losses.length} BE:${breakEvens.length}`} />
                <MetricCard label="Win Rate" value={`${winRate.toFixed(1)}%`} color={winRate > 50 ? 'text-green-400' : 'text-red-400'} />
                <MetricCard label="Expectancy" value={`$${expectancy.toFixed(2)}`} sub="Per Trade" color={expectancy > 0 ? 'text-green-400' : 'text-zinc-200'} />
                <MetricCard label="Avg Duration" value={formatDuration(avgDurationSeconds)} sub="Holding Time" />
                <MetricCard label="Avg R:R" value={`${avgRR > 0 ? '+' : ''}${avgRR.toFixed(2)}R`} sub="Realized" />
                <MetricCard label="Profit Factor" value={((wins.reduce((a,b)=>a+(b.pnl||0),0) / Math.abs(losses.reduce((a,b)=>a+(b.pnl||0),0))) || 0).toFixed(2)} />
                <MetricCard label="Net Profit" value={`$${totalPnL.toFixed(2)}`} color={totalPnL >= 0 ? 'text-green-400' : 'text-red-400'} />
                <MetricCard label="Gain" value={`${gainPercent.toFixed(2)}%`} color={gainPercent >= 0 ? 'text-green-400' : 'text-red-400'} />
            </div>

            {/* CHARTS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-panel rounded-2xl p-6 h-[400px] relative group bg-white/[0.02]">
                    <h3 className="text-sm font-bold text-zinc-400 uppercase mb-4 flex justify-between"><span>Equity Curve</span><span className="text-zinc-600">Realized PnL</span></h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={equityData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorEq" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', color: '#fff', fontSize: '14px', borderRadius: '8px' }} 
                                itemStyle={{ color: '#3b82f6' }} 
                                formatter={(val: number) => [`$${val.toFixed(2)}`, 'Balance']} 
                                animationDuration={0}
                            />
                            <Area type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorEq)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                <div className="glass-panel rounded-2xl p-6 h-[400px] flex flex-col bg-white/[0.02]">
                     <div className="flex justify-between items-center mb-4">
                        <h3 className="text-sm font-bold text-zinc-400 uppercase">Calendar PnL</h3>
                        <div className="flex items-center space-x-2">
                            <button onClick={() => changeMonth(-1)} className="text-zinc-400 hover:text-white"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
                            <span className="text-sm font-bold text-white min-w-[120px] text-center">{calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                            <button onClick={() => changeMonth(1)} className="text-zinc-400 hover:text-white"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                        </div>
                     </div>
                     <div className="flex-1 flex flex-col rounded-xl overflow-hidden bg-black/20 border border-white/5">
                         <div className="grid grid-cols-7 border-b border-white/5 bg-white/5">
                             {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => <div key={d} className="text-center py-2 text-[11px] text-zinc-500 font-bold uppercase">{d}</div>)}
                         </div>
                         <div className="grid grid-cols-7 grid-rows-6 gap-0.5 p-1 flex-1">
                             {getCalendarCells()}
                         </div>
                     </div>
                </div>
            </div>

            {/* PERFORMANCE BREAKDOWN */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-panel rounded-2xl p-6 h-72 bg-white/[0.02]">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase mb-4">Session</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sessionData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                            <XAxis dataKey="name" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                            <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', fontSize: '12px', borderRadius: '8px' }} animationDuration={0} />
                            <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>{sessionData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#4ade80' : '#f87171'} />)}</Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="glass-panel rounded-2xl p-6 h-72 bg-white/[0.02]">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase mb-4">Day of Week</h3>
                    <ResponsiveContainer width="100%" height="100%">
                         <BarChart data={dayData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                            <XAxis dataKey="name" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                            <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', fontSize: '12px', borderRadius: '8px' }} animationDuration={0} />
                            <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>{dayData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#4ade80' : '#f87171'} />)}</Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="glass-panel rounded-2xl p-6 h-72 flex flex-col justify-center space-y-8 bg-white/[0.02]">
                    <div>
                        <div className="text-[11px] text-zinc-500 font-bold uppercase mb-1">Avg Win</div>
                        <div className="text-3xl font-black text-green-400">${avgWin.toFixed(2)}</div>
                        <div className="w-full bg-white/5 h-2 mt-2 rounded-full overflow-hidden"><div className="h-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" style={{width: '100%'}}></div></div>
                    </div>
                    <div>
                        <div className="text-[11px] text-zinc-500 font-bold uppercase mb-1">Avg Loss</div>
                        <div className="text-3xl font-black text-red-400">-${Math.abs(avgLoss).toFixed(2)}</div>
                         <div className="w-full bg-white/5 h-2 mt-2 rounded-full overflow-hidden"><div className="h-full bg-red-500 shadow-[0_0_10px_rgba(248,113,113,0.5)]" style={{width: `${Math.min(100, (Math.abs(avgLoss)/avgWin)*100)}%`}}></div></div>
                    </div>
                </div>
            </div>

            {/* TRADE JOURNAL LIST */}
            <div className="glass-panel rounded-2xl overflow-hidden bg-white/[0.02] border border-white/5">
                <div className="p-5 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-zinc-300 uppercase">Trade Journal</h3>
                    <span className="text-xs text-zinc-500">Click row to edit</span>
                </div>
                <div className="overflow-x-auto w-full">
                    <table className="w-full text-left min-w-[700px]">
                        <thead>
                            <tr className="border-b border-white/5 text-[11px] uppercase text-zinc-500 font-bold bg-black/20">
                                <th className="p-4">#</th>
                                <th className="p-4">Type</th>
                                <th className="p-4">Time (Open/Close)</th>
                                <th className="p-4">Entry/Exit</th>
                                <th className="p-4">Duration</th>
                                <th className="p-4">R:R (Real / Plan)</th>
                                <th className="p-4">Journal</th>
                                <th className="p-4 text-right">P/L</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm font-mono">
                            {closedTrades.slice().reverse().map((t, idx) => {
                                const duration = (t.closeTime && t.entryTime) ? (t.closeTime - t.entryTime) : 0;
                                
                                // UPDATED: Detailed R:R Calculation
                                // Fallback: Use current stopLoss if initialStopLoss is 0 (entry without SL)
                                const effectiveSL = (t.initialStopLoss && t.initialStopLoss > 0) ? t.initialStopLoss : t.stopLoss;
                                const riskDist = effectiveSL > 0 ? Math.abs(t.entryPrice - effectiveSL) : 0;
                                
                                let rrDisplay = <span className="text-zinc-600">---</span>;
                                const isBreakEven = (t.pnl || 0) === 0;
                                
                                if (riskDist > 0 && t.closePrice && !isBreakEven) {
                                    // Calculate Price Move based on Direction
                                    let priceMove = t.closePrice - t.entryPrice;
                                    if (t.side === 'SHORT') priceMove = -priceMove;
                                    
                                    const realizedR = priceMove / riskDist;
                                    const isWin = realizedR >= 0;
                                    
                                    // Planned R:R (Target)
                                    let plannedRRStr = "";
                                    if (t.takeProfit > 0) {
                                        const rewardDist = Math.abs(t.takeProfit - t.entryPrice);
                                        const plannedRatio = rewardDist / riskDist;
                                        plannedRRStr = `Target: ${plannedRatio.toFixed(2)}R`;
                                    }

                                    rrDisplay = (
                                        <div className="flex flex-col">
                                            <span className={`font-black ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                                                {isWin ? '+' : ''}{realizedR.toFixed(2)}R
                                            </span>
                                            {plannedRRStr && (
                                                <span className="text-[10px] text-zinc-500 font-bold">{plannedRRStr}</span>
                                            )}
                                        </div>
                                    );
                                } else if (isBreakEven) {
                                    rrDisplay = <span className="text-[10px] font-bold text-zinc-500 bg-white/5 px-2 py-1 rounded">BREAK EVEN</span>;
                                }

                                return (
                                    <tr 
                                        key={t.id} 
                                        onClick={() => onUpdateTrade && setEditingTradeId(t.id)}
                                        className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer group"
                                    >
                                        <td className="p-4 text-zinc-500">{closedTrades.length - idx}</td>
                                        <td className="p-4">
                                            <div className="flex flex-col">
                                                <span className={`font-black text-xs ${t.side === 'LONG' ? 'text-green-500' : 'text-red-500'}`}>{t.side}</span>
                                                <span className="text-xs font-bold text-zinc-400 mt-0.5">{t.symbol}</span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-col text-xs font-mono font-medium text-zinc-300">
                                                <span>{formatDate(t.entryTime)}</span>
                                                <span className="text-zinc-500">{formatDate(t.closeTime)}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-zinc-400">
                                            <div>{t.entryPrice.toFixed(5)}</div>
                                            <div className="text-[11px] opacity-60">➜ {t.closePrice?.toFixed(5)}</div>
                                        </td>
                                        <td className="p-4 text-zinc-300">
                                            {formatDuration(duration)}
                                        </td>
                                        <td className="p-4">
                                             {rrDisplay}
                                        </td>
                                        <td className="p-4 max-w-[200px] truncate">
                                            {t.journal?.tags && t.journal.tags.length > 0 ? (
                                                <div className="flex gap-1 flex-wrap">
                                                    {t.journal.tags.map(tag => (
                                                        <span key={tag} className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-300 text-[10px] font-sans border border-blue-500/20 whitespace-nowrap">{tag}</span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-zinc-600 italic group-hover:text-blue-400">+ Note</span>
                                            )}
                                        </td>
                                        <td className={`p-4 text-right font-black ${(t.pnl || 0) > 0 ? 'text-green-400' : (t.pnl || 0) < 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                                            ${(t.pnl || 0).toFixed(2)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};
