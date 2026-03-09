import React, { useState, useEffect } from 'react';
import { LotSizeConfig } from '../types';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    config: LotSizeConfig;
    onSave: (config: LotSizeConfig) => void;
    activeSymbol: string;
}

export const LotSizeCalculatorModal: React.FC<Props> = ({ isOpen, onClose, config, onSave, activeSymbol }) => {
    const [localConfig, setLocalConfig] = useState<LotSizeConfig>(config);

    useEffect(() => {
        setLocalConfig(config);
    }, [config]);

    if (!isOpen) return null;

    const handleSave = () => {
        onSave(localConfig);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
            <div className="glass-panel p-6 rounded-2xl w-96 space-y-4 relative bg-[#18181b] border border-white/10 shadow-2xl">
                <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                
                <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 border-b border-white/10 pb-2">1. Position Size Calculator</h2>
                
                <div className="space-y-4">
                    <label className="flex items-center space-x-3 cursor-pointer p-2 rounded-lg hover:bg-white/5 transition-colors">
                        <input 
                            type="checkbox" 
                            checked={localConfig.show} 
                            onChange={e => setLocalConfig({...localConfig, show: e.target.checked})}
                            className="w-4 h-4 rounded text-blue-500 bg-white/10 border-white/20 focus:ring-blue-500 focus:ring-offset-0"
                        />
                        <span className="text-sm font-bold text-zinc-300">แสดงกล่องคำนวณ Lot Size</span>
                    </label>

                    <div>
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1 tracking-wide">💵 ขนาดบัญชี (Account Balance)</label>
                        <input 
                            type="number" 
                            value={localConfig.accountBalance} 
                            onChange={e => setLocalConfig({...localConfig, accountBalance: parseFloat(e.target.value) || 0})}
                            className="w-full bg-[#09090b] border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1 tracking-wide">🛑 จุดหยุดขาดทุน (Stop Loss Pips)</label>
                        <input 
                            type="number" 
                            value={localConfig.stopLossPips} 
                            onChange={e => setLocalConfig({...localConfig, stopLossPips: parseFloat(e.target.value) || 0})}
                            className="w-full bg-[#09090b] border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1 tracking-wide">🔥 ความเสี่ยง %</label>
                        <input 
                            type="number" 
                            value={localConfig.riskPercent} 
                            onChange={e => setLocalConfig({...localConfig, riskPercent: parseFloat(e.target.value) || 0})}
                            className="w-full bg-[#09090b] border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1 tracking-wide">💱 สกุลเงินบัญชี</label>
                        <select 
                            value={localConfig.currency} 
                            onChange={e => setLocalConfig({...localConfig, currency: e.target.value})}
                            className="w-full bg-[#09090b] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all appearance-none"
                        >
                            <option value="USD">USD</option>
                            <option value="THB">THB</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1 tracking-wide">🖥️ ตำแหน่งกล่องข้อความ</label>
                        <select 
                            value={localConfig.position} 
                            onChange={e => setLocalConfig({...localConfig, position: e.target.value as any})}
                            className="w-full bg-[#09090b] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all appearance-none"
                        >
                            <option value="top-left">บนซ้าย (Top Left)</option>
                            <option value="top-right">บนขวา (Top Right)</option>
                            <option value="bottom-left">ล่างซ้าย (Bottom Left)</option>
                            <option value="bottom-right">ล่างขวา (Bottom Right)</option>
                        </select>
                    </div>

                    {(() => {
                        const tickerStr = activeSymbol.toUpperCase();
                        const cleanSymbol = tickerStr.replace(/[^A-Z]/g, '');
                        const accountCurrency = (localConfig.currency || 'USD').toUpperCase();
                        let quoteCurrency = '';
                        if (cleanSymbol.length >= 6) quoteCurrency = cleanSymbol.substring(3, 6);
                        
                        if (quoteCurrency && quoteCurrency !== accountCurrency) {
                            const multiplyPairs = ['AUD', 'NZD', 'GBP', 'EUR'];
                            const isMultiply = multiplyPairs.includes(quoteCurrency);
                            const pairLabel = isMultiply ? `${quoteCurrency}${accountCurrency}` : `${accountCurrency}${quoteCurrency}`;
                            
                            return (
                                <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20 animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="block text-[10px] font-bold text-blue-400 uppercase tracking-wide">🔄 อัตราแลกเปลี่ยน {pairLabel}</label>
                                        <span className="text-[9px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded uppercase font-bold">Auto</span>
                                    </div>
                                    <div className="text-white text-sm font-mono py-1">
                                        ระบบจะดึงราคา {pairLabel} อัตโนมัติจากฐานข้อมูลตามเวลาจำลอง
                                    </div>
                                    <p className="text-[9px] text-zinc-500 mt-1 italic">* เพื่อความแม่นยำสูงสุดตามมาตรฐาน Myfxbook</p>
                                </div>
                            );
                        }
                        return null;
                    })()}
                </div>

                <div className="pt-4 border-t border-white/10 flex justify-end">
                    <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-lg shadow-blue-900/20 transition-all active:scale-95">
                        บันทึก (Save)
                    </button>
                </div>
            </div>
        </div>
    );
};
