import React, { useState, useContext, useEffect } from 'react';
import { TradeContext } from '../context/TradeContext';
import { X, Plus, Minus, Check, Image as ImageIcon, CalendarDays } from 'lucide-react';

const getSetupColor = (setup: string) => {
  switch (setup) {
    case 'A+': return 'text-transparent bg-clip-text bg-gradient-to-r from-rose-500 via-amber-400 via-emerald-400 via-blue-400 via-violet-500 to-rose-500 animate-rainbow animate-sparkle bg-[length:200%_auto] font-black tracking-tighter drop-shadow-[0_0_12px_rgba(255,255,255,0.6)]';
    case 'A': return 'text-red-500 font-bold drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]';
    case 'B': return 'text-yellow-500 font-bold drop-shadow-[0_0_5px_rgba(234,179,8,0.5)]';
    case 'C': return 'text-green-500 font-bold drop-shadow-[0_0_5px_rgba(34,197,94,0.5)]';
    case 'D': return 'text-blue-500 font-bold drop-shadow-[0_0_5px_rgba(59,130,246,0.5)]';
    case 'E': return 'text-purple-400 font-bold drop-shadow-[0_0_5px_rgba(192,132,252,0.5)]';
    default: return 'text-slate-400';
  }
};

export const DataSettingsModal = () => {
  const { isFormOpen, setIsFormOpen, editingTrade, setEditingTrade, addTrade, updateTrade, settings, setSettings, t, isAuthorized } = useContext(TradeContext);
  
  const [activeTab, setActiveTab] = useState('trade'); // 'trade' or 'settings'
  
  const [formData, setFormData] = useState({
    entryDate: '',
    exitDate: '',
    asset: 'XAUUSD',
    direction: 'Buy',
    result: 'TP',
    system: 'SMC',
    timeframe: 'M15',
    setupScore: 'A',
    session: 'New York',
    riskAmount: 100,
    netPnL: 0,
    rewardRatio: 0,
    chartUrl: ''
  });

  const [settingsData, setSettingsData] = useState({
    capital: settings?.capital ?? 10000,
    riskPercent: settings?.riskPercent ?? 1,
    useCompounding: settings?.useCompounding ?? false
  });

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'prompt' | 'confirm' | 'alert';
    title: string;
    message?: string;
    inputValue?: string;
    onConfirm?: (val?: string) => void;
    onCancel?: () => void;
  }>({ isOpen: false, type: 'alert', title: '' });

  useEffect(() => {
    if (isFormOpen) {
      setSettingsData({
        capital: settings?.capital ?? 10000,
        riskPercent: settings?.riskPercent ?? 1,
        useCompounding: settings?.useCompounding ?? false
      });
    }
  }, [isFormOpen, settings]);

  useEffect(() => {
    const now = new Date();
    const formatDateTime = (date: Date) => {
      return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    };

    if (editingTrade) {
      setFormData({
        ...editingTrade,
        asset: editingTrade.asset || 'XAUUSD',
        direction: editingTrade.direction || 'Buy',
        result: editingTrade.result || 'TP',
        system: editingTrade.system || 'SMC',
        timeframe: editingTrade.timeframe || 'H1',
        setupScore: editingTrade.setupScore || 'A+',
        session: editingTrade.session || 'New York',
        riskAmount: editingTrade.riskAmount || 0,
        netPnL: editingTrade.netPnL || 0,
        rewardRatio: editingTrade.rewardRatio || 0,
        chartUrl: editingTrade.chartUrl || '',
        entryDate: editingTrade.entryDate || formatDateTime(now),
        exitDate: editingTrade.exitDate || formatDateTime(now)
      } as any);
      setActiveTab('trade');
      setIsFormOpen(true);
    } else if (isFormOpen) {
      setFormData({
        asset: 'XAUUSD',
        direction: 'Buy',
        result: 'TP',
        system: 'SMC',
        timeframe: 'H1',
        setupScore: 'A+',
        session: 'New York',
        riskAmount: 0,
        netPnL: 0,
        rewardRatio: 0,
        chartUrl: '',
        entryDate: formatDateTime(now),
        exitDate: formatDateTime(now)
      });
    }
  }, [editingTrade, isFormOpen]);

  if (!isFormOpen && !editingTrade) return null;
  if (!isAuthorized) return null;

  const handleClose = () => {
    setIsFormOpen(false);
    setEditingTrade(null);
  };

  const handleSaveTrade = () => {
    const tradeData = {
      ...formData,
      riskAmount: Number(formData.riskAmount) || 0,
      netPnL: Number(formData.netPnL) || 0,
      rewardRatio: Number(formData.rewardRatio) || 0
    };

    if (editingTrade) {
      updateTrade({ ...tradeData, id: editingTrade.id } as any);
    } else {
      addTrade(tradeData as any);
    }
    handleClose();
  };

  const handleSaveSettings = () => {
    setSettings({ 
      ...settings, 
      capital: Number(settingsData.capital) || 0,
      riskPercent: Number(settingsData.riskPercent) || 0,
      useCompounding: settingsData.useCompounding
    });
    handleClose();
  };

  const handleChange = (e: any) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const newValue = ['riskAmount', 'netPnL', 'rewardRatio'].includes(name) 
        ? (value === '' ? '' : Number(value)) 
        : value;
        
      const updatedData = { ...prev, [name]: newValue };
      
      // Auto-calculate PNL when result is SL
      if (name === 'result' && newValue === 'SL') {
        updatedData.netPnL = -Number(updatedData.riskAmount || 0);
      } else if (name === 'riskAmount' && updatedData.result === 'SL') {
        updatedData.netPnL = -Number(newValue || 0);
      }
      
      if (name === 'riskAmount' || name === 'netPnL' || (name === 'result' && newValue === 'SL')) {
        const risk = Number(updatedData.riskAmount || 0);
        const pnl = Number(updatedData.netPnL || 0);
        
        if (risk > 0) {
          updatedData.rewardRatio = Number((pnl / risk).toFixed(2));
        } else {
          updatedData.rewardRatio = 0;
        }
      }
      
      return updatedData;
    });
  };

  const handleAddCustomAsset = () => {
    setModalConfig({
      isOpen: true,
      type: 'prompt',
      title: 'Enter new asset name:',
      inputValue: '',
      onConfirm: (newAsset) => {
        if (newAsset && newAsset.trim()) {
          const assetName = newAsset.trim().toUpperCase();
          const currentAssets = settings?.customAssets || [];
          if (!currentAssets.includes(assetName)) {
            setSettings({ ...settings, customAssets: [...currentAssets, assetName] });
          }
          setFormData(prev => ({ ...prev, asset: assetName }));
        }
        setModalConfig(prev => ({ ...prev, isOpen: false }));
      },
      onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
    });
  };

  const handleRemoveCustomAsset = () => {
    const currentAssets = settings?.customAssets || [];
    if (currentAssets.includes(formData.asset)) {
      setModalConfig({
        isOpen: true,
        type: 'confirm',
        title: 'Remove Asset',
        message: `Are you sure you want to remove the custom asset "${formData.asset}"?`,
        onConfirm: () => {
          const newAssets = currentAssets.filter(a => a !== formData.asset);
          setSettings({ ...settings, customAssets: newAssets });
          setFormData(prev => ({ ...prev, asset: 'XAUUSD' }));
          setModalConfig(prev => ({ ...prev, isOpen: false }));
        },
        onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
      });
    } else {
      setModalConfig({
        isOpen: true,
        type: 'alert',
        title: 'Cannot Remove',
        message: 'You can only remove custom assets.',
        onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
        onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
      });
    }
  };

  const handleAddCustomSystem = () => {
    setModalConfig({
      isOpen: true,
      type: 'prompt',
      title: 'Enter new system name:',
      inputValue: '',
      onConfirm: (newSystem) => {
        if (newSystem && newSystem.trim()) {
          const systemName = newSystem.trim();
          const currentSystems = settings?.customSystems || [];
          if (!currentSystems.includes(systemName)) {
            setSettings({ ...settings, customSystems: [...currentSystems, systemName] });
          }
          setFormData(prev => ({ ...prev, system: systemName }));
        }
        setModalConfig(prev => ({ ...prev, isOpen: false }));
      },
      onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
    });
  };

  const handleRemoveCustomSystem = () => {
    const currentSystems = settings?.customSystems || [];
    if (currentSystems.includes(formData.system)) {
      setModalConfig({
        isOpen: true,
        type: 'confirm',
        title: 'Remove System',
        message: `Are you sure you want to remove the custom system "${formData.system}"?`,
        onConfirm: () => {
          const newSystems = currentSystems.filter(s => s !== formData.system);
          setSettings({ ...settings, customSystems: newSystems });
          setFormData(prev => ({ ...prev, system: 'SMC' }));
          setModalConfig(prev => ({ ...prev, isOpen: false }));
        },
        onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
      });
    } else {
      setModalConfig({
        isOpen: true,
        type: 'alert',
        title: 'Cannot Remove',
        message: 'You can only remove custom systems.',
        onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
        onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
      });
    }
  };

  const defaultAssets = ['XAUUSD', 'EURUSD', 'GBPUSD', 'NAS100', 'US30'];
  const allAssets = [...new Set([...defaultAssets, ...(settings?.customAssets || [])])];

  const defaultSystems = ['SMC', 'ICT', '2TF'];
  const allSystems = [...new Set([...defaultSystems, ...(settings?.customSystems || [])])];

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Tabs */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 pt-4">
          <div className="flex gap-6">
            <button 
              className={`pb-4 font-medium text-sm transition-colors relative ${activeTab === 'trade' ? 'text-blue-400' : 'text-slate-400 hover:text-slate-300'}`}
              onClick={() => setActiveTab('trade')}
            >
              {editingTrade ? t('editTrade') : t('logTrade')}
              {activeTab === 'trade' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-full" />}
            </button>
            <button 
              className={`pb-4 font-medium text-sm transition-colors relative ${activeTab === 'settings' ? 'text-blue-400' : 'text-slate-400 hover:text-slate-300'}`}
              onClick={() => setActiveTab('settings')}
            >
              {t('accSettings')}
              {activeTab === 'settings' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-full" />}
            </button>
          </div>
          <button onClick={handleClose} className="pb-4 text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {activeTab === 'trade' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('entryDate')}</label>
                  <div className="relative group/date">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within/date:text-blue-400 transition-colors pointer-events-none">
                      <CalendarDays size={16} />
                    </div>
                    <input 
                      type="datetime-local" 
                      name="entryDate" 
                      value={formData.entryDate} 
                      onChange={handleChange} 
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all [color-scheme:dark]" 
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('exitDate')}</label>
                  <div className="relative group/date">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within/date:text-blue-400 transition-colors pointer-events-none">
                      <CalendarDays size={16} />
                    </div>
                    <input 
                      type="datetime-local" 
                      name="exitDate" 
                      value={formData.exitDate} 
                      onChange={handleChange} 
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all [color-scheme:dark]" 
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('asset')}</label>
                  <div className="flex gap-1">
                    <select name="asset" value={formData.asset} onChange={handleChange} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all appearance-none">
                      {allAssets.map(asset => (
                        <option key={asset} value={asset}>{asset}</option>
                      ))}
                    </select>
                    <button type="button" onClick={handleAddCustomAsset} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl px-2 flex items-center justify-center transition-colors" title="Add custom asset">
                      <Plus size={16} className="text-slate-300" />
                    </button>
                    <button type="button" onClick={handleRemoveCustomAsset} className="bg-slate-800 hover:bg-rose-900/50 border border-slate-700 hover:border-rose-700/50 rounded-xl px-2 flex items-center justify-center transition-colors" title="Remove custom asset">
                      <Minus size={16} className="text-slate-300 hover:text-rose-400" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('direction')}</label>
                  <select name="direction" value={formData.direction} onChange={handleChange} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all appearance-none">
                    <option value="Buy">{t('buy')}</option>
                    <option value="Sell">{t('sell')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('result')}</label>
                  <select name="result" value={formData.result} onChange={handleChange} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all appearance-none">
                    <option value="TP">TP ({t('won')})</option>
                    <option value="SL">SL ({t('lost')})</option>
                    <option value="BE">BE ({t('be')})</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-8 gap-4">
                <div className="col-span-3">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('system')}</label>
                  <div className="flex gap-1">
                    <select name="system" value={formData.system} onChange={handleChange} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all appearance-none">
                      {allSystems.map(system => (
                        <option key={system} value={system}>{system}</option>
                      ))}
                    </select>
                    <button type="button" onClick={handleAddCustomSystem} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl px-2 flex items-center justify-center transition-colors" title="Add custom system">
                      <Plus size={16} className="text-slate-300" />
                    </button>
                    <button type="button" onClick={handleRemoveCustomSystem} className="bg-slate-800 hover:bg-rose-900/50 border border-slate-700 hover:border-rose-700/50 rounded-xl px-2 flex items-center justify-center transition-colors" title="Remove custom system">
                      <Minus size={16} className="text-slate-300 hover:text-rose-400" />
                    </button>
                  </div>
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('timeframe')}</label>
                  <select name="timeframe" value={formData.timeframe} onChange={handleChange} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all appearance-none">
                    <option value="M1">M1</option>
                    <option value="M2">M2</option>
                    <option value="M5">M5</option>
                    <option value="M15">M15</option>
                    <option value="M30">M30</option>
                    <option value="H1">H1</option>
                    <option value="H2">H2</option>
                    <option value="H4">H4</option>
                    <option value="D1">D1</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('setup')}</label>
                  <select name="setupScore" value={formData.setupScore} onChange={handleChange} className={`w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all appearance-none ${getSetupColor(formData.setupScore)}`}>
                    <option value="A+" className="text-white">A+ (High Quality)</option>
                    <option value="A" className="text-white">A</option>
                    <option value="B" className="text-white">B</option>
                    <option value="C" className="text-white">C</option>
                    <option value="D" className="text-white">D</option>
                    <option value="E" className="text-white">E</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('session')}</label>
                  <select name="session" value={formData.session} onChange={handleChange} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all appearance-none">
                    <option value="Asia">Asia</option>
                    <option value="London">London</option>
                    <option value="New York">New York</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-6 p-5 bg-slate-950/50 rounded-2xl border border-slate-800/80">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('riskAmount')}</label>
                  <input type="number" name="riskAmount" value={formData.riskAmount} onChange={handleChange} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-bold" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('netPnL')}</label>
                  <input type="number" name="netPnL" value={formData.netPnL} onChange={handleChange} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-bold" />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">{t('rewardRatio')}</label>
                    <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded uppercase font-bold">{t('auto')}</span>
                  </div>
                  <input type="number" name="rewardRatio" value={formData.rewardRatio} readOnly className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-400 focus:outline-none transition-all font-bold cursor-not-allowed" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <ImageIcon size={14} /> {t('chartUrl')}
                </label>
                <input type="text" name="chartUrl" value={formData.chartUrl} onChange={handleChange} placeholder="https://..." className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('initialCapital')}</label>
                <input 
                  type="number" 
                  value={settingsData.capital} 
                  onChange={(e) => setSettingsData({...settingsData, capital: e.target.value === '' ? '' : Number(e.target.value)})} 
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('riskPerTrade')}</label>
                <input 
                  type="number" 
                  value={settingsData.riskPercent} 
                  onChange={(e) => setSettingsData({...settingsData, riskPercent: e.target.value === '' ? '' : Number(e.target.value)})} 
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" 
                />
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-xl mt-4">
                <div>
                  <label className="block text-sm font-bold text-white mb-1">{t('simulateCompounding')}</label>
                  <p className="text-xs text-slate-400">{t('compoundingDesc')}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={settingsData.useCompounding} onChange={(e) => setSettingsData({...settingsData, useCompounding: e.target.checked})} className="sr-only peer" />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 p-6 flex justify-end gap-3 bg-slate-900/50">
          <button onClick={handleClose} className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors">
            {t('cancel')}
          </button>
          <button 
            onClick={activeTab === 'trade' ? handleSaveTrade : handleSaveSettings} 
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/20 flex items-center gap-2"
          >
            <Check size={16} strokeWidth={3} />
            {activeTab === 'trade' ? t('saveTrade') : t('saveSettings')}
          </button>
        </div>
      </div>

      {/* Custom Modal for Prompt/Confirm/Alert */}
      {modalConfig.isOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6">
              <h3 className="text-white font-bold text-lg mb-2">{modalConfig.title}</h3>
              {modalConfig.message && <p className="text-slate-300 text-sm mb-4">{modalConfig.message}</p>}
              {modalConfig.type === 'prompt' && (
                <input
                  type="text"
                  autoFocus
                  value={modalConfig.inputValue}
                  onChange={(e) => setModalConfig({ ...modalConfig, inputValue: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && modalConfig.onConfirm) {
                      modalConfig.onConfirm(modalConfig.inputValue);
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all mb-4"
                />
              )}
            </div>
            <div className="border-t border-slate-800 p-4 flex justify-end gap-3 bg-slate-900/50">
              {modalConfig.type !== 'alert' && (
                <button
                  onClick={modalConfig.onCancel}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={() => modalConfig.onConfirm && modalConfig.onConfirm(modalConfig.inputValue)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/20"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
