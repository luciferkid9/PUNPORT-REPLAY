
import React from 'react';
import { AccountState } from '../types';

interface Props {
  account: AccountState;
  initialBalance: number;
}

export const AnalyticsPanel: React.FC<Props> = ({ account, initialBalance }) => {
  const { history: trades, maxDrawdown } = account;

  const closedTrades = trades.filter(t => t.status === 'CLOSED');
  
  // UPDATED: Strictly separate wins, losses, and break-evens (0 PnL)
  const winTrades = closedTrades.filter(t => (t.pnl || 0) > 0);
  const lossTrades = closedTrades.filter(t => (t.pnl || 0) < 0);
  const breakEvens = closedTrades.filter(t => (t.pnl || 0) === 0);

  // Win Rate: Wins / (Wins + Losses) -> Ignoring break-evens for purity
  const decisiveTrades = winTrades.length + lossTrades.length;
  const winRate = decisiveTrades > 0 
    ? (winTrades.length / decisiveTrades) * 100 
    : 0;
  
  const totalPnL = closedTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
  
  const grossProfit = winTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
  const grossLoss = Math.abs(lossTrades.reduce((acc, t) => acc + (t.pnl || 0), 0));
  const profitFactor = grossLoss === 0 ? grossProfit : grossProfit / grossLoss;

  const ddPercent = (maxDrawdown / initialBalance) * 100;

  return (
    <div className="p-3">
      <div className="grid grid-cols-5 gap-3">
         
         {/* Metric 1: Total P/L */}
         <div className="glass-panel p-2 rounded-xl flex flex-col justify-center relative overflow-hidden bg-white/[0.02]">
             <div className="absolute top-0 right-0 p-2 opacity-5 pointer-events-none">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.15-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.62 1.87 1.26 0 2.53-.68 2.53-2.15 0-2.45-5.52-1.22-5.52-6.37 0-1.98 1.49-3.2 3.16-3.57V2h2.67v1.93c1.71.36 3.15 1.46 3.27 3.4h-1.96c-.1-1.05-.82-1.87-2.62-1.87-1.26 0-2.53.68-2.53 2.15 0 2.45 5.52 1.22 5.52 6.37 0 1.98-1.49 3.2-3.16 3.57z"/></svg>
             </div>
             <span className="text-[8px] text-zinc-500 uppercase font-black tracking-widest mb-0.5">Total P/L</span>
             <span className={`text-lg font-mono font-bold tracking-tight drop-shadow-sm ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                 ${totalPnL.toFixed(2)}
             </span>
         </div>

         {/* Metric 2: Win Rate */}
         <div className="glass-panel p-2 rounded-xl flex flex-col justify-center bg-white/[0.02]">
             <span className="text-[8px] text-zinc-500 uppercase font-black tracking-widest mb-0.5">Win Rate</span>
             <span className="text-lg font-mono font-bold text-white tracking-tight">{winRate.toFixed(1)}%</span>
             <div className="w-full bg-black/40 h-1 mt-1 rounded-full overflow-hidden border border-white/5">
                 <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${winRate}%` }}></div>
             </div>
         </div>

         {/* Metric 3: Profit Factor */}
         <div className="glass-panel p-2 rounded-xl flex flex-col justify-center bg-white/[0.02]">
             <span className="text-[8px] text-zinc-500 uppercase font-black tracking-widest mb-0.5">Profit Factor</span>
             <span className="text-lg font-mono font-bold text-white tracking-tight">{profitFactor.toFixed(2)}</span>
         </div>

         {/* Metric 4: Trades */}
         <div className="glass-panel p-2 rounded-xl flex flex-col justify-center bg-white/[0.02]">
             <span className="text-[8px] text-zinc-500 uppercase font-black tracking-widest mb-0.5">Closed Trades</span>
             <div className="flex items-baseline space-x-1">
                 <span className="text-lg font-mono font-bold text-white tracking-tight">{closedTrades.length}</span>
                 <span className="text-[9px] text-green-500">W:{winTrades.length}</span>
                 <span className="text-[9px] text-red-500">L:{lossTrades.length}</span>
             </div>
         </div>

         {/* Metric 5: Max Drawdown */}
         <div className="glass-panel p-2 rounded-xl flex flex-col justify-center bg-white/[0.02]">
             <span className="text-[8px] text-zinc-500 uppercase font-black tracking-widest mb-0.5">Max Drawdown</span>
             <span className="text-lg font-mono font-bold text-red-400 tracking-tight">-${maxDrawdown.toFixed(2)}</span>
         </div>

      </div>
    </div>
  );
};
