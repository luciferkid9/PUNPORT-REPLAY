
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { AccountState, OrderStatus, Trade, TradeJournal, TimeframeType, KillZoneConfig } from '../types';
import { 
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, 
    BarChart, Bar, Cell, LineChart, Line, ReferenceLine
} from 'recharts';
import { JournalModal } from './JournalModal';

interface Props {
  account: AccountState;
  sessionStart: number;
  currentSimTime: number;
  timePlayed: number; // Real-world seconds
  activeTimeframe: TimeframeType;
  killZoneConfig: KillZoneConfig; // NEW PROP
  onClose: () => void;
  onUpdateTrade?: (id: string, journal: TradeJournal) => void;
}

// Helper for consistency
const formatCurrency = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MetricCard: React.FC<{ label: string; value: string; sub?: string; color?: string }> = ({ label, value, sub, color }) => (
    <div className="glass-panel p-4 rounded-xl flex flex-col justify-center bg-white/[0.02] border border-white/5">
        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">{label}</span>
        <span className={`text-xl font-mono font-black tracking-tight ${color || 'text-white'}`}>{value}</span>
        {sub && <span className="text-[10px] text-zinc-600 font-medium mt-1">{sub}</span>}
    </div>
);

// --- THAI TIMEZONE HELPERS ---
const getThaiParts = (ts: number) => {
    const date = new Date(ts * 1000);
    // Get Hour (0-23) in Bangkok
    const hourStr = date.toLocaleString('en-US', { timeZone: 'Asia/Bangkok', hour: 'numeric', hour12: false });
    // Get Weekday (Sun, Mon...) in Bangkok
    const weekdayStr = date.toLocaleString('en-US', { timeZone: 'Asia/Bangkok', weekday: 'short' });
    
    return {
        hour: parseInt(hourStr === '24' ? '0' : hourStr), // Handle possible '24' edge case
        weekday: weekdayStr
    };
};

const formatDateThai = (ts: number | undefined) => {
    if (!ts) return "--";
    return new Date(ts * 1000).toLocaleString('th-TH', { 
        timeZone: 'Asia/Bangkok',
        day: '2-digit', month: 'short', year: '2-digit', 
        hour: '2-digit', minute: '2-digit', hour12: false 
    });
};

const isHourInSession = (hour: number, startStr: string, endStr: string): boolean => {
    const start = parseInt(startStr.split(':')[0]);
    const end = parseInt(endStr.split(':')[0]);
    
    if (isNaN(start) || isNaN(end)) return false;

    if (start < end) {
        // Standard range (e.g. 08:00 to 17:00)
        return hour >= start && hour < end;
    } else {
        // Overnight range (e.g. 22:00 to 05:00)
        return hour >= start || hour < end;
    }
};

export const DetailedStats: React.FC<Props> = ({ account, sessionStart, currentSimTime, timePlayed, activeTimeframe, killZoneConfig, onClose, onUpdateTrade }) => {
  const { history: trades, balance, maxDrawdown } = account;
  
  const closedTrades = trades.filter(t => t.status === OrderStatus.CLOSED && t.entryTime !== undefined);
  
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [calendarDate, setCalendarDate] = useState(() => new Date(currentSimTime * 1000));

  const wins = closedTrades.filter(t => (t.pnl || 0) > 0);
  const losses = closedTrades.filter(t => (t.pnl || 0) < 0); 
  const breakEvens = closedTrades.filter(t => (t.pnl || 0) === 0); 

  const totalPnL = closedTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
  
  const decisiveTrades = wins.length + losses.length;
  const winRate = decisiveTrades > 0 ? (wins.length / decisiveTrades) * 100 : 0;
  
  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + (b.pnl || 0), 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + (b.pnl || 0), 0) / losses.length : 0;
  
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

  let totalRMultiple = 0;
  let countR = 0;
  closedTrades.forEach(t => {
      if ((t.pnl || 0) === 0) return;
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
  const profitFactor = ((wins.reduce((a,b)=>a+(b.pnl||0),0) / Math.abs(losses.reduce((a,b)=>a+(b.pnl||0),0))) || 0);

  let runningBalance = initialBalance;
  const equityData = [{ id: 0, balance: initialBalance, pnl: 0 }];
  closedTrades.forEach((t, i) => {
      runningBalance += (t.pnl || 0);
      equityData.push({ id: i + 1, balance: runningBalance, pnl: t.pnl || 0 });
  });

  const minEquity = Math.min(...equityData.map(d => d.balance));
  const maxEquity = Math.max(...equityData.map(d => d.balance));
  const padding = (maxEquity - minEquity) * 0.1 || (maxEquity * 0.01);
  const domainMin = minEquity - padding;
  const domainMax = maxEquity + padding;

  // DYNAMIC SESSION CONFIGURATION
  const sessionData = [
      { name: killZoneConfig.asian.label, pnl: 0, count: 0, color: killZoneConfig.asian.color, key: 'asian' }, 
      { name: killZoneConfig.london.label, pnl: 0, count: 0, color: killZoneConfig.london.color, key: 'london' }, 
      { name: killZoneConfig.ny.label, pnl: 0, count: 0, color: killZoneConfig.ny.color, key: 'ny' }
  ];
  
  const dayData = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => ({ name: d, pnl: 0, count: 0 }));

  closedTrades.forEach(t => {
      if (!t.entryTime) return;
      const { hour, weekday } = getThaiParts(t.entryTime);
      
      const dayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
      if (dayIndex !== -1) {
          dayData[dayIndex].pnl += (t.pnl || 0);
          dayData[dayIndex].count++;
      }

      // CHECK SESSIONS BASED ON CONFIG
      // Priority Logic: Asia -> London -> NY (Matches array order)
      // This handles overlaps by assigning to the first match in the list.
      if (killZoneConfig.asian.enabled && isHourInSession(hour, killZoneConfig.asian.start, killZoneConfig.asian.end)) {
          sessionData[0].pnl += (t.pnl || 0); sessionData[0].count++;
      } else if (killZoneConfig.london.enabled && isHourInSession(hour, killZoneConfig.london.start, killZoneConfig.london.end)) {
          sessionData[1].pnl += (t.pnl || 0); sessionData[1].count++;
      } else if (killZoneConfig.ny.enabled && isHourInSession(hour, killZoneConfig.ny.start, killZoneConfig.ny.end)) {
          sessionData[2].pnl += (t.pnl || 0); sessionData[2].count++;
      }
  });

  const getCalendarCellsData = () => {
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
              // Convert trade close time to Thai Date String for correct daily bucketing
              const d = new Date(t.closeTime * 1000);
              const dateKey = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
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
               // Use local string match since we built current month locally, 
               // but assume the user is viewing months relative to where they are roughly.
               // Ideally, the calendar navigation should also handle TZ, but for simplicity:
               const dateKey = currentDate.toLocaleDateString('en-CA');
               const pnl = pnlMap[dateKey];
               const count = tradeCountMap[dateKey];
               cells.push({ day: dayNumber, pnl, count });
          } else { 
               cells.push(null); 
          }
      }
      return cells;
  };

  const getCalendarCells = () => {
      const data = getCalendarCellsData();
      return data.map((d, i) => {
          if (!d) return <div key={i}></div>;
          let cellBg = "bg-white/5";
          let textColor = "text-zinc-500";
          let pnlText = "";
          if (d.pnl !== undefined) {
               if (d.pnl > 0) { cellBg = "bg-green-500/10 hover:bg-green-500/20"; textColor = "text-green-400"; pnlText = `+${d.pnl.toFixed(0)}`; } 
               else if (d.pnl < 0) { cellBg = "bg-red-500/10 hover:bg-red-500/20"; textColor = "text-red-400"; pnlText = `${d.pnl.toFixed(0)}`; } 
               else { cellBg = "bg-white/10"; textColor = "text-zinc-400"; pnlText = "0"; }
          }
          return (
               <div key={i} className={`relative p-2 flex flex-col justify-between transition-colors rounded-lg m-0.5 ${cellBg}`}>
                   <span className={`text-[11px] font-bold ${d.pnl !== undefined ? 'text-zinc-300' : 'text-zinc-600'}`}>{d.day}</span>
                   {d.pnl !== undefined && (
                       <div className="text-right mt-auto">
                           <div className={`text-xs font-black tracking-tight leading-none ${textColor}`}>{pnlText}</div>
                           <div className="text-[10px] text-zinc-500 font-medium leading-none mt-1">{d.count} trds</div>
                       </div>
                   )}
               </div>
          );
      });
  };

  const changeMonth = (delta: number) => {
      setCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const handleExportHTML = () => {
      if (closedTrades.length === 0 && equityData.length === 1) {
          alert("No data to export.");
          return;
      }
      setIsExporting(true);

      setTimeout(() => {
          const chartLabels = equityData.map(d => d.id);
          const chartPoints = equityData.map(d => d.balance);
          
          const sessionLabels = sessionData.map(d => d.name);
          const sessionPnLs = sessionData.map(d => d.pnl);
          const sessionColors = sessionData.map(d => d.pnl >= 0 ? '#4ade80' : '#f87171');

          const dayLabels = dayData.map(d => d.name);
          const dayPnLs = dayData.map(d => d.pnl);
          const dayColors = dayData.map(d => d.pnl >= 0 ? '#4ade80' : '#f87171');

          const tradesJson = JSON.stringify(closedTrades);

          const metricsHtml = `
            <div class="grid grid-cols-4 gap-4 mb-6">
                <div class="p-4 bg-white/5 rounded-xl border border-white/10">
                    <div class="text-[10px] text-zinc-500 font-bold uppercase">Total Trades</div>
                    <div class="text-xl font-bold text-white">${closedTrades.length}</div>
                    <div class="text-[10px] text-zinc-600 mt-1">W:${wins.length} L:${losses.length} BE:${breakEvens.length}</div>
                </div>
                <div class="p-4 bg-white/5 rounded-xl border border-white/10">
                    <div class="text-[10px] text-zinc-500 font-bold uppercase">Win Rate</div>
                    <div class="text-xl font-bold ${winRate >= 50 ? 'text-green-400' : 'text-red-400'}">${winRate.toFixed(1)}%</div>
                </div>
                <div class="p-4 bg-white/5 rounded-xl border border-white/10">
                    <div class="text-[10px] text-zinc-500 font-bold uppercase">Expectancy</div>
                    <div class="text-xl font-bold ${expectancy > 0 ? 'text-green-400' : 'text-zinc-200'}">$${formatCurrency(expectancy)}</div>
                    <div class="text-[10px] text-zinc-600 mt-1">Per Trade</div>
                </div>
                <div class="p-4 bg-white/5 rounded-xl border border-white/10">
                    <div class="text-[10px] text-zinc-500 font-bold uppercase">Avg Duration</div>
                    <div class="text-xl font-bold text-white">${formatDuration(avgDurationSeconds)}</div>
                </div>
                <div class="p-4 bg-white/5 rounded-xl border border-white/10">
                    <div class="text-[10px] text-zinc-500 font-bold uppercase">Avg R:R</div>
                    <div class="text-xl font-bold text-white">${avgRR > 0 ? '+' : ''}${avgRR.toFixed(2)}R</div>
                </div>
                <div class="p-4 bg-white/5 rounded-xl border border-white/10">
                    <div class="text-[10px] text-zinc-500 font-bold uppercase">Profit Factor</div>
                    <div class="text-xl font-bold text-white">${profitFactor.toFixed(2)}</div>
                </div>
                <div class="p-4 bg-white/5 rounded-xl border border-white/10">
                    <div class="text-[10px] text-zinc-500 font-bold uppercase">Net Profit</div>
                    <div class="text-xl font-bold ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}">$${formatCurrency(totalPnL)}</div>
                </div>
                <div class="p-4 bg-white/5 rounded-xl border border-white/10">
                    <div class="text-[10px] text-zinc-500 font-bold uppercase">Gain</div>
                    <div class="text-xl font-bold ${gainPercent >= 0 ? 'text-green-400' : 'text-red-400'}">${gainPercent.toFixed(2)}%</div>
                </div>
            </div>
          `;

          const avgBarsHtml = `
            <div class="bg-black/20 rounded-xl border border-white/5 p-6 h-full flex flex-col justify-center space-y-8">
                <div>
                    <div class="text-[11px] text-zinc-500 font-bold uppercase mb-1">Avg Win</div>
                    <div class="text-3xl font-black text-green-400">$${formatCurrency(avgWin)}</div>
                    <div class="w-full bg-white/5 h-2 mt-2 rounded-full overflow-hidden"><div class="h-full bg-green-500" style="width: 100%; box-shadow: 0 0 10px rgba(34,197,94,0.5);"></div></div>
                </div>
                <div>
                    <div class="text-[11px] text-zinc-500 font-bold uppercase mb-1">Avg Loss</div>
                    <div class="text-3xl font-black text-red-400">-$${formatCurrency(Math.abs(avgLoss))}</div>
                    <div class="w-full bg-white/5 h-2 mt-2 rounded-full overflow-hidden"><div class="h-full bg-red-500" style="width: ${Math.min(100, (Math.abs(avgLoss)/avgWin)*100)}%; box-shadow: 0 0 10px rgba(248,113,113,0.5);"></div></div>
                </div>
            </div>
          `;

          const htmlContent = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>ProTrade Report - ${new Date().toLocaleDateString()}</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
                <style>
                    body { background-color: #09090b; color: #e4e4e7; font-family: sans-serif; }
                    .glass-panel { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(10px); }
                    ::-webkit-scrollbar { width: 6px; height: 6px; }
                    ::-webkit-scrollbar-track { background: transparent; }
                    ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 99px; }
                    .trade-row:hover { background-color: rgba(255,255,255,0.05); cursor: pointer; }
                </style>
            </head>
            <body class="p-8 max-w-[1400px] mx-auto pb-20 relative">
                
                <div id="trade-modal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm hidden opacity-0 transition-opacity duration-200">
                    <div class="glass-panel border border-white/10 rounded-2xl shadow-2xl w-[95%] max-w-2xl max-h-[90vh] flex flex-col overflow-hidden bg-[#09090b] transform scale-95 transition-transform duration-200" id="modal-content">
                        <div class="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-white/[0.02]">
                            <div class="flex items-center space-x-4">
                                <span id="modal-side" class="text-sm font-black px-3 py-1.5 rounded-lg shadow-sm tracking-wide"></span>
                                <div class="flex flex-col">
                                    <span class="text-xl font-bold text-white leading-none mb-1"><span id="modal-symbol"></span> <span id="modal-id" class="text-zinc-500 text-sm font-normal"></span></span>
                                    <span id="modal-pnl" class="text-lg font-mono font-bold leading-none"></span>
                                </div>
                            </div>
                            <button onclick="closeModal()" class="text-zinc-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 p-2.5 rounded-lg">✕</button>
                        </div>
                        <div class="p-6 space-y-6 overflow-y-auto">
                            <div class="bg-[#18181b] border border-white/10 rounded-xl h-64 flex flex-col items-center justify-center text-zinc-500">
                                <span class="text-xs uppercase font-bold tracking-widest mb-2">Interactive Chart Snapshot</span>
                                <span class="text-[10px] opacity-60">Chart data is not included in this export file.</span>
                                <span class="text-[10px] opacity-60">Please refer to Trade Notes below.</span>
                            </div>
                            <div class="grid grid-cols-2 gap-4 text-xs">
                                <div class="bg-white/5 p-3 rounded-lg">
                                    <span class="block text-zinc-500 font-bold uppercase mb-1">Entry</span>
                                    <span id="modal-entry" class="font-mono text-white text-sm"></span>
                                </div>
                                <div class="bg-white/5 p-3 rounded-lg">
                                    <span class="block text-zinc-500 font-bold uppercase mb-1">Exit</span>
                                    <span id="modal-exit" class="font-mono text-white text-sm"></span>
                                </div>
                                <div class="bg-white/5 p-3 rounded-lg">
                                    <span class="block text-zinc-500 font-bold uppercase mb-1">Time Open (Thai)</span>
                                    <span id="modal-time-open" class="font-mono text-zinc-300"></span>
                                </div>
                                <div class="bg-white/5 p-3 rounded-lg">
                                    <span class="block text-zinc-500 font-bold uppercase mb-1">Time Close (Thai)</span>
                                    <span id="modal-time-close" class="font-mono text-zinc-300"></span>
                                </div>
                            </div>
                            <div>
                                <h4 class="text-xs font-bold text-zinc-400 uppercase mb-2">Tags</h4>
                                <div id="modal-tags" class="flex flex-wrap gap-2"></div>
                            </div>
                            <div>
                                <h4 class="text-xs font-bold text-zinc-400 uppercase mb-2">Notes</h4>
                                <p id="modal-notes" class="text-sm text-zinc-300 leading-relaxed bg-white/5 p-4 rounded-xl font-mono whitespace-pre-wrap"></p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="flex justify-between items-center mb-8 pb-4 border-b border-white/10">
                    <div>
                        <h1 class="text-3xl font-black text-white uppercase tracking-tight">ProTrade <span class="text-blue-500">Report</span></h1>
                        <p class="text-zinc-500 text-xs font-mono mt-1 uppercase tracking-widest">Session Analytics • ${new Date().toLocaleString()}</p>
                    </div>
                    <div class="text-right">
                        <div class="text-[10px] text-zinc-500 font-bold uppercase">Account Balance</div>
                        <div class="text-2xl font-mono font-bold text-white">$${formatCurrency(balance)}</div>
                    </div>
                </div>

                ${metricsHtml}

                <div class="grid grid-cols-2 gap-6 mb-6">
                    <div class="glass-panel rounded-2xl p-6 border border-white/10 h-[400px]">
                        <h3 class="text-xs font-bold text-zinc-400 uppercase mb-4 tracking-widest">Equity Curve</h3>
                        <div class="h-[320px] w-full">
                            <canvas id="equityChart"></canvas>
                        </div>
                    </div>
                    <div class="glass-panel rounded-2xl p-6 border border-white/10 h-[400px] flex flex-col">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-xs font-bold text-zinc-400 uppercase tracking-widest">Calendar PnL</h3>
                            <div class="flex items-center space-x-2">
                                <button onclick="changeMonth(-1)" class="text-zinc-400 hover:text-white"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
                                <span id="calendar-month-label" class="text-sm font-bold text-white min-w-[120px] text-center"></span>
                                <button onclick="changeMonth(1)" class="text-zinc-400 hover:text-white"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                            </div>
                        </div>
                        <div class="flex-1 flex flex-col rounded-xl overflow-hidden bg-black/20 border border-white/5">
                             <div class="grid grid-cols-7 border-b border-white/5 bg-white/5">
                                 ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<div class="text-center py-2 text-[11px] text-zinc-500 font-bold uppercase">${d}</div>`).join('')}
                             </div>
                             <div id="calendar-grid" class="grid grid-cols-7 grid-rows-6 gap-0.5 p-1 flex-1"></div>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-3 gap-6 mb-8">
                    <div class="glass-panel rounded-2xl p-6 border border-white/10 h-72">
                        <h3 class="text-xs font-bold text-zinc-400 uppercase mb-4">Session Performance (Thai Time)</h3>
                        <div class="h-56 w-full"><canvas id="sessionChart"></canvas></div>
                    </div>
                    <div class="glass-panel rounded-2xl p-6 border border-white/10 h-72">
                        <h3 class="text-xs font-bold text-zinc-400 uppercase mb-4">Day Breakdown</h3>
                        <div class="h-56 w-full"><canvas id="dayChart"></canvas></div>
                    </div>
                    <div class="glass-panel rounded-2xl p-0 border border-white/10 h-72 overflow-hidden">
                        ${avgBarsHtml}
                    </div>
                </div>

                <div class="glass-panel rounded-2xl overflow-hidden border border-white/10">
                    <div class="p-4 border-b border-white/10 bg-white/5">
                        <h3 class="text-xs font-bold text-zinc-300 uppercase tracking-widest">Trade History</h3>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left">
                            <thead class="bg-black/20 text-[10px] uppercase font-bold text-zinc-500">
                                <tr>
                                    <th class="p-3">ID</th>
                                    <th class="p-3">Type</th>
                                    <th class="p-3">Details</th>
                                    <th class="p-3">Entry / Exit</th>
                                    <th class="p-3">Duration</th>
                                    <th class="p-3 text-right">Profit/Loss</th>
                                </tr>
                            </thead>
                            <tbody id="trade-list-body"></tbody>
                        </table>
                    </div>
                </div>

                <script>
                    const trades = ${tradesJson};
                    const chartLabels = ${JSON.stringify(chartLabels)};
                    const chartPoints = ${JSON.stringify(chartPoints)};
                    const sessionLabels = ${JSON.stringify(sessionLabels)};
                    const sessionPnLs = ${JSON.stringify(sessionPnLs)};
                    const sessionColors = ${JSON.stringify(sessionColors)};
                    const dayLabels = ${JSON.stringify(dayLabels)};
                    const dayPnLs = ${JSON.stringify(dayPnLs)};
                    const dayColors = ${JSON.stringify(dayColors)};

                    let currentDate = new Date(${currentSimTime * 1000});

                    function renderCalendar() {
                        const year = currentDate.getFullYear();
                        const month = currentDate.getMonth();
                        
                        document.getElementById('calendar-month-label').innerText = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

                        const firstDay = new Date(year, month, 1);
                        const lastDay = new Date(year, month + 1, 0);
                        const daysInMonth = lastDay.getDate();
                        const startDayOffset = firstDay.getDay();

                        const pnlMap = {};
                        const countMap = {};
                        trades.forEach(t => {
                            if (t.closeTime) {
                                const d = new Date(t.closeTime * 1000);
                                if (d.getFullYear() === year && d.getMonth() === month) {
                                    const day = d.getDate();
                                    pnlMap[day] = (pnlMap[day] || 0) + (t.pnl || 0);
                                    countMap[day] = (countMap[day] || 0) + 1;
                                }
                            }
                        });

                        let html = '';
                        const totalSlots = 42;
                        for (let i = 0; i < totalSlots; i++) {
                            const dayNumber = i - startDayOffset + 1;
                            if (dayNumber > 0 && dayNumber <= daysInMonth) {
                                const pnl = pnlMap[dayNumber];
                                const count = countMap[dayNumber];
                                
                                let cellBg = "bg-white/5";
                                let textColor = "text-zinc-500";
                                let pnlText = "";
                                if (pnl !== undefined) {
                                    if (pnl > 0) { cellBg = "bg-green-500/10"; textColor = "text-green-400"; pnlText = "+" + pnl.toFixed(0); }
                                    else if (pnl < 0) { cellBg = "bg-red-500/10"; textColor = "text-red-400"; pnlText = pnl.toFixed(0); }
                                    else { cellBg = "bg-white/10"; textColor = "text-zinc-400"; pnlText = "0"; }
                                }

                                html += \`
                                    <div class="relative p-2 flex flex-col justify-between transition-colors rounded-lg m-0.5 \${cellBg}">
                                        <span class="text-[11px] font-bold \${pnl !== undefined ? 'text-zinc-300' : 'text-zinc-600'}">\${dayNumber}</span>
                                        \${pnl !== undefined ? \`
                                            <div class="text-right mt-auto">
                                                <div class="text-xs font-black tracking-tight leading-none \${textColor}">\${pnlText}</div>
                                                <div class="text-[10px] text-zinc-500 font-medium leading-none mt-1">\${count} trds</div>
                                            </div>
                                        \` : ''}
                                    </div>
                                \`;
                            } else {
                                html += '<div></div>';
                            }
                        }
                        document.getElementById('calendar-grid').innerHTML = html;
                    }

                    function changeMonth(delta) {
                        currentDate.setMonth(currentDate.getMonth() + delta);
                        renderCalendar();
                    }

                    function renderTradeList() {
                        const tbody = document.getElementById('trade-list-body');
                        let html = '';
                        [...trades].reverse().forEach(t => {
                            const pnl = t.pnl || 0;
                            const pnlColor = pnl >= 0 ? 'text-green-400' : 'text-red-400';
                            const sideColor = t.side === 'LONG' ? 'text-green-500' : 'text-red-500';
                            const duration = (t.closeTime && t.entryTime) ? (t.closeTime - t.entryTime) : 0;
                            
                            const formatTime = (ts) => ts ? new Date(ts * 1000).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : '--';
                            const formatDur = (s) => {
                                if(!s) return '--';
                                const h = Math.floor(s/3600);
                                const m = Math.floor((s%3600)/60);
                                return (h>0 ? h+'h ' : '') + m + 'm';
                            };

                            html += \`
                                <tr class="border-b border-white/5 trade-row transition-colors" onclick="openModal('\${t.id}')">
                                    <td class="p-3 text-zinc-500 font-mono text-xs">#\${t.id.substr(0,4)}</td>
                                    <td class="p-3 font-bold text-xs \${sideColor}">\${t.side}</td>
                                    <td class="p-3 text-xs">
                                        <div class="font-bold text-zinc-300">\${t.symbol}</div>
                                        <div class="text-[10px] text-zinc-600">\${formatTime(t.entryTime)}</div>
                                    </td>
                                    <td class="p-3 font-mono text-zinc-400">\${t.entryPrice.toFixed(5)} <span class="opacity-50">➜</span> \${t.closePrice?.toFixed(5)}</td>
                                    <td class="p-3 font-mono text-xs text-zinc-400">\${formatDur(duration)}</td>
                                    <td class="p-3 font-bold text-xs text-right \${pnlColor}">$\${pnl.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                                </tr>
                            \`;
                        });
                        tbody.innerHTML = html;
                    }

                    function openModal(id) {
                        const t = trades.find(tr => tr.id === id);
                        if (!t) return;

                        const modal = document.getElementById('trade-modal');
                        const content = document.getElementById('modal-content');
                        
                        document.getElementById('modal-side').innerText = t.side;
                        document.getElementById('modal-side').className = \`text-sm font-black px-3 py-1.5 rounded-lg shadow-sm tracking-wide \${t.side === 'LONG' ? 'bg-green-500 text-zinc-900' : 'bg-red-500 text-white'}\`;
                        
                        document.getElementById('modal-symbol').innerText = t.symbol;
                        document.getElementById('modal-id').innerText = '#' + t.id.substr(0,4);
                        
                        const pnl = t.pnl || 0;
                        const pnlEl = document.getElementById('modal-pnl');
                        pnlEl.innerText = (pnl >= 0 ? '+' : '') + '$' + pnl.toLocaleString('en-US', {minimumFractionDigits: 2});
                        pnlEl.className = \`text-lg font-mono font-bold leading-none \${pnl >= 0 ? 'text-green-400' : 'text-red-400'}\`;

                        document.getElementById('modal-entry').innerText = t.entryPrice.toFixed(5);
                        document.getElementById('modal-exit').innerText = t.closePrice?.toFixed(5) || '--';
                        document.getElementById('modal-time-open').innerText = new Date(t.entryTime * 1000).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
                        document.getElementById('modal-time-close').innerText = t.closeTime ? new Date(t.closeTime * 1000).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : '--';

                        const tagsContainer = document.getElementById('modal-tags');
                        if (t.journal && t.journal.tags && t.journal.tags.length > 0) {
                            tagsContainer.innerHTML = t.journal.tags.map(tag => \`<span class="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-300 text-[10px] border border-blue-500/20">\${tag}</span>\`).join('');
                        } else {
                            tagsContainer.innerHTML = '<span class="text-zinc-600 text-xs italic">No tags</span>';
                        }

                        document.getElementById('modal-notes').innerText = (t.journal && t.journal.notes) ? t.journal.notes : 'No notes added.';

                        modal.classList.remove('hidden');
                        setTimeout(() => {
                            modal.classList.remove('opacity-0');
                            content.classList.remove('scale-95');
                            content.classList.add('scale-100');
                        }, 10);
                    }

                    function closeModal() {
                        const modal = document.getElementById('trade-modal');
                        const content = document.getElementById('modal-content');
                        
                        modal.classList.add('opacity-0');
                        content.classList.remove('scale-100');
                        content.classList.add('scale-95');
                        
                        setTimeout(() => {
                            modal.classList.add('hidden');
                        }, 200);
                    }

                    Chart.defaults.color = '#71717a';
                    Chart.defaults.font.family = 'monospace';

                    new Chart(document.getElementById('equityChart'), {
                        type: 'line',
                        data: {
                            labels: chartLabels,
                            datasets: [{
                                label: 'Balance',
                                data: chartPoints,
                                borderColor: '#3b82f6',
                                backgroundColor: (context) => {
                                    const ctx = context.chart.ctx;
                                    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                                    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)');
                                    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
                                    return gradient;
                                },
                                borderWidth: 2,
                                fill: true,
                                tension: 0.3,
                                pointRadius: 0,
                                pointHoverRadius: 6
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            interaction: { mode: 'index', intersect: false },
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    backgroundColor: 'rgba(24, 24, 27, 0.9)',
                                    titleColor: '#a1a1aa',
                                    bodyColor: '#fff',
                                    borderColor: 'rgba(255,255,255,0.1)',
                                    borderWidth: 1,
                                    padding: 10,
                                    displayColors: false,
                                    callbacks: { label: (ctx) => '$' + ctx.parsed.y.toLocaleString('en-US', {minimumFractionDigits: 2}) }
                                }
                            },
                            scales: {
                                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                                x: { display: false }
                            }
                        }
                    });

                    new Chart(document.getElementById('sessionChart'), {
                        type: 'bar',
                        data: {
                            labels: sessionLabels,
                            datasets: [{
                                data: sessionPnLs,
                                backgroundColor: sessionColors,
                                borderRadius: 4
                            }]
                        },
                        options: {
                            responsive: true, maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                                x: { grid: { display: false } }
                            }
                        }
                    });

                    new Chart(document.getElementById('dayChart'), {
                        type: 'bar',
                        data: {
                            labels: dayLabels,
                            datasets: [{
                                data: dayPnLs,
                                backgroundColor: dayColors,
                                borderRadius: 4
                            }]
                        },
                        options: {
                            responsive: true, maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                                x: { grid: { display: false } }
                            }
                        }
                    });

                    renderCalendar();
                    renderTradeList();

                </script>
            </body>
            </html>
          `;

          const blob = new Blob([htmlContent], { type: 'text/html' });
          const link = document.createElement('a');
          const dateStr = new Date().toISOString().split('T')[0];
          link.href = URL.createObjectURL(blob);
          link.download = `ProTrade_Report_${dateStr}.html`;
          link.click();
          
          setIsExporting(false);
      }, 500);
  };

  const handleExportCSV = () => {
      if (closedTrades.length === 0) {
          alert("No closed trades to export.");
          return;
      }

      const headers = [
          "ID", "Symbol", "Side", "Type", 
          "Open Time (Thai)", "Close Time (Thai)", 
          "Entry Price", "Exit Price", 
          "Stop Loss", "Take Profit", 
          "Quantity", "PnL ($)", "Duration (s)", 
          "Tags", "Notes"
      ];

      const rows = closedTrades.map(t => {
          const openTimeStr = formatDateThai(t.entryTime);
          const closeTimeStr = formatDateThai(t.closeTime);
          const duration = (t.closeTime && t.entryTime) ? (t.closeTime - t.entryTime) : 0;
          const tags = t.journal?.tags?.join(';') || '';
          const notes = t.journal?.notes?.replace(/"/g, '""') || ''; 

          return [
              t.id, t.symbol, t.side, t.type,
              `"${openTimeStr}"`, `"${closeTimeStr}"`,
              t.entryPrice, t.closePrice || 0,
              t.stopLoss, t.takeProfit,
              t.quantity, (t.pnl || 0).toFixed(2), duration,
              `"${tags}"`, `"${notes}"`
          ].join(',');
      });

      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().split('T')[0];
      
      link.setAttribute('href', url);
      link.setAttribute('download', `ProTrade_Journal_${dateStr}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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
              <span className="text-sm font-mono text-zinc-400 hidden sm:block">SESSION ANALYTICS (THAI TIME)</span>
          </div>
          <div className="flex items-center space-x-3">
              <button onClick={handleExportCSV} className="flex items-center space-x-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl text-xs font-bold uppercase transition-colors shadow-lg shadow-green-900/20">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <span>Export CSV</span>
              </button>
              <button onClick={handleExportHTML} disabled={isExporting} className="flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase transition-colors disabled:opacity-50 shadow-lg shadow-blue-900/20">
                  {isExporting ? <span className="animate-pulse">Generating...</span> : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg><span>Export HTML</span></>}
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
                <MetricCard label="Expectancy" value={`$${formatCurrency(expectancy)}`} sub="Per Trade" color={expectancy > 0 ? 'text-green-400' : 'text-zinc-200'} />
                <MetricCard label="Avg Duration" value={formatDuration(avgDurationSeconds)} sub="Holding Time" />
                <MetricCard label="Avg R:R" value={`${avgRR > 0 ? '+' : ''}${avgRR.toFixed(2)}R`} sub="Realized" />
                <MetricCard label="Profit Factor" value={((wins.reduce((a,b)=>a+(b.pnl||0),0) / Math.abs(losses.reduce((a,b)=>a+(b.pnl||0),0))) || 0).toFixed(2)} />
                <MetricCard label="Net Profit" value={`$${formatCurrency(totalPnL)}`} color={totalPnL >= 0 ? 'text-green-400' : 'text-red-400'} />
                <MetricCard label="Gain" value={`${gainPercent.toFixed(2)}%`} color={gainPercent >= 0 ? 'text-green-400' : 'text-red-400'} />
            </div>

            {/* CHARTS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-panel rounded-2xl p-6 h-[400px] relative group bg-white/[0.02]">
                    <h3 className="text-sm font-bold text-zinc-400 uppercase mb-4 flex justify-between"><span>Equity Curve</span><span className="text-zinc-600">Realized PnL</span></h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={equityData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorEq" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                            <YAxis 
                                domain={[domainMin, domainMax]} 
                                stroke="#52525b" 
                                fontSize={10} 
                                tickFormatter={(val) => `$${(val/1000).toFixed(1)}k`}
                                width={45}
                            />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', color: '#fff', fontSize: '12px', borderRadius: '8px' }} 
                                itemStyle={{ color: '#3b82f6', fontWeight: 'bold' }} 
                                formatter={(val: number) => [`$${formatCurrency(val)}`, 'Balance']} 
                                animationDuration={0}
                            />
                            <Area 
                                type="monotone" 
                                dataKey="balance" 
                                stroke="#3b82f6" 
                                strokeWidth={2} 
                                fillOpacity={1} 
                                fill="url(#colorEq)" 
                                animationDuration={500}
                            />
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
                    <h3 className="text-xs font-bold text-zinc-400 uppercase mb-4">Session (Thai Time)</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sessionData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                            <XAxis dataKey="name" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                            <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', fontSize: '12px', borderRadius: '8px' }} animationDuration={0} formatter={(val: number) => `$${formatCurrency(val)}`} />
                            <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>{sessionData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#4ade80' : '#f87171'} />)}</Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="glass-panel rounded-2xl p-6 h-72 bg-white/[0.02]">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase mb-4">Day of Week (Thai)</h3>
                    <ResponsiveContainer width="100%" height="100%">
                         <BarChart data={dayData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                            <XAxis dataKey="name" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                            <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', fontSize: '12px', borderRadius: '8px' }} animationDuration={0} formatter={(val: number) => `$${formatCurrency(val)}`} />
                            <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>{dayData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#4ade80' : '#f87171'} />)}</Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="glass-panel rounded-2xl p-6 h-72 flex flex-col justify-center space-y-8 bg-white/[0.02]">
                    <div>
                        <div className="text-[11px] text-zinc-500 font-bold uppercase mb-1">Avg Win</div>
                        <div className="text-3xl font-black text-green-400">${formatCurrency(avgWin)}</div>
                        <div className="w-full bg-white/5 h-2 mt-2 rounded-full overflow-hidden"><div className="h-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" style={{width: '100%'}}></div></div>
                    </div>
                    <div>
                        <div className="text-[11px] text-zinc-500 font-bold uppercase mb-1">Avg Loss</div>
                        <div className="text-3xl font-black text-red-400">-${formatCurrency(Math.abs(avgLoss))}</div>
                         <div className="w-full bg-white/5 h-2 mt-2 rounded-full overflow-hidden"><div className="h-full bg-red-500 shadow-[0_0_10px_rgba(248,113,113,0.5)]" style={{width: `${Math.min(100, (Math.abs(avgLoss)/avgWin)*100)}%`}}></div></div>
                    </div>
                </div>
            </div>

            {/* TRADE JOURNAL LIST */}
            <div className="glass-panel rounded-2xl overflow-hidden bg-white/[0.02] border border-white/5">
                <div className="p-5 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-zinc-300 uppercase">Trade History</h3>
                    <span className="text-xs text-zinc-500">Click row to edit</span>
                </div>
                <div className="overflow-x-auto w-full">
                    <table className="w-full text-left min-w-[700px]">
                        <thead>
                            <tr className="border-b border-white/5 text-[11px] uppercase text-zinc-500 font-bold bg-black/20">
                                <th className="p-4">#</th>
                                <th className="p-4">Type</th>
                                <th className="p-4">Time (Thai)</th>
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
                                const effectiveSL = (t.initialStopLoss && t.initialStopLoss > 0) ? t.initialStopLoss : t.stopLoss;
                                const riskDist = effectiveSL > 0 ? Math.abs(t.entryPrice - effectiveSL) : 0;
                                
                                let rrDisplay = <span className="text-zinc-600">---</span>;
                                const isBreakEven = (t.pnl || 0) === 0;
                                
                                if (riskDist > 0 && t.closePrice && !isBreakEven) {
                                    let priceMove = t.closePrice - t.entryPrice;
                                    if (t.side === 'SHORT') priceMove = -priceMove;
                                    const realizedR = priceMove / riskDist;
                                    const isWin = realizedR >= 0;
                                    
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
                                                <span>{formatDateThai(t.entryTime)}</span>
                                                <span className="text-zinc-500">{formatDateThai(t.closeTime)}</span>
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
                                            ${formatCurrency(t.pnl || 0)}
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
