import React, { useState, useMemo, useEffect, createContext, useContext } from 'react';
import { INITIAL_CAPITAL, TRANSLATIONS } from '../constants';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

export interface Trade {
  id: string;
  entryDate: string;
  exitDate: string;
  asset: string;
  system: string;
  timeframe: string;
  direction: string;
  setupScore: string;
  session: string;
  result: string;
  riskAmount: number;
  rewardRatio: number;
  netPnL: number;
  chartUrl: string;
}

export const TradeContext = createContext<{
  profiles: any[];
  activeProfile: string;
  handleSwitchProfile: (id: string) => void;
  handleCreateProfile: (name: string) => void;
  handleDeleteProfile: () => void;
  isProfileModalOpen: boolean;
  setIsProfileModalOpen: (open: boolean) => void;
  isDeleteProfileModalOpen: boolean;
  setIsDeleteProfileModalOpen: (open: boolean) => void;
  isCreateProfileModalOpen: boolean;
  setIsCreateProfileModalOpen: (open: boolean) => void;
  trades: Trade[];
  addTrade: (trade: Omit<Trade, 'id'>) => void;
  updateTrade: (trade: Trade) => void;
  deleteTrade: (id: string) => void;
  importTrades: (trades: Trade[]) => void;
  settings: { capital: number; riskPercent: number; useCompounding?: boolean; customAssets?: string[]; customSystems?: string[] };
  setSettings: (settings: any) => void;
  filters: any;
  toggleFilter: (key: string, value: string) => void;
  clearFilters: () => void;
  isFormOpen: boolean;
  setIsFormOpen: (open: boolean) => void;
  editingTrade: Trade | null;
  setEditingTrade: (trade: Trade | null) => void;
  lang: string;
  setLang: (lang: string) => void;
  t: (key: string) => string;
  isAuthorized: boolean;
  setIsAuthorized: (auth: boolean) => void;
  userEmail: string;
  setUserEmail: (email: string) => void;
  isCheckingAuth: boolean;
  setIsCheckingAuth: (checking: boolean) => void;
  isReadOnly: boolean;
}>(null as any);

const generateMockTrades = () => {
  const assets = ['XAUUSD', 'EURUSD', 'NAS100', 'GBPUSD', 'US30'];
  const systems = ['SMC', 'ICT', '2TF'];
  const sessions = ['Asia', 'London', 'New York'];
  const tfs = ['M1', 'M2', 'M5', 'M15', 'M30', 'H1', 'H2', 'H4', 'D1'];
  const setups = ['A+', 'A', 'B', 'C', 'D', 'E'];
  
  let trades = [];
  let currentDate = new Date('2024-01-01T08:00:00');
  
  for (let i = 1; i <= 50; i++) {
    const isWin = Math.random() > 0.45;
    const asset = assets[Math.floor(Math.random() * assets.length)];
    const system = systems[Math.floor(Math.random() * systems.length)];
    const pnl = isWin ? (Math.random() * 200 + 50) : -(Math.random() * 100 + 50);
    const holdHours = Math.floor(Math.random() * 8) + 1;
    const exitDate = new Date(currentDate.getTime() + (holdHours * 60 * 60 * 1000));
    
    trades.push({
      id: `TRD-${i.toString().padStart(3, '0')}`,
      entryDate: currentDate.toISOString().slice(0, 16),
      exitDate: exitDate.toISOString().slice(0, 16),
      asset,
      system,
      timeframe: tfs[Math.floor(Math.random() * tfs.length)],
      direction: Math.random() > 0.5 ? 'Buy' : 'Sell',
      setupScore: setups[Math.floor(Math.random() * setups.length)],
      session: sessions[Math.floor(Math.random() * sessions.length)],
      result: isWin ? 'TP' : (pnl > -10 ? 'BE' : 'SL'),
      riskAmount: 100,
      rewardRatio: parseFloat((pnl/100).toFixed(2)),
      netPnL: parseFloat(pnl.toFixed(2)),
      chartUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&q=80&w=800'
    });
    
    currentDate = new Date(exitDate.getTime() + (Math.random() * 15 * 24 * 60 * 60 * 1000));
  }
  return trades;
};

export const TradeProvider = ({ children }) => {
  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState('');
  const [trades, setTrades] = useState([]);
  const [settings, setSettings] = useState({ capital: INITIAL_CAPITAL, riskPercent: 1, useCompounding: false });
  const [filters, setFilters] = useState({});
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isCreateProfileModalOpen, setIsCreateProfileModalOpen] = useState(false);
  const [isDeleteProfileModalOpen, setIsDeleteProfileModalOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [lang, setLang] = useState('en');

  const [isAuthorized, setIsAuthorized] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);

  const loadProfileData = (profileId) => {
    const savedTrades = localStorage.getItem(`friday_trades_${profileId}`);
    const savedSettings = localStorage.getItem(`friday_settings_${profileId}`);
    
    if (savedTrades) {
      setTrades(JSON.parse(savedTrades));
    } else {
      setTrades(profileId === 'default' ? generateMockTrades() : []); 
    }
    
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    } else {
      setSettings({ capital: INITIAL_CAPITAL, riskPercent: 1, useCompounding: false, customAssets: [], customSystems: [] });
    }
  };

  const loadLocalData = () => {
    const savedLang = localStorage.getItem('friday_lang');
    if (savedLang) setLang(savedLang);

    const savedEmail = localStorage.getItem('friday_user_email');
    if (savedEmail) setUserEmail(savedEmail);
    
    const savedAuth = localStorage.getItem('friday_is_authorized');
    if (savedAuth === 'true') setIsAuthorized(true);

    const savedProfiles = localStorage.getItem('friday_profiles');
    const savedActive = localStorage.getItem('friday_active_profile');
    
    const fallbackDefaultName = savedLang === 'th' ? "พอร์ตหลัก" : "Main Portfolio";
    
    const initialProfiles = savedProfiles ? JSON.parse(savedProfiles) : [{ id: 'default', name: fallbackDefaultName }];
    const initialActive = savedActive || 'default';
    
    setProfiles(initialProfiles);
    setActiveProfile(initialActive);
    
    loadProfileData(initialActive);
    setIsLoaded(true);
  };

  useEffect(() => {
    // Check for shared data in URL
    const urlParams = new URLSearchParams(window.location.search);
    const sharedData = urlParams.get('shared');
    
    if (sharedData) {
      const fetchSharedData = async () => {
        try {
          // First try to parse as base64 (for backwards compatibility with old links)
          try {
            const decoded = JSON.parse(atob(decodeURIComponent(sharedData)));
            if (decoded && decoded.trades) {
              setTrades(decoded.trades || []);
              setSettings(decoded.settings || { capital: INITIAL_CAPITAL, riskPercent: 1, useCompounding: false, customAssets: [], customSystems: [] });
              setProfiles([{ id: 'shared', name: decoded.profileName || 'Shared Portfolio' }]);
              setActiveProfile('shared');
              setIsReadOnly(true);
              setIsAuthorized(false);
              setIsLoaded(true);
              window.history.replaceState({}, document.title, window.location.pathname);
              return;
            }
          } catch (e) {
            // Not a valid base64 JSON, proceed to fetch from Firestore
          }

          // Fetch from Firestore using the short ID
          const docRef = doc(db, 'sharedPortfolios', sharedData);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const data = docSnap.data();
            setTrades(data.trades || []);
            setSettings(data.settings || { capital: INITIAL_CAPITAL, riskPercent: 1, useCompounding: false, customAssets: [], customSystems: [] });
            setProfiles([{ id: 'shared', name: data.profileName || 'Shared Portfolio' }]);
            setActiveProfile('shared');
            setIsReadOnly(true);
            setIsAuthorized(false);
            setIsLoaded(true);
            
            // Clean up URL without refreshing
            window.history.replaceState({}, document.title, window.location.pathname);
          } else {
            console.error('Shared portfolio not found');
            loadLocalData();
          }
        } catch (e) {
          console.error('Failed to fetch shared data', e);
          loadLocalData();
        }
      };
      
      fetchSharedData();
      return;
    }

    loadLocalData();
  }, []);

  useEffect(() => {
    if (isLoaded && activeProfile && !isReadOnly) {
      localStorage.setItem(`friday_trades_${activeProfile}`, JSON.stringify(trades));
      localStorage.setItem(`friday_settings_${activeProfile}`, JSON.stringify(settings));
      localStorage.setItem('friday_profiles', JSON.stringify(profiles));
      localStorage.setItem('friday_active_profile', activeProfile);
      localStorage.setItem('friday_lang', lang);
      localStorage.setItem('friday_user_email', userEmail);
      localStorage.setItem('friday_is_authorized', isAuthorized.toString());
    }
  }, [trades, settings, profiles, activeProfile, lang, isAuthorized, userEmail, isLoaded, isReadOnly]);

  const handleSwitchProfile = (newProfileId) => {
    setActiveProfile(newProfileId);
    clearFilters(); 
    loadProfileData(newProfileId);
  };

  const handleCreateProfile = (name) => {
    const newId = `prof-${Date.now()}`;
    setProfiles([...profiles, { id: newId, name }]);
    handleSwitchProfile(newId);
    setIsProfileModalOpen(false);
  };

  const handleDeleteProfile = () => {
    if (activeProfile === 'default') return;
    const newProfiles = profiles.filter(p => p.id !== activeProfile);
    setProfiles(newProfiles);
    localStorage.removeItem(`friday_trades_${activeProfile}`);
    localStorage.removeItem(`friday_settings_${activeProfile}`);
    handleSwitchProfile('default');
    setIsDeleteProfileModalOpen(false);
  };

  const addTrade = (trade) => setTrades([...trades, { ...trade, id: `TRD-${Date.now()}` }]);
  const updateTrade = (updatedTrade) => setTrades(trades.map(t => t.id === updatedTrade.id ? updatedTrade : t));
  const deleteTrade = (id) => setTrades(trades.filter(t => t.id !== id));
  const importTrades = (newTrades) => setTrades(prev => [...prev, ...newTrades]);
  const clearFilters = () => setFilters({});

  const toggleFilter = (key, value) => {
    setFilters(prev => {
      const newFilters = { ...prev };
      if (newFilters[key] === value) delete newFilters[key];
      else newFilters[key] = value;
      return newFilters;
    });
  };

  const t = (key) => TRANSLATIONS[lang][key] || key;

  return (
    <TradeContext.Provider value={{
      profiles, activeProfile, handleSwitchProfile, handleCreateProfile, handleDeleteProfile,
      isProfileModalOpen, setIsProfileModalOpen, isDeleteProfileModalOpen, setIsDeleteProfileModalOpen,
      isCreateProfileModalOpen, setIsCreateProfileModalOpen,
      trades, addTrade, updateTrade, deleteTrade, importTrades, settings, setSettings,
      filters, toggleFilter, clearFilters, isFormOpen, setIsFormOpen,
      editingTrade, setEditingTrade, lang, setLang, t,
      isAuthorized, setIsAuthorized, userEmail, setUserEmail, isCheckingAuth, setIsCheckingAuth,
      isReadOnly
    }}>
      {children}
    </TradeContext.Provider>
  );
};

export const useTradeStats = () => {
  const { trades, settings, filters } = useContext(TradeContext);

  return useMemo(() => {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    const filteredTrades = trades.filter(t => {
      for (let key in filters) {
        if (key === 'dayOfWeek') {
          if (dayNames[new Date(t.entryDate).getDay()] !== filters[key]) return false;
        } else if (key === 'month') {
          if (monthNames[new Date(t.exitDate).getMonth()] !== filters[key]) return false;
        } else if (key === 'durationBucket') {
          const durationMs = new Date(t.exitDate).getTime() - new Date(t.entryDate).getTime();
          const hours = durationMs / (1000 * 60 * 60);
          let bucket = '>24h';
          if (hours <= 2) bucket = '0-2h';
          else if (hours <= 4) bucket = '2-4h';
          else if (hours <= 6) bucket = '4-6h';
          else if (hours <= 8) bucket = '6-8h';
          else if (hours <= 10) bucket = '8-10h';
          else if (hours <= 12) bucket = '10-12h';
          else if (hours <= 14) bucket = '12-14h';
          else if (hours <= 16) bucket = '14-16h';
          else if (hours <= 18) bucket = '16-18h';
          else if (hours <= 20) bucket = '18-20h';
          else if (hours <= 22) bucket = '20-22h';
          else if (hours <= 24) bucket = '22-24h';
          if (bucket !== filters[key]) return false;
        } else if (t[key as keyof Trade] !== filters[key]) {
          return false;
        }
      }
      return true;
    });

    if (filteredTrades.length === 0) return { 
      empty: true, 
      equityCurve: [], 
      stats: {}, 
      analytics: { 
        byAsset: [], 
        bySystem: [], 
        bySession: [], 
        bySetup: [], 
        byDayOfWeek: [], 
        yearlyStats: {}, 
        availableYears: [], 
        durationStats: [] 
      } 
    };

    const sortedByTime = [...filteredTrades].sort((a, b) => new Date(a.exitDate).getTime() - new Date(b.exitDate).getTime());
    
    let runningBalance = Number(settings.capital) || 0;
    let peak = runningBalance;
    let maxDrawdown = 0;
    
    let totalWinningR = 0;
    let totalLosingR = 0;
    let totalNetR = 0; 
    let totalWinningPnL = 0;
    let totalLosingPnL = 0;
    let wins = 0;
    let losses = 0;
    let totalHoldSeconds = 0;

    const yearlyStats: Record<number, { month: string, profit: number, loss: number, net: number, trades: number }[]> = {};
    const availableYearsSet = new Set<number>();

    const analyzedTrades = sortedByTime.map((t, idx) => {
      let rMultiple = Number(t.rewardRatio) || 0; 
      let actualPnL = Number(t.netPnL) || 0;
      let riskAmount = Number(t.riskAmount) || 0;

      if (settings.useCompounding) {
        riskAmount = runningBalance * (settings.riskPercent / 100);
        actualPnL = riskAmount * rMultiple;
      }

      totalNetR += rMultiple;
      if (rMultiple > 0) totalWinningR += rMultiple;
      if (rMultiple < 0) totalLosingR += Math.abs(rMultiple);

      if (actualPnL > 0) { totalWinningPnL += actualPnL; wins++; }
      else if (actualPnL < 0) { totalLosingPnL += Math.abs(actualPnL); losses++; }

      runningBalance += actualPnL;
      
      if (runningBalance > peak) peak = runningBalance;
      
      let drawdownPercent = 0;
      if (peak > 0) {
        drawdownPercent = ((runningBalance - peak) / peak) * 100;
      }
      if (drawdownPercent < maxDrawdown) maxDrawdown = drawdownPercent;

      const entryDate = new Date(t.entryDate);
      const exitDate = new Date(t.exitDate);
      totalHoldSeconds += (exitDate.getTime() - entryDate.getTime()) / 1000;

      const year = exitDate.getFullYear();
      availableYearsSet.add(year);
      if (!yearlyStats[year]) {
        yearlyStats[year] = monthNames.map(m => ({ month: m, profit: 0, loss: 0, net: 0, trades: 0 }));
      }
      
      const monthName = monthNames[exitDate.getMonth()];
      const monthData = yearlyStats[year].find(m => m.month === monthName);
      if (actualPnL > 0) {
        monthData.profit += actualPnL;
      } else if (actualPnL < 0) {
        monthData.loss += actualPnL; 
      }
      monthData.net += actualPnL;
      monthData.trades += 1;

      return {
        ...t,
        netPnL: settings.useCompounding ? actualPnL : t.netPnL,
        riskAmount: settings.useCompounding ? riskAmount : t.riskAmount,
        rMultiple,
        actualPnL: actualPnL, 
        runningBalance: parseFloat(runningBalance.toFixed(2)),
        peak: peak,
        drawdown: parseFloat(drawdownPercent.toFixed(2)),
        underwater: peak - runningBalance,
        tradeNum: idx + 1
      };
    });

    const netProfit = totalWinningPnL - totalLosingPnL;
    const totalTrades = analyzedTrades.length; 
    const breakEvens = totalTrades - wins - losses; 
    
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const profitFactor = totalLosingPnL > 0 ? totalWinningPnL / totalLosingPnL : (totalWinningPnL > 0 ? 99 : 0);
    
    const avgWinR = wins > 0 ? totalWinningR / wins : 0;
    const avgLossR = losses > 0 ? totalLosingR / losses : 0;
    const avgRRR = avgLossR > 0 ? avgWinR / avgLossR : avgWinR;
    
    const expectancyR = totalTrades > 0 ? totalNetR / totalTrades : 0;
    const expectancyUSD = totalTrades > 0 ? netProfit / totalTrades : 0; 
    const avgHoldHours = totalTrades > 0 ? (totalHoldSeconds / totalTrades) / 3600 : 0;

    const equityCurve = [
      { tradeNum: 0, balance: Number(settings.capital) || 0, peak: Number(settings.capital) || 0, drawdown: 0, underwater: 0 },
      ...analyzedTrades.map(t => ({
        tradeNum: t.tradeNum,
        date: t.exitDate.split('T')[0],
        balance: t.runningBalance,
        peak: t.peak,
        drawdown: t.drawdown,
        underwater: t.underwater
      }))
    ];

    const aggregateBy = (key: keyof Trade) => {
      const groups: Record<string, { name: string, wins: number, total: number, pnl: number, rMultiple: number, profit: number, loss: number, net: number, trades: number }> = {};
      analyzedTrades.forEach(t => {
        const val = String(t[key]);
        if (!groups[val]) groups[val] = { name: val, wins: 0, total: 0, pnl: 0, rMultiple: 0, profit: 0, loss: 0, net: 0, trades: 0 };
        if (t.netPnL > 0) {
          groups[val].wins++;
          groups[val].profit += t.netPnL;
        } else if (t.netPnL < 0) {
          groups[val].loss += t.netPnL;
        }
        
        groups[val].total++; 
        groups[val].trades++;
        groups[val].pnl += t.netPnL;
        groups[val].net += t.netPnL;
        groups[val].rMultiple += t.rewardRatio;
      });
      return Object.values(groups)
        .map(g => ({
          ...g,
          winRate: g.total > 0 ? parseFloat(((g.wins / g.total) * 100).toFixed(1)) : 0,
          pnl: parseFloat(g.pnl.toFixed(2)),
          profit: parseFloat(g.profit.toFixed(2)),
          loss: parseFloat(g.loss.toFixed(2)),
          net: parseFloat(g.net.toFixed(2)),
          rMultiple: parseFloat(g.rMultiple.toFixed(2))
      }))
      .sort((a, b) => b.pnl - a.pnl); 
    };

    const dayDataMap = {
      "Mon": { name: "Mon", pnl: 0, rMultiple: 0, sort: 1, trades: 0, profit: 0, loss: 0, net: 0 },
      "Tue": { name: "Tue", pnl: 0, rMultiple: 0, sort: 2, trades: 0, profit: 0, loss: 0, net: 0 },
      "Wed": { name: "Wed", pnl: 0, rMultiple: 0, sort: 3, trades: 0, profit: 0, loss: 0, net: 0 },
      "Thu": { name: "Thu", pnl: 0, rMultiple: 0, sort: 4, trades: 0, profit: 0, loss: 0, net: 0 },
      "Fri": { name: "Fri", pnl: 0, rMultiple: 0, sort: 5, trades: 0, profit: 0, loss: 0, net: 0 },
    };

    const durationBuckets = ['0-2h', '2-4h', '4-6h', '6-8h', '8-10h', '10-12h', '12-14h', '14-16h', '16-18h', '18-20h', '20-22h', '22-24h', '>24h'];
    const durationStatsObj = {};
    durationBuckets.forEach(b => durationStatsObj[b] = { bucket: b, profit: 0, loss: 0, net: 0, trades: 0 });

    analyzedTrades.forEach(t => {
      const d = new Date(t.entryDate);
      const dayName = dayNames[d.getDay()];
      if (dayDataMap[dayName]) {
        if (t.actualPnL > 0) dayDataMap[dayName].profit += t.actualPnL;
        else if (t.actualPnL < 0) dayDataMap[dayName].loss += t.actualPnL;
        dayDataMap[dayName].pnl += t.actualPnL;
        dayDataMap[dayName].net += t.actualPnL;
        dayDataMap[dayName].rMultiple += t.rMultiple;
        dayDataMap[dayName].trades += 1;
      }

      // 🔥 Calculate Duration Buckets
      const durationMs = new Date(t.exitDate).getTime() - new Date(t.entryDate).getTime();
      const hours = durationMs / (1000 * 60 * 60);
      let bucketKey = '>24h';
      if (hours <= 2) bucketKey = '0-2h';
      else if (hours <= 4) bucketKey = '2-4h';
      else if (hours <= 6) bucketKey = '4-6h';
      else if (hours <= 8) bucketKey = '6-8h';
      else if (hours <= 10) bucketKey = '8-10h';
      else if (hours <= 12) bucketKey = '10-12h';
      else if (hours <= 14) bucketKey = '12-14h';
      else if (hours <= 16) bucketKey = '14-16h';
      else if (hours <= 18) bucketKey = '16-18h';
      else if (hours <= 20) bucketKey = '18-20h';
      else if (hours <= 22) bucketKey = '20-22h';
      else if (hours <= 24) bucketKey = '22-24h';

      if (t.actualPnL > 0) durationStatsObj[bucketKey].profit += t.actualPnL;
      else if (t.actualPnL < 0) durationStatsObj[bucketKey].loss += t.actualPnL;
      durationStatsObj[bucketKey].net += t.actualPnL;
      durationStatsObj[bucketKey].trades += 1;
    });
    
    const byDayOfWeek = Object.values(dayDataMap)
      .sort((a, b) => a.sort - b.sort)
      .map(d => ({ 
        ...d, 
        pnl: parseFloat(d.pnl.toFixed(2)), 
        profit: parseFloat(d.profit.toFixed(2)),
        loss: parseFloat(d.loss.toFixed(2)),
        net: parseFloat(d.net.toFixed(2)),
        rMultiple: parseFloat(d.rMultiple.toFixed(2)) 
      }));

    const availableYears = Array.from(availableYearsSet).sort((a, b) => b - a);

    return {
      empty: false,
      rawTrades: analyzedTrades,
      stats: {
        currentBalance: runningBalance, netProfit, winRate, profitFactor, avgRRR, expectancyR, expectancyUSD, 
        maxDrawdown, avgHoldHours, totalTrades, wins, losses, breakEvens, grossProfit: totalWinningPnL, grossLoss: totalLosingPnL
      },
      equityCurve,
      analytics: {
        byAsset: aggregateBy('asset'),
        bySystem: aggregateBy('system'),
        bySession: aggregateBy('session'),
        bySetup: aggregateBy('setupScore'),
        byDayOfWeek,
        yearlyStats,
        availableYears,
        durationStats: durationBuckets.map(b => ({
          bucket: b,
          profit: parseFloat(durationStatsObj[b].profit.toFixed(2)),
          loss: parseFloat(durationStatsObj[b].loss.toFixed(2)),
          net: parseFloat(durationStatsObj[b].net.toFixed(2)),
          trades: durationStatsObj[b].trades
        }))
      }
    };
  }, [trades, settings, filters]);
};
