import React, { useState, useEffect, useRef } from 'react';
import { TF_SECONDS } from './constants';
import { SymbolType, TimeframeType, TraderProfile, DragTradeUpdate } from './types';
import { ChartContainer, ChartRef } from './components/ChartContainer';
import { AccountDashboard } from './components/AccountDashboard';
import { OrderPanel } from './components/OrderPanel';
import { DrawingManager } from './components/DrawingManager';
import { DrawingSettingsModal } from './components/DrawingSettingsModal';
import { ChallengeSetupModal } from './components/ChallengeSetupModal';
import { DetailedStats } from './components/DetailedStats';
import { MarketStructureWidget } from './components/MarketStructureWidget';
import { IndicatorSettingsModal } from './components/IndicatorSettingsModal';
import { useSimulationEngine } from './hooks/useSimulationEngine';
import { useTradingLogic } from './hooks/useTradingLogic';
import { useDrawingsAndTools } from './hooks/useDrawingsAndTools';

const STORAGE_KEY = 'protrade_profiles_v2';

const App: React.FC = () => {
  const [profiles, setProfiles] = useState<TraderProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState<TraderProfile | null>(null);

  const [activeSymbol, setActiveSymbol] = useState<SymbolType>('EURUSD');
  const [activeTimeframe, setActiveTimeframe] = useState<TimeframeType>('H1');
  
  const [showStats, setShowStats] = useState<boolean>(false);
  const [activeDragTrade, setActiveDragTrade] = useState<DragTradeUpdate | null>(null);
  const [showMarketStructure, setShowMarketStructure] = useState<boolean>(false);

  const chartRef = useRef<ChartRef>(null);

  const {
      chartData,
      warmupDataRef,
      isLoading,
      setIsLoading,
      showDataError,
      setShowDataError,
      simState,
      setSimState,
      currentSimTime,
      setCurrentSimTime,
      currentSlice,
      tradingPrice,
      lastTime,
      currentDigits,
      handleSymbolChange: engineHandleSymbolChange,
      handleJumpToDate,
      handleJumpToFirstData,
      handleLoadMoreHistory,
      handleStep,
      resetSimulation
  } = useSimulationEngine(activeSymbol, activeTimeframe, activeProfileId, activeProfile, chartRef);

  const {
      account,
      setAccount,
      handleModifyTrade,
      handleModifyOrderEntry,
      handleUpdateTrade,
      handleCloseOrder,
      handlePlaceOrder,
      resetAccount
  } = useTradingLogic(activeSymbol, currentSimTime, tradingPrice, currentSlice, simState, setSimState);

  const {
      allDrawings,
      setAllDrawings,
      activeTool,
      setActiveTool,
      magnetMode,
      setMagnetMode,
      selectedDrawingId,
      setSelectedDrawingId,
      editingDrawingId,
      setEditingDrawingId,
      showDrawingManager,
      setShowDrawingManager,
      drawingSettings,
      setDrawingSettings,
      currentDrawings,
      hasKillZone,
      activeKillZoneConfig,
      indicatorConfigs,
      editingIndicator,
      setEditingIndicator,
      rsiData,
      macdData,
      showIndicatorMenu,
      setShowIndicatorMenu,
      slicedEmaMap,
      toggleIndicator,
      handleRemoveIndicator,
      handleIndicatorUpdate,
      handleAddIndicator,
      handleAddAutoKillZone,
      handleDrawingCreate,
      handleDrawingUpdate,
      handleDrawingDelete,
      resetDrawings
  } = useDrawingsAndTools(activeSymbol, currentSimTime, tradingPrice, chartData, warmupDataRef, lastTime);

  const isLoadedRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { 
        try { 
            setProfiles(JSON.parse(saved)); 
        } catch(e) {
            console.error("Failed to parse profiles", e);
        } 
    }
    isLoadedRef.current = true;
    setIsLoading(false);
  }, [setIsLoading]);

  useEffect(() => { 
      if (isLoadedRef.current) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles)); 
      }
  }, [profiles]);

  useEffect(() => {
    if (activeProfileId) {
        setProfiles(prev => prev.map(p => {
            if (p.id === activeProfileId) {
                return {
                    ...p, lastPlayed: Date.now(), account, activeSymbol, activeTimeframe,
                    currentSimTime: currentSimTime > 0 ? currentSimTime : p.currentSimTime, drawings: allDrawings
                };
            }
            return p;
        }));
    }
  }, [account, activeSymbol, activeTimeframe, currentSimTime, activeProfileId, allDrawings]);

  useEffect(() => {
      let interval: number;
      if (activeProfileId) {
          interval = window.setInterval(() => {
              setProfiles(prev => prev.map(p => {
                  if (p.id === activeProfileId) {
                      return { ...p, timePlayed: (p.timePlayed || 0) + 1 };
                  }
                  return p;
              }));
              setActiveProfile(prev => prev ? { ...prev, timePlayed: (prev.timePlayed || 0) + 1 } : null);
          }, 1000);
      }
      return () => clearInterval(interval);
  }, [activeProfileId]);

  const handleCreateProfile = (name: string, balance: number, symbols: SymbolType[], startDate: number, endDate: number, timeframe: TimeframeType = 'H1', customDigits?: number) => {
      const newProfile: TraderProfile = {
          id: Math.random().toString(36).substr(2, 9), name, createdAt: Date.now(), lastPlayed: Date.now(),
          timePlayed: 0,
          account: { balance, equity: balance, maxEquity: balance, maxDrawdown: 0, history: [] },
          activeSymbol: symbols[0], activeTimeframe: timeframe, currentSimTime: startDate,
          selectedSymbols: symbols, startDate, endDate, drawings: [],
          customDigits
      };
      setProfiles(prev => [...prev, newProfile]);
      handleSelectProfile(newProfile);
  };

  const handleSelectProfile = (profile: TraderProfile) => {
      setAccount(profile.account); setActiveSymbol(profile.activeSymbol); setActiveTimeframe(profile.activeTimeframe);
      setCurrentSimTime(profile.currentSimTime); setActiveProfileId(profile.id); setActiveProfile(profile);
      setAllDrawings(profile.drawings || []); 
      resetSimulation();
      setIsLoading(true); 
  };

  const onSymbolChange = (newSymbol: SymbolType) => {
      setActiveSymbol(newSymbol);
      engineHandleSymbolChange(newSymbol);
  };

  const handleDeleteProfile = (id: string) => {
      setProfiles(prev => prev.filter(p => p.id !== id));
      if (activeProfileId === id) { setActiveProfileId(null); setActiveProfile(null); }
  };

  const handleExitProfile = () => {
      setActiveProfileId(null); setActiveProfile(null);
      resetAccount();
      resetSimulation();
      resetDrawings();
  };

  if (!activeProfileId || !activeProfile) {
      return (
        <ChallengeSetupModal profiles={profiles} onStart={handleSelectProfile} onCreate={handleCreateProfile} onDelete={handleDeleteProfile} />
      );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[#09090b] text-zinc-200 overflow-hidden">
      <AccountDashboard 
        account={account} currentPrice={tradingPrice} currentDate={currentSimTime} activeSymbol={activeSymbol} activeTimeframe={activeTimeframe} simState={simState} availableSymbols={activeProfile.selectedSymbols || []}
        pricePrecision={currentDigits}
        onSymbolChange={onSymbolChange} onTimeframeChange={setActiveTimeframe} onPlayPause={() => setSimState(s => ({...s, isPlaying: !s.isPlaying}))} onNext={handleStep} onSpeedChange={(v) => setSimState(s => ({...s, speed: v}))} onJumpToDate={handleJumpToDate} onToggleStats={() => setShowStats(true)} onExit={handleExitProfile}
      />
      
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="flex flex-col items-center">
            <svg width="60" height="60" viewBox="0 0 50 50" fill="none" className="mb-6">
              <path d="M5 25H15L20 10L30 40L35 25H45" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="animate-[dash_1.5s_ease-in-out_infinite]" strokeDasharray="100" strokeDashoffset="100"/>
              <style>{`@keyframes dash { 0% { stroke-dashoffset: 100; opacity: 0; } 50% { stroke-dashoffset: 0; opacity: 1; } 100% { stroke-dashoffset: -100; opacity: 0; } }`}</style>
            </svg>
            <div className="text-zinc-400 text-xs tracking-[0.2em] uppercase font-light animate-pulse">Initializing Workspace</div>
          </div>
        </div>
      )}
      
      {showDataError && !isLoading && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
              <div className="glass-panel p-8 rounded-2xl shadow-2xl max-w-md text-center">
                  <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                      <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">No Data Found</h3>
                  <p className="text-zinc-400 mb-6 text-sm leading-relaxed">ไม่พบข้อมูลในช่วงเวลาที่เลือก ระบบจะทำการค้นหาข้อมูลที่ใกล้เคียงที่สุด</p>
                  <div className="space-y-3">
                      <button onClick={handleJumpToFirstData} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-900/30 transition-all active:scale-[0.98] flex items-center justify-center space-x-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" /></svg>
                          <span>Jump to First Available Data</span>
                      </button>
                      <button onClick={() => setShowDataError(false)} className="text-zinc-500 hover:text-zinc-300 text-xs font-bold uppercase tracking-wider">Dismiss</button>
                  </div>
              </div>
          </div>
      )}

      {showStats && <DetailedStats account={account} sessionStart={activeProfile.startDate} currentSimTime={currentSimTime} timePlayed={activeProfile.timePlayed || 0} activeTimeframe={activeTimeframe} killZoneConfig={activeKillZoneConfig} onClose={() => setShowStats(false)} onUpdateTrade={handleUpdateTrade} />}
      {editingIndicator && <IndicatorSettingsModal config={editingIndicator} onSave={handleIndicatorUpdate} onClose={() => setEditingIndicator(null)} />}

      <div className="flex flex-1 overflow-hidden relative p-3 gap-3">
        {/* FLOATING TOOLBAR */}
        <div className="glass-bubble w-14 rounded-2xl flex flex-col items-center py-4 space-y-3 z-20">
             <div className="space-y-2 w-full flex flex-col items-center">
                <button 
                    onClick={() => { setActiveTool('CURSOR'); setSelectedDrawingId(null); }} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${activeTool === 'CURSOR' ? 'bg-blue-500/20 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)] ring-1 ring-blue-500/50' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'}`} 
                    title="Cursor"
                >
                    <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" /></svg>
                </button>
                <button 
                    onClick={() => { setActiveTool('TRENDLINE'); setSelectedDrawingId(null); }} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${activeTool === 'TRENDLINE' ? 'bg-blue-500/20 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)] ring-1 ring-blue-500/50' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'}`} 
                    title="Trendline"
                >
                    <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M5 19L19 5M5 5h2v2H5V5zm12 12h2v2h-2v-2z" /></svg>
                </button>
                <button 
                    onClick={() => { setActiveTool('TEXT'); setSelectedDrawingId(null); }} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${activeTool === 'TEXT' ? 'bg-blue-500/20 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)] ring-1 ring-blue-500/50' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'}`} 
                    title="Text Box"
                >
                    <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M4 7V5h16v2M12 5v14M9 19h6" /></svg>
                </button>
                <button 
                    onClick={handleAddAutoKillZone} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${hasKillZone ? 'bg-blue-500/20 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)] ring-1 ring-blue-500/50' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'}`} 
                    title="Add Kill Zone (Auto)"
                >
                    <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM12 4v16M4 12h16" /></svg>
                </button>
                <button 
                    onClick={() => { setActiveTool('FIB'); setSelectedDrawingId(null); }} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${activeTool === 'FIB' ? 'bg-blue-500/20 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)] ring-1 ring-blue-500/50' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'}`} 
                    title="Fibonacci"
                >
                    <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M4 5h16M4 9h10M4 14h14M4 19h16" /></svg>
                </button>
             </div>

             <div className="w-8 h-[1px] bg-white/10"></div>

             <div className="space-y-2 w-full flex flex-col items-center">
                 <button 
                    onClick={() => { setActiveTool('LONG_POSITION'); setSelectedDrawingId(null); }} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${activeTool === 'LONG_POSITION' ? 'bg-green-500/20 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.3)] ring-1 ring-green-500/50' : 'text-zinc-500 hover:text-green-400 hover:bg-white/5'}`} 
                    title="Long Position"
                 >
                    <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M12 19V5M12 5l-4 4M12 5l4 4M5 12h14" strokeDasharray="4 4"/></svg>
                </button>
                <button 
                    onClick={() => { setActiveTool('SHORT_POSITION'); setSelectedDrawingId(null); }} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${activeTool === 'SHORT_POSITION' ? 'bg-red-500/20 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)] ring-1 ring-red-500/50' : 'text-zinc-500 hover:text-red-400 hover:bg-white/5'}`} 
                    title="Short Position"
                >
                    <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M12 5v14M12 19l-4-4M12 19l4-4M5 12h14" strokeDasharray="4 4"/></svg>
                </button>
             </div>
             
             <div className="w-8 h-[1px] bg-white/10"></div>

             <div className="space-y-2 w-full flex flex-col items-center relative">
                <button 
                    onClick={() => setShowIndicatorMenu(!showIndicatorMenu)} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${showIndicatorMenu ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/50' : 'text-zinc-500 hover:text-purple-300 hover:bg-white/5'}`} 
                    title="Indicators"
                >
                    <span className="font-serif italic font-bold text-lg transition-transform group-hover:scale-110">fx</span>
                </button>
                {showIndicatorMenu && (
                    <div className="absolute left-14 top-0 glass-panel rounded-xl shadow-2xl p-2 z-50 w-36 space-y-1 animate-in fade-in slide-in-from-left-2 duration-200">
                        <div className="text-[10px] text-zinc-500 font-bold uppercase mb-1 px-2 py-1 tracking-wider">Indicators</div>
                        {indicatorConfigs.map(c => (
                            <button 
                                key={c.id} 
                                onClick={() => toggleIndicator(c.id)} 
                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold flex justify-between items-center transition-all ${c.visible ? 'bg-purple-500/20 text-purple-300' : 'hover:bg-white/5 text-zinc-300'}`}
                            >
                                <span className="truncate pr-2">{c.type} {c.type === 'EMA' ? c.period : ''}</span>
                                {c.visible && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_5px_rgba(192,132,252,0.8)] shrink-0"></span>}
                            </button>
                        ))}
                        <div className="h-[1px] bg-white/10 my-1"></div>
                        <button onClick={() => handleAddIndicator('EMA')} className="w-full text-left px-3 py-2 rounded-lg text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2">
                            <span>+ Add EMA</span>
                        </button>
                    </div>
                )}
             </div>

             <div className="mt-auto space-y-2 w-full flex flex-col items-center pt-2">
                 <button 
                    onClick={() => setShowMarketStructure(!showMarketStructure)} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${showMarketStructure ? 'bg-white/10 text-white ring-1 ring-white/20' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`} 
                    title="Market Structure"
                 >
                     <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M4 16l6-6 4 4 6-6M4 16v4h16v-4M4 16h16" /></svg>
                 </button>

                 <button 
                    onClick={() => setMagnetMode(!magnetMode)} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${magnetMode ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'text-zinc-500 hover:text-amber-300 hover:bg-white/5'}`} 
                    title="Magnet Mode"
                 >
                     <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M5 9a7 7 0 1114 0v4h-4V9a3 3 0 00-6 0v4H5V9zM5 17h4v2H5v-2zm10 0h4v2h-4v-2z" /></svg>
                 </button>
                 <button 
                    onClick={() => setShowDrawingManager(!showDrawingManager)} 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${showDrawingManager ? 'bg-white/10 text-white ring-1 ring-white/20' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`} 
                    title="Layers"
                 >
                     <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M12 4L4 8l8 4 8-4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4" /></svg>
                 </button>
             </div>

             {showDrawingManager && <DrawingManager drawings={currentDrawings} indicatorConfigs={indicatorConfigs} settings={drawingSettings} selectedId={selectedDrawingId} onUpdateSettings={setDrawingSettings} onSelect={setSelectedDrawingId} onToggleVisible={(id) => handleDrawingUpdate({...allDrawings.find(d => d.id === id)!, visible: !allDrawings.find(d => d.id === id)!.visible})} onToggleLock={(id) => handleDrawingUpdate({...allDrawings.find(d => d.id === id)!, locked: !allDrawings.find(d => d.id === id)!.locked})} onDelete={handleDrawingDelete} onEdit={(id) => setEditingDrawingId(id)} onToggleIndicator={(id) => toggleIndicator(id)} onEditIndicator={setEditingIndicator} onClose={() => setShowDrawingManager(false)} />}
        </div>
        
        <div className="flex-1 flex flex-col min-w-0 relative gap-3">
            <div className="flex-1 relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/5">
                <ChartContainer 
                    key={activeSymbol} 
                    activeSymbol={activeSymbol}
                    interval={TF_SECONDS[activeTimeframe]}
                    ref={chartRef} 
                    data={currentSlice} 
                    emaDataMap={slicedEmaMap}
                    rsiData={rsiData.filter(d => d.time <= lastTime)} macdData={{ macd: macdData.macd.filter(d => d.time <= lastTime), signal: macdData.signal.filter(d => d.time <= lastTime), histogram: macdData.histogram.filter(d => d.time <= lastTime) }} 
                    trades={account.history.filter(t => t.symbol === activeSymbol)} 
                    onModifyTrade={handleModifyTrade}
                    onModifyOrderEntry={handleModifyOrderEntry}
                    onTradeDrag={setActiveDragTrade}
                    activeTool={activeTool} magnetMode={magnetMode} drawingSettings={drawingSettings} indicatorConfigs={indicatorConfigs} 
                    onDrawingCreate={handleDrawingCreate} onDrawingUpdate={handleDrawingUpdate} onDrawingEdit={(d) => setEditingDrawingId(d.id)} onDrawingSelect={setSelectedDrawingId} onDrawingDelete={handleDrawingDelete} 
                    onLoadMore={handleLoadMoreHistory} onIndicatorDblClick={setEditingIndicator}
                    onRemoveIndicator={handleRemoveIndicator}
                    drawings={currentDrawings} selectedDrawingId={selectedDrawingId} 
                    pricePrecision={currentDigits} 
                />
                
                <MarketStructureWidget 
                    symbol={activeSymbol} 
                    currentSimTime={currentSimTime} 
                    isVisible={showMarketStructure} 
                    onClose={() => setShowMarketStructure(false)}
                />

            </div>
        </div>
        
        <div className="glass-bubble w-80 rounded-2xl flex flex-col shadow-2xl overflow-hidden ring-1 ring-white/5">
            <OrderPanel activeSymbol={activeSymbol} currentPrice={tradingPrice} account={account} onPlaceOrder={handlePlaceOrder} onCloseOrder={handleCloseOrder} activeDragTrade={activeDragTrade} />
        </div>
        
        {editingDrawingId && allDrawings.find(d => d.id === editingDrawingId) && <DrawingSettingsModal drawing={allDrawings.find(d => d.id === editingDrawingId)!} onClose={() => setEditingDrawingId(null)} onSave={(u) => { handleDrawingUpdate(u); setEditingDrawingId(null); }} />}
      </div>
    </div>
  );
};

export default App;
