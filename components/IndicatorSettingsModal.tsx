
import React, { useState } from 'react';
import { IndicatorConfig, IndicatorType } from '../types';

interface Props {
  config: IndicatorConfig;
  onSave: (newConfig: IndicatorConfig) => void;
  onClose: () => void;
}

export const IndicatorSettingsModal: React.FC<Props> = ({ config, onSave, onClose }) => {
  const [localConfig, setLocalConfig] = useState<IndicatorConfig>({ ...config });

  const handleSave = () => {
      onSave(localConfig);
      onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="glass-panel border border-white/10 rounded-2xl shadow-2xl w-72 bg-[#09090b]">
        
        <div className="p-4 border-b border-white/10 flex justify-between items-center">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">{config.type} Settings</h3>
            <button onClick={onClose} className="text-zinc-500 hover:text-white">✕</button>
        </div>

        <div className="p-5 space-y-4">
            
            {config.type === 'MACD' && (
                <>
                    <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 font-bold uppercase">Fast Length (EMA)</label>
                        <input 
                            type="number" 
                            value={localConfig.fastLength || 12}
                            onChange={(e) => setLocalConfig({...localConfig, fastLength: parseInt(e.target.value)})}
                            className="input-bubble w-full rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 font-bold uppercase">Slow Length (EMA)</label>
                        <input 
                            type="number" 
                            value={localConfig.slowLength || 26}
                            onChange={(e) => setLocalConfig({...localConfig, slowLength: parseInt(e.target.value)})}
                            className="input-bubble w-full rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 font-bold uppercase">Signal Smoothing</label>
                        <input 
                            type="number" 
                            value={localConfig.signalLength || 9}
                            onChange={(e) => setLocalConfig({...localConfig, signalLength: parseInt(e.target.value)})}
                            className="input-bubble w-full rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <label className="text-[10px] text-zinc-500 font-bold uppercase">MACD Color</label>
                            <input 
                                type="color" 
                                value={localConfig.color || '#2962ff'}
                                onChange={(e) => setLocalConfig({...localConfig, color: e.target.value})}
                                className="w-full h-8 rounded-lg bg-transparent cursor-pointer border border-white/10"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] text-zinc-500 font-bold uppercase">Signal Color</label>
                            <input 
                                type="color" 
                                value={localConfig.signalColor || '#f57c00'}
                                onChange={(e) => setLocalConfig({...localConfig, signalColor: e.target.value})}
                                className="w-full h-8 rounded-lg bg-transparent cursor-pointer border border-white/10"
                            />
                        </div>
                    </div>
                </>
            )}

            {config.type === 'RSI' && (
                <>
                    <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 font-bold uppercase">Length</label>
                        <input 
                            type="number" 
                            value={localConfig.period || 14}
                            onChange={(e) => setLocalConfig({...localConfig, period: parseInt(e.target.value)})}
                            className="input-bubble w-full rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[10px] text-zinc-500 font-bold uppercase">Overbought</label>
                            <input 
                                type="number" 
                                value={localConfig.upperLevel || 70}
                                onChange={(e) => setLocalConfig({...localConfig, upperLevel: parseInt(e.target.value)})}
                                className="input-bubble w-full rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] text-zinc-500 font-bold uppercase">Oversold</label>
                            <input 
                                type="number" 
                                value={localConfig.lowerLevel || 30}
                                onChange={(e) => setLocalConfig({...localConfig, lowerLevel: parseInt(e.target.value)})}
                                className="input-bubble w-full rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                            />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 font-bold uppercase">Line Color</label>
                        <input 
                            type="color" 
                            value={localConfig.color || '#7e57c2'}
                            onChange={(e) => setLocalConfig({...localConfig, color: e.target.value})}
                            className="w-full h-8 rounded-lg bg-transparent cursor-pointer border border-white/10"
                        />
                    </div>
                </>
            )}

            {config.type === 'EMA' && (
                 <>
                    <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 font-bold uppercase">Period</label>
                        <input 
                            type="number" 
                            value={localConfig.period || 14}
                            onChange={(e) => setLocalConfig({...localConfig, period: parseInt(e.target.value)})}
                            className="input-bubble w-full rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 font-bold uppercase">Line Color</label>
                        <input 
                            type="color" 
                            value={localConfig.color || '#2962ff'}
                            onChange={(e) => setLocalConfig({...localConfig, color: e.target.value})}
                            className="w-full h-8 rounded-lg bg-transparent cursor-pointer border border-white/10"
                        />
                    </div>
                 </>
            )}

        </div>

        <div className="p-4 border-t border-white/10 flex justify-end space-x-2 bg-black/20">
            <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors">Cancel</button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors">Save</button>
        </div>

      </div>
    </div>
  );
};
