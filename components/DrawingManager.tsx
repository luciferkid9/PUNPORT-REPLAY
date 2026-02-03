
import React from 'react';
import { DrawingObject, DrawingSettings, LineStyle } from '../types';

interface Props {
  drawings: DrawingObject[];
  settings: DrawingSettings;
  selectedId: string | null;
  onUpdateSettings: (s: DrawingSettings) => void;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleLock: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export const DrawingManager: React.FC<Props> = ({ 
    drawings, settings, selectedId, onUpdateSettings, onSelect,
    onToggleVisible, onToggleLock, onDelete, onClose 
}) => {
  return (
    <div className="absolute left-16 top-0 bottom-0 w-64 glass-bubble rounded-r-2xl border-r border-white/5 z-30 flex flex-col shadow-2xl backdrop-blur-xl animate-in slide-in-from-left-2 duration-200">
        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
            <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Drawing Manager</h3>
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>

        {/* Global Settings */}
        <div className="p-4 border-b border-white/5 space-y-4">
            <div className="text-[10px] text-zinc-500 font-bold uppercase">New Object Defaults</div>
            
            <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Color</span>
                <input 
                    type="color" 
                    value={settings.color}
                    onChange={(e) => onUpdateSettings({...settings, color: e.target.value})}
                    className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border border-white/10"
                />
            </div>

            <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Thickness</span>
                <select 
                    value={settings.lineWidth}
                    onChange={(e) => onUpdateSettings({...settings, lineWidth: Number(e.target.value)})}
                    className="bg-black/30 text-zinc-200 text-xs rounded-lg p-1.5 border border-white/5 outline-none focus:border-blue-500/50"
                >
                    <option value={1}>1px</option>
                    <option value={2}>2px</option>
                    <option value={3}>3px</option>
                    <option value={4}>4px</option>
                </select>
            </div>

            <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Style</span>
                <select 
                    value={settings.lineStyle}
                    onChange={(e) => onUpdateSettings({...settings, lineStyle: e.target.value as LineStyle})}
                    className="bg-black/30 text-zinc-200 text-xs rounded-lg p-1.5 border border-white/5 outline-none focus:border-blue-500/50"
                >
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                    <option value="dotted">Dotted</option>
                </select>
            </div>
        </div>

        {/* Object Tree */}
        <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-zinc-700">
            <div className="text-[10px] text-zinc-500 font-bold uppercase mb-2 px-2 mt-2">Object Tree ({drawings.length})</div>
            {drawings.length === 0 && (
                <div className="text-center text-xs text-zinc-600 italic mt-8">No drawings active</div>
            )}
            <div className="space-y-1">
                {drawings.map(d => (
                    <div 
                        key={d.id} 
                        onClick={() => onSelect(d.id)}
                        className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer border transition-all ${
                            selectedId === d.id 
                            ? 'bg-blue-600/20 border-blue-500/30 shadow-sm backdrop-blur-sm' 
                            : 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/5'
                        }`}
                    >
                        <div className="flex items-center space-x-2 truncate">
                            <span className="w-2 h-2 rounded-full shadow-[0_0_5px_rgba(255,255,255,0.3)]" style={{ backgroundColor: d.color }}></span>
                            <span className={`text-xs font-mono ${selectedId === d.id ? 'text-blue-100 font-bold' : 'text-zinc-300'}`}>{d.type}</span>
                            <span className="text-[9px] text-zinc-600 uppercase">#{d.id.substr(0,4)}</span>
                        </div>
                        <div className="flex items-center space-x-1 opacity-80">
                             {/* Visibility Toggle */}
                             <button onClick={(e) => { e.stopPropagation(); onToggleVisible(d.id); }} className="p-1 hover:text-blue-400 text-zinc-500 transition-colors">
                                {d.visible ? (
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                ) : (
                                    <svg className="w-3 h-3 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                )}
                             </button>

                             {/* Lock Toggle */}
                             <button onClick={(e) => { e.stopPropagation(); onToggleLock(d.id); }} className={`p-1 hover:text-yellow-400 transition-colors ${d.locked ? 'text-yellow-500' : 'text-zinc-500'}`}>
                                {d.locked ? (
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                ) : (
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                                )}
                             </button>

                             {/* Delete */}
                             <button onClick={(e) => { e.stopPropagation(); onDelete(d.id); }} className="p-1 hover:text-red-500 text-zinc-500 transition-colors">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                             </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    </div>
  );
};
