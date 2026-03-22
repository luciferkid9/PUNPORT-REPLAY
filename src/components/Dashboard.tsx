import React, { useState, useContext, useEffect } from 'react';
import { 
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  Cell, ReferenceLine
} from 'recharts';
import { Wallet, TrendingUp, TrendingDown, Crosshair, Activity, AlertTriangle, Plus, X, Filter, Image as ImageIcon, CheckCircle, XCircle, MinusCircle, Clock, Check, Pencil, Briefcase, ChevronLeft, ChevronRight, Trash2, CalendarDays, ChevronDown, Lock, Unlock, Loader2, Share2, Download, Upload, Link, Globe } from 'lucide-react';
import { TradeContext, useTradeStats } from '../context/TradeContext';
import { db } from '../firebase';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, onSnapshot } from 'firebase/firestore';

import { DataSettingsModal } from './DataSettingsModal';
import * as htmlToImage from 'html-to-image';
import Papa from 'papaparse';
const Card = ({ title, value, subtext, icon: Icon, colorClass, highlight }) => {
  // Helper to get a safe color for the icon that works with SVGs
  const getIconColor = () => {
    if (!highlight) return 'text-slate-300'; // Brighter for better visibility on dark metal
    
    // If colorClass is a complex gradient (contains bg-clip-text), it won't work on SVG
    // We extract a fallback solid color
    if (colorClass.includes('bg-clip-text')) {
      if (colorClass.includes('emerald')) return 'text-emerald-400';
      if (colorClass.includes('rose')) return 'text-rose-400';
      if (colorClass.includes('amber')) return 'text-amber-400';
      if (colorClass.includes('orange')) return 'text-orange-400';
      if (colorClass.includes('fuchsia')) return 'text-fuchsia-400';
      return 'text-blue-400';
    }
    return colorClass;
  };

  const getGlowColor = () => {
    if (!highlight) return 'bg-slate-400';
    if (colorClass.includes('emerald')) return 'bg-emerald-500';
    if (colorClass.includes('rose')) return 'bg-rose-500';
    if (colorClass.includes('amber')) return 'bg-amber-500';
    if (colorClass.includes('orange')) return 'bg-orange-500';
    if (colorClass.includes('fuchsia')) return 'bg-fuchsia-500';
    if (colorClass.includes('purple')) return 'bg-purple-500';
    if (colorClass.includes('indigo')) return 'bg-indigo-500';
    return 'bg-blue-500';
  };

  return (
    <div className="group relative overflow-hidden bg-[#0f172a] p-5 rounded-2xl border border-slate-800 shadow-2xl transition-all duration-500 ease-out hover:-translate-y-2 hover:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] hover:border-slate-600">
      {/* Titanium Metallic Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-400/5 via-transparent to-transparent opacity-50" />
      
      {/* Interactive Shine Effect */}
      <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[-20deg]" />
      
      {/* Background Glow */}
      <div className={`absolute -right-10 -top-10 w-32 h-32 blur-3xl opacity-0 group-hover:opacity-20 transition-opacity duration-700 rounded-full ${getGlowColor()}`} />

      <div className="relative z-10 flex justify-between items-start">
        <div className="flex-1">
          <p className="text-white text-[12px] font-bold uppercase tracking-[0.2em] mb-1 transition-colors duration-300">{title}</p>
          <h3 className={`text-3xl font-black tracking-tighter ${highlight ? colorClass : 'text-white'} drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)] transition-all duration-300 group-hover:scale-[1.02] origin-left`}>
            {value}
          </h3>
          {subtext && (
            <div className="text-slate-500/60 text-[12px] mt-2 font-semibold uppercase tracking-wider group-hover:text-slate-400/80 transition-colors duration-300">
              {subtext}
            </div>
          )}
        </div>
        
        {/* Machined Metal Icon Container */}
        <div className="relative">
          <div className="absolute inset-0 bg-black/40 rounded-xl blur-sm" />
          <div className="relative p-3.5 rounded-xl bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 border border-slate-600/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] transition-all duration-500 ease-out group-hover:scale-110 group-hover:rotate-6 group-hover:border-slate-500 group-hover:shadow-[0_0_20px_rgba(255,255,255,0.15)]">
            <Icon className={`${getIconColor()} drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)] transition-colors duration-300`} size={24} strokeWidth={2.5} />
          </div>
        </div>
      </div>
      
      {/* Bottom Accent Line */}
      <div className={`absolute bottom-0 left-0 h-[2px] w-0 group-hover:w-full transition-all duration-700 ease-out ${getGlowColor()}`} />
    </div>
  );
};

const ExecutiveSummary = () => {
  const { stats, empty } = useTradeStats();
  const { settings, t } = useContext(TradeContext);

  if (empty) return null;

  const returnPercent = settings.capital > 0 ? (stats.netProfit / settings.capital) * 100 : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
      <Card 
        title={t('currentBalance')} 
        value={`$${stats.currentBalance?.toLocaleString(undefined, {minimumFractionDigits: 2}) || '0.00'}`}
        subtext={`${t('initial')} $${Number(settings.capital).toLocaleString() || '0'}`}
        icon={Wallet} 
        colorClass={stats.currentBalance >= settings.capital ? "text-emerald-400" : "text-rose-400"} 
        highlight={true}
      />
      <Card 
        title={t('netPnL')} 
        value={`${stats.netProfit >= 0 ? '+' : ''}$${stats.netProfit?.toLocaleString(undefined, {minimumFractionDigits: 2}) || '0.00'}`}
        subtext={
          <span className={stats.netProfit >= 0 ? "text-emerald-400/80" : "text-rose-400/80"}>
            {stats.netProfit >= 0 ? '+' : ''}{returnPercent.toFixed(2)}% {t('return')}
          </span>
        }
        icon={stats.netProfit >= 0 ? TrendingUp : TrendingDown} 
        colorClass={stats.netProfit >= 0 ? "text-emerald-400" : "text-rose-400"}
        highlight={true}
      />
      <Card 
        title={t('winRate')} 
        value={`${stats.winRate?.toFixed(1) || '0.0'}%`}
        subtext={
          <span className="flex items-center flex-wrap gap-1">
            <span className="text-blue-400 font-medium">{stats.totalTrades} {t('trades')}</span> <span className="text-slate-600">|</span>
            <span className="text-emerald-400">{stats.wins}W</span> <span className="text-slate-600">·</span>{' '}
            <span className="text-rose-400">{stats.losses}L</span> <span className="text-slate-600">·</span>{' '}
            <span className="text-amber-400">{stats.breakEvens}BE</span>
          </span>
        }
        icon={Crosshair} 
        colorClass={
          stats.winRate >= 75 
            ? "text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 animate-sparkle drop-shadow-[0_0_10px_rgba(52,211,153,0.6)] font-black" 
            : stats.winRate >= 50 
              ? "text-emerald-400" 
              : "text-rose-400"
        } 
        highlight={true}
      />
      <Card 
        title={t('maxDrawdown')} 
        value={`${stats.maxDrawdown?.toFixed(2) || '0.00'}%`}
        subtext={t('peakToTrough')}
        icon={AlertTriangle} 
        colorClass={
          stats.maxDrawdown <= -20 ? "text-rose-500" :
          stats.maxDrawdown <= -15 ? "text-fuchsia-500" :
          stats.maxDrawdown <= -10 ? "text-orange-500" :
          stats.maxDrawdown < -5 ? "text-amber-400" :
          "text-emerald-400"
        }
        highlight={stats.maxDrawdown < -5}
      />
      <Card 
        title={t('profitFactor')} 
        value={stats.profitFactor?.toFixed(2) || '0.00'}
        subtext={t('grossProfitLoss')}
        icon={Activity} 
        colorClass={stats.profitFactor > 1.5 ? "text-emerald-400" : "text-slate-300"} 
        highlight={stats.profitFactor > 1.5}
      />
      <Card 
        title={t('expectancy')} 
        value={`${stats.expectancyUSD > 0 ? '+' : ''}$${stats.expectancyUSD?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) || '0.00'}`}
        subtext={
          <span className={stats.expectancyUSD >= 0 ? "text-emerald-400/80" : "text-rose-400/80"}>
            ≈ {stats.expectancyR > 0 ? '+' : ''}{stats.expectancyR?.toFixed(2) || '0.00'}R {t('perTrade')}
          </span>
        }
        icon={TrendingUp} 
        colorClass={stats.expectancyUSD >= 0 ? "text-emerald-400" : "text-rose-400"} 
        highlight={true}
      />
      <Card 
        title={t('avgRRR')} 
        value={`1 : ${stats.avgRRR?.toFixed(2) || '0.00'}`}
        subtext={t('riskReward')}
        icon={Activity} 
        colorClass="text-indigo-400" 
        highlight={false}
      />
      <Card 
        title={t('avgHoldTime')} 
        value={`${Math.abs(stats.avgHoldHours ?? 0).toFixed(1)} Hrs`}
        subtext={t('entryExitDuration')}
        icon={Clock} 
        colorClass="text-purple-400" 
        highlight={false}
      />
    </div>
  );
};

const CustomXAxisTick = (props) => {
  const { x, y, payload, filterKey, rotate = true, fontSize = 11 } = props;
  let color = "#94a3b8";

  if (filterKey === 'session') {
    if (payload.value === 'Asia') color = '#eab308'; // yellow-500
    else if (payload.value === 'London') color = '#2dd4bf'; // teal-400
    else if (payload.value === 'New York') color = '#c084fc'; // purple-400
  } else if (filterKey === 'setupScore') {
    if (payload.value === 'A+') color = '#f43f5e'; // rose-500
    else if (payload.value === 'A') color = '#ef4444'; // red-500
    else if (payload.value === 'B') color = '#eab308'; // yellow-500
    else if (payload.value === 'C') color = '#22c55e'; // green-500
    else if (payload.value === 'D') color = '#3b82f6'; // blue-500
    else if (payload.value === 'E') color = '#c084fc'; // purple-400
  }

  const isAplus = filterKey === 'setupScore' && payload.value === 'A+';
  const glowStyle = isAplus ? { filter: 'drop-shadow(0 0 6px rgba(244, 63, 94, 0.8))' } : {};

  return (
    <g>
      {isAplus && (
        <defs>
          <linearGradient id="aPlusGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f43f5e" />
            <stop offset="25%" stopColor="#d946ef" />
            <stop offset="50%" stopColor="#a855f7" />
            <stop offset="75%" stopColor="#d946ef" />
            <stop offset="100%" stopColor="#f43f5e" />
          </linearGradient>
        </defs>
      )}
      <text 
        x={x} 
        y={rotate ? y : y + 15} 
        textAnchor={rotate ? "end" : "middle"}
        transform={rotate ? `rotate(-45, ${x}, ${y})` : undefined}
        fill={isAplus ? 'url(#aPlusGradient)' : color} 
        fontSize={fontSize} 
        fontWeight="bold" 
        className="uppercase"
        style={glowStyle}
      >
        {payload.value}
      </text>
    </g>
  );
};

const CustomYAxisTick = (props) => {
  const { x, y, payload, filterKey } = props;
  let color = "#94a3b8"; 
  let isDiamond = false;

  if (filterKey === 'session') {
    if (payload.value === 'Asia') color = '#eab308'; // yellow-500
    if (payload.value === 'London') color = '#2dd4bf'; // teal-400
    if (payload.value === 'New York') color = '#c084fc'; // purple-400
  } else if (filterKey === 'setupScore') {
    if (payload.value === 'A+') {
      color = 'url(#diamondGradient)';
      isDiamond = true;
    }
    if (payload.value === 'A') color = '#ef4444'; // red-500
    if (payload.value === 'B') color = '#eab308'; // yellow-500
    if (payload.value === 'C') color = '#22c55e'; // green-500
    if (payload.value === 'D') color = '#3b82f6'; // blue-500
    if (payload.value === 'E') color = '#c084fc'; // purple-400
  }

  return (
    <g transform={`translate(${x},${y})`}>
      {isDiamond && (
        <defs>
          <linearGradient id="diamondGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f43f5e" />
            <stop offset="33%" stopColor="#d946ef" />
            <stop offset="66%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#f43f5e" />
          </linearGradient>
          <filter id="chartSparkle">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
      )}
      <text 
        x={-12} 
        y={0} 
        dy={4} 
        textAnchor="end" 
        fill={color} 
        fontSize={11} 
        fontWeight="900" 
        filter={isDiamond ? "url(#chartSparkle)" : ""}
        className={`uppercase ${isDiamond ? 'animate-sparkle' : ''}`}
      >
        {payload.value}
      </text>
    </g>
  );
};

const CustomTooltip = ({ active, payload, label }) => {
  const { t } = useContext(TradeContext);
  if (active && payload && payload.length) {
    const isStackedChart = payload.some(p => p.dataKey === 'profit' || p.dataKey === 'loss');
    const netValue = payload[0]?.payload?.net;
    const tradesCount = payload[0]?.payload?.trades ?? payload[0]?.payload?.total;

    return (
      <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 p-4 rounded-xl shadow-2xl min-w-[160px]">
        <p className="text-white font-bold mb-3 border-b border-slate-700/50 pb-2">{t(String(label)) || String(label)}</p>
        
        {payload.map((p, idx) => {
          let valStr = p.value;
          let isPnL = p.name === 'Net PnL' || p.dataKey === 'pnl' || p.dataKey === 'profit' || p.dataKey === 'loss';
          let textColor = "text-white";

          if (typeof p.value === 'number') {
            if (p.name === 'Win Rate (%)') valStr = `${p.value.toFixed(1)}%`;
            else if (p.name.includes('Drawdown') || p.name.includes('%')) valStr = `${p.value.toFixed(2)}%`;
            else if (p.name.includes('Net R')) valStr = `${p.value > 0 ? '+' : ''}${p.value.toFixed(2)}R`;
            else {
              valStr = `${p.value < 0 ? '-' : p.value > 0 && isPnL ? '+' : ''}$${Math.abs(p.value).toLocaleString(undefined, {minimumFractionDigits: 2})}`;
              if (isPnL) {
                textColor = p.value > 0 ? "text-emerald-400" : p.value < 0 ? "text-rose-400" : "text-slate-300";
              }
            }
          }
          return (
            <div key={idx} className="flex justify-between items-center text-sm font-medium mb-1.5 gap-5">
              <span style={{ color: p.color || p.fill }}>{t(p.name) || p.name}</span>
              <span className={`${textColor} font-bold`}>{valStr}</span>
            </div>
          );
        })}

        {(tradesCount !== undefined || (isStackedChart && netValue !== undefined)) && (
          <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-2">
            {tradesCount !== undefined && (
              <div className="flex justify-between items-center text-sm font-medium text-slate-300">
                <span>{t('trades')}</span>
                <span className="font-bold text-white">{tradesCount}</span>
              </div>
            )}
            {isStackedChart && netValue !== undefined && (
              <div className={`flex justify-between items-center text-sm font-black ${netValue > 0 ? 'text-emerald-400' : netValue < 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                <span>{t('netPnL')}</span>
                <span>{netValue > 0 ? '+' : ''}{netValue < 0 ? '-' : ''}${(Math.abs(netValue)).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
  return null;
};

const FilterableHorizontalBar = ({ titleKey, data, filterKey, rotate = false, margin = { top: 0, right: 0, left: -20, bottom: 0 } }) => {
  const { toggleFilter, filters, t } = useContext(TradeContext);
  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900/90 p-5 rounded-2xl border border-slate-700/50 shadow-lg transition-all duration-500 hover:shadow-xl">
      <h3 className="text-white font-medium mb-4 text-base flex justify-between items-center tracking-wide">
        {t(titleKey)}
        {filters[filterKey] && <span className="text-sm bg-blue-500/20 text-blue-300 px-2.5 py-1 rounded-full border border-blue-500/30 backdrop-blur-sm">{t('filtered')} {filters[filterKey]}</span>}
      </h3>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={margin} stackOffset="sign">
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} vertical={false} />
            <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tick={<CustomXAxisTick filterKey={filterKey} rotate={rotate} fontSize={rotate ? 9 : 11} />} interval={0} />
            <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => v < 0 ? `-$${Math.abs(v).toLocaleString()}` : `$${v.toLocaleString()}`} />
            <RechartsTooltip cursor={{fill: '#334155', opacity: 0.3}} content={CustomTooltip} />
            <ReferenceLine y={0} stroke="#475569" strokeWidth={1.5} />
            <Bar dataKey="profit" name={t('profit')} stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} onClick={(data) => toggleFilter(filterKey, data.name)} className="cursor-pointer transition-all duration-500 hover:brightness-125" />
            <Bar dataKey="loss" name={t('loss')} stackId="a" fill="#f43f5e" radius={[0, 0, 4, 4]} onClick={(data) => toggleFilter(filterKey, data.name)} className="cursor-pointer transition-all duration-500 hover:brightness-125" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const EquityCurveChart = () => {
  const { equityCurve, empty } = useTradeStats();
  const { t, settings } = useContext(TradeContext);

  if (empty || !equityCurve || equityCurve.length === 0) return null;

  const initial = Number(settings.capital) || 0;
  const balances = equityCurve.map(d => d.balance);
  const max = Math.max(...balances, initial);
  const min = Math.min(...balances, initial);
  const range = max - min;
  const offset = range === 0 ? 0.5 : (max - initial) / range;

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900/90 p-5 rounded-2xl border border-slate-700/50 shadow-lg transition-all duration-500 hover:shadow-xl mb-8">
      <h3 className="text-white font-medium mb-4 text-base flex items-center gap-2 tracking-wide">
        <TrendingUp size={18} className="text-blue-400" />
        {t('equityCurve')}
      </h3>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={equityCurve} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              {/* Titanium Green Metallic Gradient */}
              <linearGradient id="titaniumGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="25%" stopColor="#34d399" />
                <stop offset="50%" stopColor="#059669" />
                <stop offset="75%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
              
              {/* Titanium Red Metallic Gradient */}
              <linearGradient id="titaniumRed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f43f5e" />
                <stop offset="25%" stopColor="#fb7185" />
                <stop offset="50%" stopColor="#e11d48" />
                <stop offset="75%" stopColor="#fb7185" />
                <stop offset="100%" stopColor="#f43f5e" />
              </linearGradient>

              {/* Combined Stroke Gradient */}
              <linearGradient id="splitStroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset={0} stopColor="url(#titaniumGreen)" />
                <stop offset={offset} stopColor="url(#titaniumGreen)" />
                <stop offset={offset} stopColor="url(#titaniumRed)" />
                <stop offset={1} stopColor="url(#titaniumRed)" />
              </linearGradient>

              {/* Simplified Split Stroke for better rendering */}
              <linearGradient id="equityStroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset={0} stopColor="#10b981" />
                <stop offset={offset} stopColor="#10b981" />
                <stop offset={offset} stopColor="#f43f5e" />
                <stop offset={1} stopColor="#f43f5e" />
              </linearGradient>

              {/* Fill Gradient */}
              <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset={0} stopColor="#10b981" stopOpacity={0.2} />
                <stop offset={offset} stopColor="#10b981" stopOpacity={0.05} />
                <stop offset={offset} stopColor="#f43f5e" stopOpacity={0.05} />
                <stop offset={1} stopColor="#f43f5e" stopOpacity={0.2} />
              </linearGradient>

              {/* Premium Metallic Glow Filter */}
              <filter id="metallicGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} vertical={false} />
            <XAxis dataKey="tradeNum" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis domain={['auto', 'auto']} stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v.toLocaleString()}`} />
            <RechartsTooltip cursor={{stroke: '#64748b', strokeWidth: 1, strokeDasharray: '3 3'}} content={CustomTooltip} />
            <ReferenceLine y={initial} stroke="#475569" strokeDasharray="5 5" strokeWidth={1} label={{ value: t('initial'), position: 'right', fill: '#64748b', fontSize: 10 }} />
            <Area 
              type="monotone" 
              dataKey="balance" 
              name="Balance" 
              stroke="url(#equityStroke)" 
              strokeWidth={4} 
              fillOpacity={1} 
              fill="url(#equityFill)" 
              filter="url(#metallicGlow)"
              activeDot={{r: 6, fill: '#fff', stroke: '#3b82f6', strokeWidth: 2}} 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const YearlyPnLChart = () => {
  const { analytics, empty } = useTradeStats();
  const { t, filters, toggleFilter } = useContext(TradeContext);
  
  const years = analytics.availableYears || [];
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (years.length > 0 && !years.includes(selectedYear)) {
      setSelectedYear(years[0]);
    }
  }, [years, selectedYear]);

  if (empty || years.length === 0) return null;

  const data = analytics.yearlyStats[selectedYear] || [];

  return (
    <div className="group bg-gradient-to-br from-slate-800 to-slate-900/90 p-6 rounded-2xl border border-slate-700/50 shadow-lg transition-all duration-500 ease-out hover:border-slate-600 hover:shadow-xl mb-8">
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-white font-medium text-base tracking-wide flex items-center gap-2">
          <Activity size={20} className="text-blue-400" />
          {t('yearlyPnL')}
          {filters['month'] && <span className="text-sm bg-blue-500/20 text-blue-300 px-2.5 py-1 rounded-full border border-blue-500/30 backdrop-blur-sm">{t('filtered')} {t(filters['month'])}</span>}
        </h3>
        <div className="flex items-center gap-2 bg-slate-950/50 rounded-lg p-1 border border-slate-700/50">
          <button 
            onClick={() => setSelectedYear(years[years.indexOf(selectedYear) + 1])} 
            disabled={years.indexOf(selectedYear) === years.length - 1} 
            className="p-1 text-slate-400 hover:text-white disabled:opacity-30 transition-opacity"
          >
            <ChevronLeft size={16}/>
          </button>
          <span className="text-sm font-bold text-white min-w-[50px] text-center">{selectedYear}</span>
          <button 
            onClick={() => setSelectedYear(years[years.indexOf(selectedYear) - 1])} 
            disabled={years.indexOf(selectedYear) === 0} 
            className="p-1 text-slate-400 hover:text-white disabled:opacity-30 transition-opacity"
          >
            <ChevronRight size={16}/>
          </button>
        </div>
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 10 }} stackOffset="sign">
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.4} />
            <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => t(val)} />
            <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => v < 0 ? `-$${Math.abs(v).toLocaleString()}` : `$${v.toLocaleString()}`} />
            <RechartsTooltip cursor={{fill: '#334155', opacity: 0.3}} content={CustomTooltip} />
            <ReferenceLine y={0} stroke="#475569" strokeWidth={1.5} />
            <Bar dataKey="profit" name={t('profit')} stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} onClick={(data) => toggleFilter('month', data?.payload?.month || data?.month)} className="cursor-pointer transition-all duration-500 hover:brightness-125" />
            <Bar dataKey="loss" name={t('loss')} stackId="a" fill="#f43f5e" radius={[0, 0, 4, 4]} onClick={(data) => toggleFilter('month', data?.payload?.month || data?.month)} className="cursor-pointer transition-all duration-500 hover:brightness-125" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const DailyPnLChart = () => {
  const { analytics, empty } = useTradeStats();
  const { toggleFilter, filters, t } = useContext(TradeContext);
  
  if (empty || !analytics.byDayOfWeek) return null;

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900/90 p-5 rounded-2xl border border-slate-700/50 shadow-lg transition-all duration-500 hover:shadow-xl">
      <h3 className="text-white font-medium mb-4 text-base flex justify-between items-center tracking-wide">
        {t('netPnLDay')}
        {filters['dayOfWeek'] && <span className="text-sm bg-blue-500/20 text-blue-300 px-2.5 py-1 rounded-full border border-blue-500/30 backdrop-blur-sm">{t('filtered')} {filters['dayOfWeek']}</span>}
      </h3>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={analytics.byDayOfWeek} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} stackOffset="sign">
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} vertical={false} />
            <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tick={<CustomXAxisTick rotate={false} />} interval={0} />
            <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => v < 0 ? `-$${Math.abs(v).toLocaleString()}` : `$${v.toLocaleString()}`} />
            <RechartsTooltip cursor={{fill: '#334155', opacity: 0.3}} content={CustomTooltip} />
            <ReferenceLine y={0} stroke="#475569" strokeWidth={1.5} />
            <Bar dataKey="profit" name={t('profit')} stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} onClick={(data) => toggleFilter('dayOfWeek', data?.payload?.name || data?.name)} className="cursor-pointer transition-all duration-500 hover:brightness-125" />
            <Bar dataKey="loss" name={t('loss')} stackId="a" fill="#f43f5e" radius={[0, 0, 4, 4]} onClick={(data) => toggleFilter('dayOfWeek', data?.payload?.name || data?.name)} className="cursor-pointer transition-all duration-500 hover:brightness-125" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const DurationPnLChart = () => {
  const { analytics, empty } = useTradeStats();
  const { t, filters, toggleFilter } = useContext(TradeContext);
  
  if (empty || !analytics.durationStats) return null;

  return (
    <div className="group bg-gradient-to-br from-slate-800 to-slate-900/90 p-6 rounded-2xl border border-slate-700/50 shadow-lg transition-all duration-500 ease-out hover:border-slate-600 hover:shadow-xl mb-8">
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-white font-medium text-base tracking-wide flex items-center gap-2">
          <Clock size={20} className="text-purple-400" />
          {t('pnlByDuration')}
          {filters['durationBucket'] && <span className="text-sm bg-blue-500/20 text-blue-300 px-2.5 py-1 rounded-full border border-blue-500/30 backdrop-blur-sm">{t('filtered')} {filters['durationBucket']}</span>}
        </h3>
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={analytics.durationStats} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} stackOffset="sign">
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.4} />
            <XAxis dataKey="bucket" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tick={<CustomXAxisTick rotate={true} fontSize={9} />} interval={0} />
            <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => v < 0 ? `-$${Math.abs(v).toLocaleString()}` : `$${v.toLocaleString()}`} />
            <RechartsTooltip cursor={{fill: '#334155', opacity: 0.3}} content={CustomTooltip} />
            <ReferenceLine y={0} stroke="#475569" strokeWidth={1.5} />
            <Bar dataKey="profit" name={t('profit')} stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} onClick={(data) => toggleFilter('durationBucket', data?.payload?.bucket || data?.bucket)} className="cursor-pointer transition-all duration-500 hover:brightness-125" />
            <Bar dataKey="loss" name={t('loss')} stackId="a" fill="#f43f5e" radius={[0, 0, 4, 4]} onClick={(data) => toggleFilter('durationBucket', data?.payload?.bucket || data?.bucket)} className="cursor-pointer transition-all duration-500 hover:brightness-125" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const TradeTable = () => {
  const { deleteTrade, setEditingTrade, t, isAuthorized } = useContext(TradeContext);
  const { rawTrades } = useTradeStats();
  
  const displayTrades = rawTrades ? [...rawTrades].reverse() : [];
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const getSessionColor = (session: string) => {
    switch (session) {
      case 'Asia': return 'text-yellow-500 border-yellow-500/30';
      case 'London': return 'text-teal-400 border-teal-400/30';
      case 'New York': return 'text-purple-400 border-purple-400/30';
      default: return 'text-slate-400 border-slate-400/30';
    }
  };

  const getSetupColor = (setup: string) => {
    switch (setup) {
      case 'A+': return 'text-transparent bg-clip-text bg-gradient-to-r from-rose-500 via-fuchsia-500 via-purple-500 via-fuchsia-500 to-rose-500 animate-rainbow animate-sparkle bg-[length:200%_auto] font-black tracking-tighter drop-shadow-[0_0_12px_rgba(255,255,255,0.6)]';
      case 'A': return 'text-red-500 font-bold drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]';
      case 'B': return 'text-yellow-500 font-bold drop-shadow-[0_0_5px_rgba(234,179,8,0.5)]';
      case 'C': return 'text-green-500 font-bold drop-shadow-[0_0_5px_rgba(34,197,94,0.5)]';
      case 'D': return 'text-blue-500 font-bold drop-shadow-[0_0_5px_rgba(59,130,246,0.5)]';
      case 'E': return 'text-purple-400 font-bold drop-shadow-[0_0_5px_rgba(192,132,252,0.5)]';
      default: return 'text-slate-400';
    }
  };

  const getResultBadge = (result: string) => {
    if (result === 'TP' || result === 'Win' || result === 'Won') {
      return (
        <span className="px-2 py-1 rounded text-xs font-medium border border-emerald-500/30 text-emerald-400 flex items-center gap-1 w-fit">
          <CheckCircle size={12} /> {t('won')}
        </span>
      );
    }
    if (result === 'SL' || result === 'Loss' || result === 'Lost') {
      return (
        <span className="px-2 py-1 rounded text-xs font-medium border border-rose-500/30 text-rose-400 flex items-center gap-1 w-fit">
          <XCircle size={12} /> {t('lost')}
        </span>
      );
    }
    return (
      <span className="px-2 py-1 rounded text-xs font-medium border border-slate-500/30 text-slate-400 flex items-center gap-1 w-fit">
        <MinusCircle size={12} /> {t('be')}
      </span>
    );
  };

  return (
    <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden shadow-lg mt-8">
      <div className="px-6 py-5 border-b border-slate-700/50 flex justify-between items-center bg-slate-900/30">
        <h2 className="text-lg font-bold text-white">{t('tradeLog')}</h2>
        <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-sm font-medium text-slate-300">
          {displayTrades.length} Trades
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-300">
          <thead className="text-xs text-slate-400 uppercase bg-slate-900/50">
            <tr>
              <th className="px-6 py-4 font-bold"># {t('dateExit')}</th>
              <th className="px-6 py-4 font-bold">{t('session')}</th>
              <th className="px-6 py-4 font-bold">{t('asset')}</th>
              <th className="px-6 py-4 font-bold">{t('system')}</th>
              <th className="px-6 py-4 font-bold">{t('dirTF')}</th>
              <th className="px-6 py-4 font-bold">{t('result')}</th>
              <th className="px-6 py-4 font-bold">NET PNL</th>
              <th className="px-6 py-4 font-bold">RR</th>
              <th className="px-6 py-4 font-bold">{t('chart')}</th>
              {isAuthorized && <th className="px-6 py-4 font-bold">{t('action')}</th>}
            </tr>
          </thead>
          <tbody>
            {displayTrades.map((trade) => (
              <tr key={trade.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-slate-500 mr-2 font-mono text-xs">#{trade.tradeNum}</span>
                  <span className="text-slate-300">{formatDate(trade.exitDate)}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 rounded text-xs font-medium border ${getSessionColor(trade.session)}`}>
                    {trade.session}
                  </span>
                </td>
                <td className="px-6 py-4 font-bold text-white">{trade.asset}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-slate-300">{trade.system}</span>
                  <span className={`ml-1 font-bold ${getSetupColor(trade.setupScore)}`}>({trade.setupScore})</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${trade.direction === 'Buy' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                    <span className={trade.direction === 'Buy' ? 'text-emerald-400' : 'text-rose-400'}>{trade.direction}</span>
                    <span className="text-slate-500">({trade.timeframe})</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {getResultBadge(trade.result)}
                </td>
                <td className={`px-6 py-4 font-bold whitespace-nowrap ${trade.netPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {trade.netPnL >= 0 ? '+' : ''}${trade.netPnL.toFixed(2)}
                </td>
                <td className={`px-6 py-4 font-bold whitespace-nowrap ${trade.rewardRatio >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {trade.rewardRatio >= 0 ? '+' : ''}{trade.rewardRatio.toFixed(2)}R
                </td>
                <td className="px-6 py-4">
                  {trade.chartUrl ? (
                    <a 
                      href={trade.chartUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="p-2 rounded-lg bg-gradient-to-b from-slate-700 to-slate-800 border border-slate-600 text-blue-400 hover:text-white hover:border-blue-500 hover:shadow-[0_0_12px_rgba(59,130,246,0.4)] transition-all duration-300 inline-flex items-center justify-center group relative"
                      title="View Chart"
                    >
                      <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/10 rounded-lg transition-colors" />
                      <ImageIcon size={16} className="relative z-10 group-hover:scale-110 transition-transform" />
                    </a>
                  ) : (
                    <div 
                      className="p-2 rounded-lg bg-slate-900/40 border border-slate-800/40 text-slate-700 cursor-not-allowed inline-flex items-center justify-center"
                      title="No Chart Available"
                    >
                      <ImageIcon size={16} className="opacity-50" />
                    </div>
                  )}
                </td>
                {isAuthorized && (
                  <td className="px-6 py-4">
                    <div className="flex flex-col items-center gap-2">
                      <button onClick={() => setEditingTrade(trade)} className="text-slate-500 hover:text-white transition-colors p-1"><Pencil size={14} /></button>
                      <button onClick={() => deleteTrade(trade.id)} className="text-slate-500 hover:text-rose-400 transition-colors p-1"><X size={14} /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const CreateProfileModal = () => {
  const { isCreateProfileModalOpen, setIsCreateProfileModalOpen, handleCreateProfile, t, isAuthorized } = useContext(TradeContext);
  const [newProfileName, setNewProfileName] = useState('');

  if (!isCreateProfileModalOpen) return null;
  if (!isAuthorized) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (newProfileName.trim()) {
      handleCreateProfile(newProfileName.trim());
      setNewProfileName('');
      setIsCreateProfileModalOpen(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-white text-xl font-bold">{t('createProfile')}</h2>
          <button onClick={() => setIsCreateProfileModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('profileName')}</label>
            <input 
              type="text" 
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              placeholder="e.g. Crypto Portfolio"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setIsCreateProfileModalOpen(false)} className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors">
              {t('cancel')}
            </button>
            <button type="submit" disabled={!newProfileName.trim()} className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-blue-500/20">
              {t('saveProfile')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const DeleteProfileModal = () => {
  const { isDeleteProfileModalOpen, setIsDeleteProfileModalOpen, handleDeleteProfile, profiles, activeProfile, t, isAuthorized } = useContext(TradeContext);
  if (!isDeleteProfileModalOpen) return null;
  if (!isAuthorized) return null;

  const activeProfileData = profiles.find(p => p.id === activeProfile);

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-rose-900/50 p-6 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-white text-xl font-bold flex items-center gap-2">
            <AlertTriangle className="text-rose-500" size={24} />
            {t('deleteProfile')}
          </h2>
          <button onClick={() => setIsDeleteProfileModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <p className="text-slate-300 mb-6">
          {t('confirmDeleteProfile')} <span className="font-bold text-white">"{activeProfileData?.name}"</span>
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setIsDeleteProfileModalOpen(false)} className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors">
            {t('cancel')}
          </button>
          <button onClick={handleDeleteProfile} className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-500 transition-colors shadow-lg shadow-rose-500/20">
            {t('delete')}
          </button>
        </div>
      </div>
    </div>
  );
};

const AnalyticsCharts = () => {
  const { analytics, empty } = useTradeStats();
  
  if (empty) return null;

  return (
    <div className="mb-8">
      <EquityCurveChart />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <DailyPnLChart />
        <FilterableHorizontalBar titleKey="netPnLAsset" data={analytics.byAsset} filterKey="asset" rotate={true} margin={{ top: 0, right: 0, left: -20, bottom: 40 }} />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <FilterableHorizontalBar titleKey="netPnLSession" data={analytics.bySession} filterKey="session" />
        <FilterableHorizontalBar titleKey="netPnLSetup" data={analytics.bySetup} filterKey="setupScore" />
        <FilterableHorizontalBar titleKey="netPnLSystem" data={analytics.bySystem} filterKey="system" />
      </div>
    </div>
  );
};

const DashboardLogo = () => (
  <div className="relative w-12 h-12 flex items-center justify-center group">
    {/* Outer glowing ring */}
    <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full group-hover:bg-blue-400/30 transition-all duration-700 animate-pulse" />
    
    <svg viewBox="0 0 100 100" className="w-full h-full relative z-10 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]">
      <defs>
        <linearGradient id="logoMetal" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Dashboard Icon - Stylized Bar Chart & Gauge */}
      <rect x="20" y="55" width="12" height="25" rx="2" fill="url(#logoMetal)" filter="url(#glow)" />
      <rect x="44" y="35" width="12" height="45" rx="2" fill="url(#logoMetal)" filter="url(#glow)" />
      <rect x="68" y="45" width="12" height="35" rx="2" fill="url(#logoMetal)" filter="url(#glow)" />
      
      {/* Gauge Arc */}
      <path 
        d="M20 40 A 35 35 0 0 1 80 40" 
        fill="none" 
        stroke="url(#logoMetal)" 
        strokeWidth="4" 
        strokeLinecap="round"
        filter="url(#glow)"
        className="opacity-80"
      />
      <circle cx="50" cy="40" r="3" fill="#60a5fa" />
    </svg>
  </div>
);

const EmailAuth = () => {
  const { isAuthorized, setIsAuthorized, userEmail, setUserEmail, isCheckingAuth, setIsCheckingAuth, t } = useContext(TradeContext);
  const [emailInput, setEmailInput] = useState(userEmail);
  const [error, setError] = useState('');

  // Update active status when authorized
  useEffect(() => {
    if (isAuthorized && userEmail) {
      const updateStatus = async () => {
        try {
          const docRef = doc(db, 'authorizedUsers', userEmail.toLowerCase());
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            await setDoc(docRef, { 
              email: userEmail.toLowerCase(),
              lastLogin: new Date().toISOString(),
              isActive: true
            }, { merge: true });
          }
        } catch (err) {
          console.error("Error updating active status:", err);
        }
      };
      updateStatus();
    }
  }, [isAuthorized, userEmail]);

  const handleCheckEmail = async (e) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    
    setIsCheckingAuth(true);
    setError('');
    
    try {
      const docRef = doc(db, 'authorizedUsers', emailInput.trim().toLowerCase());
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        // Update last login and active status
        await setDoc(docRef, { 
          email: emailInput.trim().toLowerCase(),
          lastLogin: new Date().toISOString(),
          isActive: true
        }, { merge: true });
        
        setIsAuthorized(true);
        setUserEmail(emailInput.trim().toLowerCase());
      } else {
        setIsAuthorized(false);
        setError(t('emailNotAuthorized'));
      }
    } catch (err) {
      console.error("Error checking email:", err);
      setError(t('authError'));
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const handleLogout = () => {
    setIsAuthorized(false);
    setUserEmail('');
    setEmailInput('');
  };

  if (isAuthorized) {
    const adminEmails = ['godji.agito@gmail.com', 'arkkara.pan@gmail.com'];
    const isAdmin = adminEmails.includes(userEmail);
    
    return (
      <div className={`relative group h-[42px] rounded-xl transition-all shadow-[0_10px_20px_-5px_rgba(0,0,0,0.5)] overflow-hidden ${isAdmin ? 'p-[1px]' : ''}`}>
        {/* Spinning pink/purple light for Admin */}
        {isAdmin && <div className="absolute inset-[-200%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0_250deg,#ec4899_300deg,#a855f7_360deg)] opacity-70 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />}
        
        {/* Inner Container */}
        <div className={`relative h-full w-full flex items-center px-4 overflow-hidden ${
          isAdmin 
            ? 'bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 rounded-[11px] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]' 
            : 'bg-gradient-to-b from-emerald-900/40 to-emerald-950/40 border border-emerald-500/30 rounded-xl shadow-[0_10px_30px_-10px_rgba(16,185,129,0.2)]'
        }`}>
          {/* Glare effect for Admin */}
          {isAdmin && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 pointer-events-none" />}
          
          <Unlock size={14} className={`${isAdmin ? 'text-purple-400 drop-shadow-[0_0_5px_rgba(168,85,247,0.5)]' : 'text-emerald-400'} mr-2 relative z-10`} />
          <span className={`text-sm font-bold tracking-wide relative z-10 ${
            isAdmin 
              ? 'text-diamond-rainbow drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]' 
              : 'text-emerald-400'
          }`}>
            {userEmail}
          </span>
          <div className={`w-[1px] h-4 mx-3 relative z-10 ${isAdmin ? 'bg-white/20' : 'bg-emerald-500/30'}`} />
          <button onClick={handleLogout} className={`relative z-10 hover:scale-110 active:scale-95 transition-colors ${isAdmin ? 'text-slate-400 hover:text-rose-400' : 'text-slate-400 hover:text-rose-400'}`} title="Logout">
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleCheckEmail} className="flex items-center gap-2 relative">
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
          <Lock size={14} className="text-slate-400 group-focus-within:text-blue-400 transition-colors" />
        </div>
        <input
          type="email"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          placeholder={t('enterEmailToUnlock')}
          className="h-[42px] bg-gradient-to-b from-slate-800 to-slate-950 border border-slate-700 text-slate-200 text-sm rounded-xl focus:outline-none focus:border-slate-500 focus:shadow-[0_15px_40px_-10px_rgba(0,0,0,0.7)] block w-64 pl-9 pr-3 transition-all duration-500 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] placeholder:text-slate-500"
          disabled={isCheckingAuth}
        />
      </div>
      <button 
        type="submit" 
        disabled={isCheckingAuth || !emailInput.trim()}
        className="relative group overflow-hidden h-[42px] bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 text-white font-black px-6 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 shadow-[0_10px_20px_-5px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] border border-slate-600 text-sm disabled:opacity-50 disabled:hover:scale-100"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
        {isCheckingAuth ? (
          <Loader2 size={16} className="animate-spin text-blue-400 relative z-10 drop-shadow-[0_0_5px_rgba(59,130,246,0.5)]" />
        ) : (
          <Unlock size={16} strokeWidth={3} className="text-blue-400 relative z-10 drop-shadow-[0_0_5px_rgba(59,130,246,0.5)]" />
        )}
        <span className="relative z-10 drop-shadow-sm uppercase tracking-widest">{t('verify')}</span>
      </button>
      {error && <div className="absolute top-full left-0 mt-2 text-xs text-rose-400 font-bold bg-slate-900/90 px-3 py-1.5 rounded-lg border border-rose-500/30 shadow-lg backdrop-blur-sm z-50 animate-in fade-in slide-in-from-top-1">{error}</div>}
    </form>
  );
};

const ShareButton = () => {
  const { trades, settings, activeProfile, profiles, t, isReadOnly } = useContext(TradeContext);
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const activeProfileData = profiles.find(p => p.id === activeProfile);
  const profileName = activeProfileData ? activeProfileData.name : 'Shared Portfolio';

  const exportAsImage = async () => {
    setIsExporting(true);
    setIsOpen(false);
    try {
      // Small delay to allow dropdown to close
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const dashboardElement = document.getElementById('dashboard-content');
      if (!dashboardElement) return;

      const dataUrl = await htmlToImage.toPng(dashboardElement, {
        backgroundColor: '#020617',
        pixelRatio: 2, // Higher quality
      });

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `Trading-Dashboard-${profileName}-${new Date().toISOString().split('T')[0]}.png`;
      link.click();
    } catch (error) {
      console.error('Failed to export image:', error);
      alert('Failed to export image. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const copyShareLink = async () => {
    try {
      setIsExporting(true);
      
      // Create a payload with current profile's data
      const payload = {
        trades,
        settings,
        profileName,
        createdAt: new Date().toISOString()
      };
      
      // Generate a short unique ID
      const shortId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(4);
      
      // Save to Firestore
      await setDoc(doc(db, 'sharedPortfolios', shortId), payload);
      
      // Create shareable URL
      const shareUrl = `${window.location.origin}${window.location.pathname}?shared=${shortId}`;
      
      navigator.clipboard.writeText(shareUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to generate share link:', error);
      alert('Failed to generate share link. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const exportAsCSV = () => {
    try {
      const csv = Papa.unparse(trades);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Trading-Dashboard-${profileName}-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to export CSV:', error);
      alert('Failed to export CSV. Please try again.');
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className="relative group overflow-hidden h-[42px] bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 text-white font-black px-4 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 shadow-[0_10px_20px_-5px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] border border-slate-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
        {isExporting ? (
          <Loader2 size={16} strokeWidth={3} className="text-blue-400 animate-spin relative z-10" />
        ) : (
          <Share2 size={16} strokeWidth={3} className="text-blue-400 drop-shadow-[0_0_5px_rgba(59,130,246,0.5)] relative z-10 group-hover:scale-110 transition-transform" />
        )}
        <span className="relative z-10 drop-shadow-sm uppercase tracking-widest text-xs">{t('share') || 'Share'}</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full right-0 mt-2 w-48 bg-[#0f172a] border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
            <button 
              onClick={exportAsImage}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-300 hover:text-white hover:bg-white/5 transition-colors border-b border-slate-800"
            >
              <Download size={16} className="text-emerald-400" />
              {t('exportImage') || 'Export Image'}
            </button>
            <button 
              onClick={exportAsCSV}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-300 hover:text-white hover:bg-white/5 transition-colors ${!isReadOnly ? 'border-b border-slate-800' : ''}`}
            >
              <Download size={16} className="text-blue-400" />
              {t('exportCSV') || 'Export CSV'}
            </button>
            {!isReadOnly && (
              <button 
                onClick={copyShareLink}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
              >
                {isCopied ? (
                  <Check size={16} className="text-blue-400" />
                ) : (
                  <Link size={16} className="text-blue-400" />
                )}
                {isCopied ? (t('copied') || 'Copied!') : (t('copyLink') || 'Copy Link')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const ImportCSVButton = () => {
  const { importTrades, t } = useContext(TradeContext);
  const fileInputRef = React.useRef(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const newTrades = results.data.map((row: any) => {
            // Basic validation and mapping
            return {
              id: row.id || `TRD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              entryDate: row.entryDate || new Date().toISOString(),
              exitDate: row.exitDate || new Date().toISOString(),
              asset: row.asset || 'UNKNOWN',
              system: row.system || 'Manual',
              timeframe: row.timeframe || '1H',
              direction: row.direction || 'Long',
              setupScore: row.setupScore || 'B',
              session: row.session || 'New York',
              result: row.result || 'Win',
              riskAmount: Number(row.riskAmount) || 0,
              rewardRatio: Number(row.rewardRatio) || 0,
              netPnL: Number(row.netPnL) || 0,
              chartUrl: row.chartUrl || '',
              notes: row.notes || ''
            };
          });

          if (newTrades.length > 0) {
            importTrades(newTrades);
            alert(`Successfully imported ${newTrades.length} trades.`);
          } else {
            alert('No valid trades found in the CSV file.');
          }
        } catch (error) {
          console.error('Error importing CSV:', error);
          alert('Failed to parse CSV data. Please check the format.');
        }
        
        // Reset input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      },
      error: (error) => {
        console.error('CSV Parse Error:', error);
        alert('Failed to read the CSV file.');
      }
    });
  };

  return (
    <>
      <input 
        type="file" 
        accept=".csv" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        className="hidden" 
      />
      <button 
        onClick={() => fileInputRef.current?.click()}
        className="relative group overflow-hidden h-[42px] bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 text-white font-black px-4 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 shadow-[0_10px_20px_-5px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] border border-slate-600 text-sm"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
        <Upload size={16} strokeWidth={3} className="text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)] relative z-10 group-hover:-translate-y-0.5 transition-transform" />
        <span className="relative z-10 drop-shadow-sm uppercase tracking-widest text-xs">{t('importCSV') || 'Import CSV'}</span>
      </button>
    </>
  );
};

const AdminModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [status, setStatus] = useState('พร้อมทำงาน! กรุณาเลือกไฟล์ CSV หรือเพิ่มอีเมล');
  const [loading, setLoading] = useState(false);
  const [manualEmail, setManualEmail] = useState('');
  const [emails, setEmails] = useState<{ id: string, email: string, isActive?: boolean, lastLogin?: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    
    const unsubscribe = onSnapshot(collection(db, "authorizedUsers"), (snapshot) => {
      const emailList = snapshot.docs.map(doc => ({
        id: doc.id,
        email: doc.data().email || '',
        isActive: doc.data().isActive,
        lastLogin: doc.data().lastLogin
      }));
      // Sort by active status (active first), then alphabetically
      emailList.sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return a.email.localeCompare(b.email);
      });
      setEmails(emailList);
    }, (error) => {
      console.error("Error fetching emails:", error);
    });

    return () => unsubscribe();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setStatus('กำลังเตรียมข้อมูล... ⏳');
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        setStatus(`กำลังนำเข้า ${results.data.length} อีเมล... 🚀`);
        let count = 0;
        let duplicateCount = 0;
        
        for (const row of results.data as any[]) {
          const rawEmail = row.email || row.Email || row.EMAIL;
          if (rawEmail) {
            const cleanEmail = rawEmail.toString().trim().toLowerCase();
            
            // Check if email already exists
            const docRef = doc(db, "authorizedUsers", cleanEmail);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
              duplicateCount++;
              continue; // Skip duplicate
            }

            try {
              await setDoc(docRef, { email: cleanEmail });
              count++;
            } catch (err) {
              console.error("Error:", err);
            }
          }
        }
        
        setLoading(false);
        setStatus(`✅ นำเข้าสำเร็จ ${count} อีเมล (ซ้ำ ${duplicateCount} รายการ)`);
      }
    });
  };

  const handleManualAdd = async () => {
    if (!manualEmail.trim()) return;
    setLoading(true);
    setStatus('กำลังตรวจสอบอีเมล... ⏳');
    
    const cleanEmail = manualEmail.trim().toLowerCase();
    
    try {
      const docRef = doc(db, "authorizedUsers", cleanEmail);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        setStatus(`⚠️ อีเมล ${cleanEmail} มีอยู่ในระบบแล้ว`);
      } else {
        await setDoc(docRef, { email: cleanEmail });
        setStatus(`✅ เพิ่มอีเมล ${cleanEmail} สำเร็จ!`);
        setManualEmail('');
      }
    } catch (err) {
      console.error("Error:", err);
      setStatus(`❌ เกิดข้อผิดพลาดในการเพิ่มอีเมล`);
    }
    setLoading(false);
  };

  const handleDeleteEmail = async (emailId: string) => {
    try {
      await deleteDoc(doc(db, "authorizedUsers", emailId));
      setStatus(`✅ ลบอีเมล ${emailId} สำเร็จ!`);
      setConfirmDeleteId(null);
    } catch (err) {
      console.error("Error deleting email:", err);
      setStatus(`❌ เกิดข้อผิดพลาดในการลบอีเมล`);
    }
  };

  const filteredEmails = emails.filter(item => 
    item.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeCount = emails.filter(item => item.isActive).length;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f172a] border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-900/50 shrink-0">
          <h2 className="text-xl font-bold text-blue-400 flex items-center gap-2">
            <Unlock size={20} />
            จัดการสิทธิ์การใช้งาน
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">เพิ่มอีเมล (ทีละรายการ)</label>
                <div className="flex gap-2">
                  <input 
                    type="email" 
                    value={manualEmail}
                    onChange={(e) => setManualEmail(e.target.value)}
                    placeholder="example@email.com"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                    disabled={loading}
                  />
                  <button 
                    onClick={handleManualAdd}
                    disabled={loading || !manualEmail.trim()}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    เพิ่ม
                  </button>
                </div>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-700"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-[#0f172a] text-slate-400">หรือ</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">อัปโหลดไฟล์ CSV (หลายรายการ)</label>
                <div className="relative">
                  <input 
                    type="file" 
                    accept=".csv" 
                    onChange={handleFileUpload} 
                    disabled={loading}
                    className="block w-full text-sm text-slate-400
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-xl file:border-0
                      file:text-sm file:font-semibold
                      file:bg-slate-800 file:text-blue-400
                      hover:file:bg-slate-700 cursor-pointer
                      border border-slate-700 rounded-xl p-2 bg-slate-900/50" 
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">* ไฟล์ CSV ต้องมีคอลัมน์ชื่อ email</p>
              </div>

              <div className={`p-4 rounded-xl border ${status.includes('✅') ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400' : status.includes('❌') || status.includes('⚠️') ? 'bg-rose-900/20 border-rose-500/30 text-rose-400' : 'bg-blue-900/20 border-blue-500/30 text-blue-400'} text-sm text-center font-medium`}>
                {status}
              </div>
            </div>

            <div className="flex flex-col h-full min-h-[400px] border border-slate-700 rounded-xl bg-slate-900/30 overflow-hidden">
              <div className="p-3 border-b border-slate-700 bg-slate-800/50 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-medium text-slate-300">รายชื่ออีเมลในระบบ</h3>
                  <div className="flex gap-2">
                    <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full" title="ผู้ที่เคยเข้าใช้งาน">
                      ใช้งานแล้ว {activeCount}
                    </span>
                    <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full">
                      ทั้งหมด {emails.length}
                    </span>
                  </div>
                </div>
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ค้นหาอีเมล..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-[350px]">
                {filteredEmails.length === 0 ? (
                  <div className="text-center text-slate-500 text-sm py-8">ไม่พบอีเมลที่ค้นหา</div>
                ) : (
                  filteredEmails.map((item) => (
                    <div key={item.id} className="flex justify-between items-center p-2 hover:bg-slate-800/50 rounded-lg group transition-colors">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${item.isActive ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)]' : 'bg-slate-600'}`} title={item.isActive ? `ใช้งานล่าสุด: ${new Date(item.lastLogin || '').toLocaleString('th-TH')}` : 'ยังไม่เคยเข้าใช้งาน'} />
                        <span className={`text-sm truncate pr-2 ${item.isActive ? 'text-emerald-400' : 'text-slate-300'}`}>{item.email}</span>
                      </div>
                      
                      {confirmDeleteId === item.id ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <button 
                            onClick={() => handleDeleteEmail(item.id)}
                            className="text-xs bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white px-2 py-1 rounded transition-colors"
                          >
                            ยืนยันลบ
                          </button>
                          <button 
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs bg-slate-700 text-slate-300 hover:bg-slate-600 px-2 py-1 rounded transition-colors"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                          title="ลบอีเมล"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const DashboardLayout = () => {
  const { t, profiles, activeProfile, handleSwitchProfile, setIsCreateProfileModalOpen, setIsDeleteProfileModalOpen, setIsFormOpen, lang, setLang, isAuthorized, isReadOnly, userEmail } = useContext(TradeContext);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

  const activeProfileData = profiles.find(p => p.id === activeProfile);
  const activeProfileName = activeProfileData ? activeProfileData.name : 'Main Portfolio';

  return (
    <div id="dashboard-content" className="min-h-screen bg-[#020617] text-slate-100 p-8 selection:bg-blue-500/30">
      <header className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-6 group">
          <DashboardLogo />
          <div className="relative">
            <h1 className="text-[44px] leading-[44px] font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-slate-300 to-slate-500 tracking-tighter drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]">
              {t('appTitle')}
            </h1>
            <div className="flex items-center gap-3 mt-1 opacity-80">
              <div className="h-[2px] w-12 bg-gradient-to-r from-blue-500 to-transparent" />
              <p className="text-slate-400 text-xs font-bold tracking-[0.3em] uppercase italic">{t('appSubtitle')}</p>
            </div>
            {/* Subtle metallic reflection line */}
            <div className="absolute -bottom-2 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
          </div>
        </div>

        <div className="flex items-center gap-4 mt-4 flex-wrap justify-end">
          {!isReadOnly && <EmailAuth />}
          
          {/* Admin Button */}
          {['godji.agito@gmail.com', 'arkkara.pan@gmail.com'].includes(userEmail) && (
            <button 
              onClick={() => setIsAdminModalOpen(true)}
              className="relative group h-[42px] rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_10px_20px_-5px_rgba(0,0,0,0.5)] overflow-hidden p-[1px] flex items-center justify-center"
              title="Admin Panel"
            >
              {/* Spinning pink/purple light */}
              <div className="absolute inset-[-200%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0_250deg,#ec4899_300deg,#a855f7_360deg)] opacity-70 group-hover:opacity-100 transition-opacity duration-300" />
              
              {/* Inner Titanium Button */}
              <div className="relative h-full w-full bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 rounded-[11px] flex items-center gap-2 px-4 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                {/* Glare effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                
                {/* Content */}
                <Unlock size={16} strokeWidth={3} className="text-purple-400 drop-shadow-[0_0_5px_rgba(168,85,247,0.5)] relative z-10 group-hover:scale-110 transition-transform" />
                <span className="relative z-10 drop-shadow-sm uppercase tracking-widest text-xs font-black text-white">Admin</span>
              </div>
            </button>
          )}
          
          {/* Premium Profile Selector */}
          <div className="relative group/profile">
            <div className={`flex items-center h-[42px] bg-gradient-to-b from-slate-800 to-slate-950 border border-slate-700 rounded-xl overflow-hidden shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] transition-all duration-500 ${isAuthorized || isReadOnly ? 'hover:border-slate-500 hover:shadow-[0_15px_40px_-10px_rgba(0,0,0,0.7)]' : 'opacity-70'}`}>
              <div 
                className={`flex items-center h-full px-5 gap-3 border-r border-slate-700/50 transition-all duration-300 ${isAuthorized || isReadOnly ? 'cursor-pointer hover:bg-white/5' : 'cursor-not-allowed'}`} 
                onClick={() => (isAuthorized || isReadOnly) && !isReadOnly && setIsDropdownOpen(!isDropdownOpen)}
                title={!isAuthorized && !isReadOnly ? t('enterEmailToUnlock') : ''}
              >
                <div className="p-1 rounded-lg bg-slate-900 border border-slate-700 shadow-inner">
                  {isAuthorized || isReadOnly ? <Briefcase size={14} className="text-blue-400" /> : <Lock size={14} className="text-slate-500" />}
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className={`font-black text-sm tracking-tight ${isAuthorized || isReadOnly ? 'text-white' : 'text-slate-400'}`}>{activeProfileName}</span>
                    {!isReadOnly && <ChevronDown size={14} className={`text-slate-500 transition-transform duration-500 ${isDropdownOpen ? 'rotate-180' : ''}`} />}
                  </div>
                </div>
              </div>
              
              {isAuthorized && !isReadOnly && (
                <button 
                  onClick={() => setIsCreateProfileModalOpen(true)} 
                  className="px-4 h-full hover:bg-blue-500/10 transition-all duration-300 text-blue-400 group/btn relative overflow-hidden"
                  title={t('createProfile')}
                >
                  <div className="absolute inset-0 bg-blue-500/0 group-hover/btn:bg-blue-500/5 transition-colors" />
                  <Plus size={20} className="relative z-10 drop-shadow-md" />
                </button>
              )}
            </div>

            {/* Premium Dropdown Menu */}
            {isDropdownOpen && !isReadOnly && (
              <div className="absolute top-full right-0 mt-3 w-64 bg-[#0f172a] border border-slate-700 rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.7)] z-50 overflow-hidden backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="p-2 bg-slate-900/50 border-b border-slate-800">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] px-3 py-1">{t('switchProfile')}</p>
                </div>
                <div className="py-2 max-h-[300px] overflow-y-auto scrollbar-hide">
                  {profiles.map(profile => (
                    <div 
                      key={profile.id}
                      className={`px-4 py-3 cursor-pointer flex items-center justify-between hover:bg-white/5 transition-all duration-200 group/item ${profile.id === activeProfile ? 'bg-blue-500/5' : ''}`}
                      onClick={() => {
                        handleSwitchProfile(profile.id);
                        setIsDropdownOpen(false);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${profile.id === activeProfile ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)] scale-125' : 'bg-slate-700 group-hover/item:bg-slate-500'}`} />
                        <span className={`text-sm tracking-tight ${profile.id === activeProfile ? 'text-white font-bold' : 'text-slate-400 group-hover/item:text-slate-200'}`}>
                          {profile.name}
                        </span>
                      </div>
                      {profile.id === activeProfile && <Check size={16} className="text-blue-400" />}
                    </div>
                  ))}
                </div>
                {activeProfile !== 'default' && isAuthorized && (
                  <div className="border-t border-slate-800 p-2 bg-slate-950/30">
                    <button 
                      onClick={() => {
                        setIsDeleteProfileModalOpen(true);
                        setIsDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all duration-300 uppercase tracking-widest"
                    >
                      <Trash2 size={14} />
                      {t('deleteProfile')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Add Data Button - Titanium Style */}
          {isAuthorized && !isReadOnly && (
            <button 
              onClick={() => setIsFormOpen(true)} 
              className="relative group overflow-hidden h-[42px] bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 text-white font-black px-6 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 shadow-[0_10px_20px_-5px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] border border-slate-600 text-sm"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              <Plus size={16} strokeWidth={4} className="text-blue-400 drop-shadow-[0_0_5px_rgba(59,130,246,0.5)]" />
              <span className="relative z-10 drop-shadow-sm uppercase tracking-widest">{t('addData')}</span>
            </button>
          )}

          {isAuthorized && !isReadOnly && <ImportCSVButton />}

          {(isAuthorized || isReadOnly) && <ShareButton />}

          {/* Language Toggle - Titanium Style */}
          <button 
            onClick={() => setLang(lang === 'en' ? 'th' : 'en')}
            className="relative group overflow-hidden h-[42px] bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 text-white font-black px-4 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 shadow-[0_10px_20px_-5px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] border border-slate-600 text-sm"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
            <Globe size={16} strokeWidth={3} className="text-slate-400 group-hover:text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.3)] relative z-10 transition-colors" />
            <span className="relative z-10 drop-shadow-sm uppercase tracking-widest text-xs text-slate-300 group-hover:text-white transition-colors">{lang === 'en' ? 'TH' : 'EN'}</span>
          </button>
        </div>
      </header>
      <ExecutiveSummary />
      <AnalyticsCharts />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <YearlyPnLChart />
        <DurationPnLChart />
      </div>
      <TradeTable />
      <DataSettingsModal />
      <CreateProfileModal />
      <DeleteProfileModal />
      <AdminModal isOpen={isAdminModalOpen} onClose={() => setIsAdminModalOpen(false)} />
    </div>
  );
};
