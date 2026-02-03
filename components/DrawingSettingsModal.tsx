
import React, { useState, useEffect } from 'react';
import { DrawingObject, FibLevel, LineStyle } from '../types';

interface Props {
  drawing: DrawingObject;
  onSave: (updated: DrawingObject) => void;
  onClose: () => void;
}

export const DrawingSettingsModal: React.FC<Props> = ({ drawing, onSave, onClose }) => {
  const [localDrawing, setLocalDrawing] = useState<DrawingObject>(() => ({
      ...drawing,
      fibLevels: drawing.fibLevels ? drawing.fibLevels.map(l => ({...l})) : undefined
  }));
  
  const [activeTab, setActiveTab] = useState<'STYLE' | 'COORDS' | 'FIB'>('STYLE');

  const tabs = drawing.type === 'FIB' 
    ? ['STYLE', 'COORDS', 'FIB'] 
    : ['STYLE', 'COORDS'];

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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="glass-panel border border-white/10 rounded-2xl shadow-2xl w-80 max-h-[70vh] flex flex-col bg-[#09090b]/90 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-white/10 bg-white/[0.02] shrink-0">
            <h2 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                {localDrawing.type} Settings
            </h2>
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 shrink-0">
            {tabs.map(tab => (
                <button
                    key={tab}
                    onClick={() => setActiveTab(tab as any)}
                    className={`flex-1 py-2 text-xs font-bold transition-all ${activeTab === tab ? 'text-blue-400 border-b-2 border-blue-500 bg-white/5' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]'}`}
                >
                    {tab === 'FIB' ? 'LEVELS' : tab}
                </button>
            ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-zinc-700">
            {activeTab === 'STYLE' && (
                <div className="space-y-3">
                    <div>
                        <label className="text-[10px] text-zinc-500 block mb-1 font-bold">Line Color</label>
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
                </div>
            )}

            {activeTab === 'COORDS' && (
                <div className="space-y-3">
                     <div className="p-2.5 bg-white/5 rounded-lg border border-white/5">
                        <div className="text-[10px] font-bold text-zinc-400 mb-1.5">Point 1 (Start)</div>
                        <div className="grid grid-cols-1 gap-2">
                             <div>
                                 <label className="text-[9px] text-zinc-500 block mb-0.5">Price</label>
                                 <input 
                                    type="number" step="0.00001"
                                    value={localDrawing.p1.price}
                                    onChange={(e) => setLocalDrawing({
                                        ...localDrawing, 
                                        p1: { ...localDrawing.p1, price: parseFloat(e.target.value) }
                                    })}
                                    className="w-full bg-black/30 border border-white/5 rounded-md p-1 text-xs text-zinc-200 outline-none font-mono"
                                 />
                             </div>
                        </div>
                     </div>

                     <div className="p-2.5 bg-white/5 rounded-lg border border-white/5">
                        <div className="text-[10px] font-bold text-zinc-400 mb-1.5">Point 2 (End)</div>
                        <div className="grid grid-cols-1 gap-2">
                             <div>
                                 <label className="text-[9px] text-zinc-500 block mb-0.5">Price</label>
                                 <input 
                                    type="number" step="0.00001"
                                    value={localDrawing.p2.price}
                                    onChange={(e) => setLocalDrawing({
                                        ...localDrawing, 
                                        p2: { ...localDrawing.p2, price: parseFloat(e.target.value) }
                                    })}
                                    className="w-full bg-black/30 border border-white/5 rounded-md p-1 text-xs text-zinc-200 outline-none font-mono"
                                 />
                             </div>
                        </div>
                     </div>
                </div>
            )}

            {activeTab === 'FIB' && localDrawing.fibLevels && (
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
