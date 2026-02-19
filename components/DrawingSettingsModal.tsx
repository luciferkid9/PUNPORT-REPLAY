
import React, { useState, useEffect } from 'react';
import { DrawingObject, FibLevel, LineStyle, SessionConfig } from '../types';

interface Props {
  drawing: DrawingObject;
  onSave: (updated: DrawingObject) => void;
  onClose: () => void;
}

export const DrawingSettingsModal: React.FC<Props> = ({ drawing, onSave, onClose }) => {
  const [localDrawing, setLocalDrawing] = useState<DrawingObject>(() => {
      // Deep copy to prevent mutation
      const copy = { ...drawing };
      if (drawing.fibLevels) copy.fibLevels = drawing.fibLevels.map(l => ({...l}));
      if (drawing.killZoneConfig) {
          copy.killZoneConfig = {
              ...drawing.killZoneConfig,
              asian: { ...drawing.killZoneConfig.asian },
              london: { ...drawing.killZoneConfig.london },
              ny: { ...drawing.killZoneConfig.ny }
          };
      }
      return copy;
  });
  
  // Determine Tabs based on Type
  let availableTabs: string[] = ['STYLE'];
  if (drawing.type === 'FIB') availableTabs = ['STYLE', 'LEVELS'];
  if (drawing.type === 'KILLZONE') availableTabs = ['SETTINGS'];

  const [activeTab, setActiveTab] = useState<string>(availableTabs[0]);

  const handleLevelChange = (index: number, field: keyof FibLevel, value: any) => {
      setLocalDrawing(prev => {
          if (!prev.fibLevels) return prev;
          const newLevels = [...prev.fibLevels];
          newLevels[index] = { ...newLevels[index], [field]: value };
          return { ...prev, fibLevels: newLevels };
      });
  };

  const addLevel = (level: number = 0.5) => {
      setLocalDrawing(prev => {
          const newLevels = prev.fibLevels ? [...prev.fibLevels] : [];
          newLevels.push({ level, color: prev.color || '#38bdf8', visible: true });
          newLevels.sort((a, b) => a.level - b.level);
          return { ...prev, fibLevels: newLevels };
      });
  };

  const removeLevel = (index: number) => {
      setLocalDrawing(prev => {
          if (!prev.fibLevels) return prev;
          const newLevels = prev.fibLevels.filter((_, i) => i !== index);
          return { ...prev, fibLevels: newLevels };
      });
  };

  const handleSessionChange = (session: 'asian' | 'london' | 'ny', field: keyof SessionConfig, value: any) => {
      setLocalDrawing(prev => {
          if (!prev.killZoneConfig) return prev;
          return {
              ...prev,
              killZoneConfig: {
                  ...prev.killZoneConfig,
                  [session]: { ...prev.killZoneConfig[session], [field]: value }
              }
          };
      });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={`glass-panel border border-white/10 rounded-2xl shadow-2xl flex flex-col bg-[#09090b]/90 overflow-hidden ${drawing.type === 'KILLZONE' ? 'w-[400px]' : 'w-80'} max-h-[70vh]`}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-white/10 bg-white/[0.02] shrink-0">
            <h2 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                {localDrawing.type === 'KILLZONE' ? 'Kill Zone Settings' : `${localDrawing.type} Settings`}
            </h2>
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 shrink-0">
            {availableTabs.map(tab => (
                <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2 text-xs font-bold transition-all ${activeTab === tab ? 'text-blue-400 border-b-2 border-blue-500 bg-white/5' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]'}`}
                >
                    {tab}
                </button>
            ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-zinc-700">
            
            {/* --- KILL ZONE SPECIFIC UI (RENAMED TO SETTINGS) --- */}
            {activeTab === 'SETTINGS' && localDrawing.killZoneConfig && (
                <div className="space-y-4">
                    {/* Asian Session */}
                    <div className="flex items-center gap-2">
                        <input type="checkbox" checked={localDrawing.killZoneConfig.asian.enabled} onChange={(e) => handleSessionChange('asian', 'enabled', e.target.checked)} className="rounded border-zinc-600 bg-zinc-800 accent-blue-500 h-4 w-4" />
                        <div className="flex-1 grid grid-cols-12 gap-2 items-center">
                            <input type="text" value={localDrawing.killZoneConfig.asian.label} onChange={(e) => handleSessionChange('asian', 'label', e.target.value)} className="col-span-3 bg-black/30 border border-white/5 rounded px-2 py-1 text-xs text-white" />
                            <div className="col-span-1"><input type="color" value={localDrawing.killZoneConfig.asian.color} onChange={(e) => handleSessionChange('asian', 'color', e.target.value)} className="w-6 h-6 rounded bg-transparent border-none cursor-pointer" /></div>
                            <input type="time" value={localDrawing.killZoneConfig.asian.start} onChange={(e) => handleSessionChange('asian', 'start', e.target.value)} className="col-span-3 bg-black/30 border border-white/5 rounded px-1 py-1 text-xs text-white text-center" />
                            <span className="col-span-1 text-center text-zinc-500">-</span>
                            <input type="time" value={localDrawing.killZoneConfig.asian.end} onChange={(e) => handleSessionChange('asian', 'end', e.target.value)} className="col-span-3 bg-black/30 border border-white/5 rounded px-1 py-1 text-xs text-white text-center" />
                        </div>
                    </div>

                    {/* London Session */}
                    <div className="flex items-center gap-2">
                        <input type="checkbox" checked={localDrawing.killZoneConfig.london.enabled} onChange={(e) => handleSessionChange('london', 'enabled', e.target.checked)} className="rounded border-zinc-600 bg-zinc-800 accent-blue-500 h-4 w-4" />
                        <div className="flex-1 grid grid-cols-12 gap-2 items-center">
                            <input type="text" value={localDrawing.killZoneConfig.london.label} onChange={(e) => handleSessionChange('london', 'label', e.target.value)} className="col-span-3 bg-black/30 border border-white/5 rounded px-2 py-1 text-xs text-white" />
                            <div className="col-span-1"><input type="color" value={localDrawing.killZoneConfig.london.color} onChange={(e) => handleSessionChange('london', 'color', e.target.value)} className="w-6 h-6 rounded bg-transparent border-none cursor-pointer" /></div>
                            <input type="time" value={localDrawing.killZoneConfig.london.start} onChange={(e) => handleSessionChange('london', 'start', e.target.value)} className="col-span-3 bg-black/30 border border-white/5 rounded px-1 py-1 text-xs text-white text-center" />
                            <span className="col-span-1 text-center text-zinc-500">-</span>
                            <input type="time" value={localDrawing.killZoneConfig.london.end} onChange={(e) => handleSessionChange('london', 'end', e.target.value)} className="col-span-3 bg-black/30 border border-white/5 rounded px-1 py-1 text-xs text-white text-center" />
                        </div>
                    </div>

                    {/* NY Session */}
                    <div className="flex items-center gap-2">
                        <input type="checkbox" checked={localDrawing.killZoneConfig.ny.enabled} onChange={(e) => handleSessionChange('ny', 'enabled', e.target.checked)} className="rounded border-zinc-600 bg-zinc-800 accent-blue-500 h-4 w-4" />
                        <div className="flex-1 grid grid-cols-12 gap-2 items-center">
                            <input type="text" value={localDrawing.killZoneConfig.ny.label} onChange={(e) => handleSessionChange('ny', 'label', e.target.value)} className="col-span-3 bg-black/30 border border-white/5 rounded px-2 py-1 text-xs text-white" />
                            <div className="col-span-1"><input type="color" value={localDrawing.killZoneConfig.ny.color} onChange={(e) => handleSessionChange('ny', 'color', e.target.value)} className="w-6 h-6 rounded bg-transparent border-none cursor-pointer" /></div>
                            <input type="time" value={localDrawing.killZoneConfig.ny.start} onChange={(e) => handleSessionChange('ny', 'start', e.target.value)} className="col-span-3 bg-black/30 border border-white/5 rounded px-1 py-1 text-xs text-white text-center" />
                            <span className="col-span-1 text-center text-zinc-500">-</span>
                            <input type="time" value={localDrawing.killZoneConfig.ny.end} onChange={(e) => handleSessionChange('ny', 'end', e.target.value)} className="col-span-3 bg-black/30 border border-white/5 rounded px-1 py-1 text-xs text-white text-center" />
                        </div>
                    </div>

                    <div className="h-[1px] bg-white/10 my-3"></div>

                    {/* Checkboxes Row */}
                    <div className="flex flex-wrap gap-4 mb-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={localDrawing.killZoneConfig.showHighLowLines} 
                                onChange={(e) => setLocalDrawing({...localDrawing, killZoneConfig: {...localDrawing.killZoneConfig!, showHighLowLines: e.target.checked}})}
                                className="rounded border-zinc-600 bg-zinc-800 accent-blue-500 h-3.5 w-3.5"
                            />
                            <span className="text-xs text-zinc-300">Line : Top/Bottom</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={localDrawing.killZoneConfig.showAverage} 
                                onChange={(e) => setLocalDrawing({...localDrawing, killZoneConfig: {...localDrawing.killZoneConfig!, showAverage: e.target.checked}})}
                                className="rounded border-zinc-600 bg-zinc-800 accent-blue-500 h-3.5 w-3.5"
                            />
                            <span className="text-xs text-zinc-300">Average</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={localDrawing.killZoneConfig.extend} 
                                onChange={(e) => setLocalDrawing({...localDrawing, killZoneConfig: {...localDrawing.killZoneConfig!, extend: e.target.checked}})}
                                className="rounded border-zinc-600 bg-zinc-800 accent-blue-500 h-3.5 w-3.5"
                            />
                            <span className="text-xs text-zinc-300">Extend</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={localDrawing.killZoneConfig.showLabel} 
                                onChange={(e) => setLocalDrawing({...localDrawing, killZoneConfig: {...localDrawing.killZoneConfig!, showLabel: e.target.checked}})}
                                className="rounded border-zinc-600 bg-zinc-800 accent-blue-500 h-3.5 w-3.5"
                            />
                            <span className="text-xs text-zinc-300">Label</span>
                        </label>
                    </div>

                    {/* Opacity Slider */}
                    <div>
                        <div className="flex justify-between text-xs text-zinc-400 mb-1">
                            <span>Box Opacity</span>
                            <span>{Math.round((localDrawing.killZoneConfig.opacity || 0.15) * 100)}%</span>
                        </div>
                        <input 
                            type="range" 
                            min="0" max="1" step="0.05"
                            value={localDrawing.killZoneConfig.opacity !== undefined ? localDrawing.killZoneConfig.opacity : 0.15}
                            onChange={(e) => setLocalDrawing({...localDrawing, killZoneConfig: {...localDrawing.killZoneConfig!, opacity: parseFloat(e.target.value)}})}
                            className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                    </div>
                </div>
            )}

            {/* --- STYLE (MERGED WITH TEXT/CONTENT) --- */}
            {activeTab === 'STYLE' && (
                <div className="space-y-4">
                    
                    {/* Content Section (Merged) */}
                    {['TEXT', 'TRENDLINE', 'RECTANGLE'].includes(localDrawing.type) && (
                        <div className="space-y-3 pb-4 border-b border-white/5">
                            <div>
                                <label className="text-[10px] text-zinc-500 block mb-1 font-bold">
                                    {localDrawing.type === 'TEXT' ? 'Text Content' : 'Label'}
                                </label>
                                <textarea 
                                    value={localDrawing.text || ''}
                                    onChange={(e) => setLocalDrawing({...localDrawing, text: e.target.value})}
                                    className="w-full bg-black/20 border border-white/5 rounded-lg p-2 text-sm text-white outline-none focus:border-blue-500/50 min-h-[60px]"
                                    placeholder={localDrawing.type === 'TEXT' ? "Enter text..." : "Enter label (optional)..."}
                                />
                            </div>
                            {localDrawing.type === 'TEXT' && (
                                <div>
                                    <label className="text-[10px] text-zinc-500 block mb-1 font-bold">Font Size</label>
                                    <input 
                                        type="number"
                                        value={localDrawing.fontSize || 14}
                                        onChange={(e) => setLocalDrawing({...localDrawing, fontSize: parseInt(e.target.value)})}
                                        className="w-full bg-black/20 border border-white/5 rounded-lg p-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500/50"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Standard Visual Style */}
                    <div className="space-y-3">
                        <div>
                            <label className="text-[10px] text-zinc-500 block mb-1 font-bold">{localDrawing.type === 'TEXT' ? 'Text Color' : 'Line Color'}</label>
                            <div className="flex items-center space-x-2 bg-black/20 p-1.5 rounded-lg border border-white/5">
                                <input 
                                    type="color" 
                                    value={localDrawing.color}
                                    onChange={(e) => setLocalDrawing({...localDrawing, color: e.target.value})}
                                    className="w-6 h-6 rounded bg-transparent cursor-pointer border-none"
                                />
                                <span className="text-xs font-mono text-zinc-400">{localDrawing.color}</span>
                            </div>
                        </div>
                        {localDrawing.type !== 'TEXT' && (
                            <>
                                <div>
                                    <label className="text-[10px] text-zinc-500 block mb-1 font-bold">Line Width</label>
                                    <select 
                                        value={localDrawing.lineWidth}
                                        onChange={(e) => setLocalDrawing({...localDrawing, lineWidth: Number(e.target.value)})}
                                        className="w-full bg-black/20 border border-white/5 rounded-lg p-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500/50"
                                    >
                                        <option value={1}>1px</option>
                                        <option value={2}>2px</option>
                                        <option value={3}>3px</option>
                                        <option value={4}>4px</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] text-zinc-500 block mb-1 font-bold">Line Style</label>
                                    <select 
                                        value={localDrawing.lineStyle}
                                        onChange={(e) => setLocalDrawing({...localDrawing, lineStyle: e.target.value as LineStyle})}
                                        className="w-full bg-black/20 border border-white/5 rounded-lg p-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500/50"
                                    >
                                        <option value="solid">Solid</option>
                                        <option value="dashed">Dashed</option>
                                        <option value="dotted">Dotted</option>
                                    </select>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* --- FIB LEVELS (RENAMED TO LEVELS) --- */}
            {activeTab === 'LEVELS' && localDrawing.fibLevels && (
                <div className="space-y-3">
                    <div className="bg-white/5 p-2.5 rounded-lg border border-white/5">
                        <label className="text-[9px] text-zinc-500 font-bold uppercase mb-1.5 block">Quick Add</label>
                        <div className="grid grid-cols-4 gap-1.5">
                            {[1.272, 1.618, 2.618, 4.236].map(val => (
                                <button
                                    key={val}
                                    onClick={() => addLevel(val)}
                                    className="py-1 px-1 bg-black/30 hover:bg-blue-600/30 border border-white/5 rounded text-[10px] font-mono font-bold text-zinc-300 transition-colors"
                                >
                                    {val}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <div className="grid grid-cols-12 gap-1 text-[9px] text-zinc-500 font-bold uppercase mb-0.5 px-1">
                            <div className="col-span-2 text-center">On</div>
                            <div className="col-span-4">Lvl</div>
                            <div className="col-span-4">Color</div>
                            <div className="col-span-2"></div>
                        </div>
                        {localDrawing.fibLevels.map((fib, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-1 items-center bg-white/[0.03] p-1 rounded hover:bg-white/[0.06] transition-colors">
                                <div className="col-span-2 flex justify-center">
                                    <input 
                                        type="checkbox" 
                                        checked={!!fib.visible} 
                                        onChange={(e) => handleLevelChange(idx, 'visible', e.target.checked)}
                                        className="rounded border-zinc-600 bg-zinc-700 accent-blue-500 h-3 w-3"
                                    />
                                </div>
                                <div className="col-span-4">
                                    <input 
                                        type="number" step="0.001"
                                        value={fib.level}
                                        onChange={(e) => handleLevelChange(idx, 'level', parseFloat(e.target.value))}
                                        className="w-full bg-black/30 border border-white/5 rounded p-0.5 text-xs text-center text-zinc-200 font-mono outline-none"
                                    />
                                </div>
                                <div className="col-span-4 flex items-center justify-center">
                                    <input 
                                        type="color" 
                                        value={fib.color}
                                        onChange={(e) => handleLevelChange(idx, 'color', e.target.value)}
                                        className="w-4 h-4 rounded bg-transparent cursor-pointer border-none p-0"
                                    />
                                </div>
                                <div className="col-span-2 flex justify-center">
                                    <button onClick={() => removeLevel(idx)} className="text-zinc-600 hover:text-red-500 transition-colors">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <button 
                        onClick={() => addLevel()}
                        className="w-full py-1.5 border border-dashed border-zinc-700 rounded-lg text-zinc-500 text-[10px] hover:text-blue-400 hover:border-blue-500 hover:bg-blue-500/5 transition-all font-bold uppercase tracking-wider"
                    >
                        + Add Custom Level
                    </button>
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/10 flex justify-end space-x-2 bg-black/20 shrink-0">
            <button onClick={onClose} className="px-3 py-1.5 text-xs font-bold text-zinc-400 hover:text-white transition-colors">Cancel</button>
            <button 
                onClick={() => onSave(localDrawing)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-blue-900/20 transition-all active:scale-95"
            >
                Save
            </button>
        </div>
      </div>
    </div>
  );
};
