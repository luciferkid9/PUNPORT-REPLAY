
import React, { useState, useRef, useEffect } from 'react';
import { Trade, TradeJournal, TimeframeType, Candle, SymbolType } from '../types';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';
import { fetchContextCandles } from '../services/api';
import { TF_SECONDS } from '../constants';

interface Props {
    trade: Trade;
    activeTimeframe: TimeframeType;
    onSave: (tradeId: string, journal: TradeJournal) => void;
    onClose: () => void;
}

export const JournalModal: React.FC<Props> = ({ trade, activeTimeframe, onSave, onClose }) => {
    const [tags, setTags] = useState<string>(trade.journal?.tags.join(', ') || '');
    const [confidence] = useState<number>(trade.journal?.confidence || 3);
    const [setupRating] = useState<number>(trade.journal?.setupRating || 3);
    const [checklist] = useState<{ id: string; label: string; checked: boolean }[]>(
        trade.journal?.checklist || [
            { id: '1', label: 'Trend Alignment', checked: false },
            { id: '2', label: 'Key Level / Zone', checked: false },
            { id: '3', label: 'Entry Signal (Candle Pattern)', checked: false },
            { id: '4', label: 'Risk Reward > 1:2', checked: false },
            { id: '5', label: 'News Event Checked', checked: false }
        ]
    );
    const [notes, setNotes] = useState<string>(trade.journal?.notes || '');

    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const [isLoadingChart, setIsLoadingChart] = useState(true);

    const formatCurrency = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    useEffect(() => {
        if (!chartContainerRef.current) return;
        
        const chart = createChart(chartContainerRef.current, {
            layout: { 
                background: { type: ColorType.Solid, color: '#18181b' }, 
                textColor: '#a1a1aa' 
            },
            grid: { 
                vertLines: { color: '#27272a' }, 
                horzLines: { color: '#27272a' } 
            },
            localization: {
                locale: 'th-TH',
                timeFormatter: (time: number) => {
                    const date = new Date(time * 1000);
                    return date.toLocaleString('th-TH', { 
                        day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false 
                    });
                }
            },
            timeScale: { 
                visible: true, borderColor: '#3f3f46', timeVisible: true, secondsVisible: false, barSpacing: 12
            },
            rightPriceScale: { 
                visible: true, borderColor: '#3f3f46', scaleMargins: { top: 0.1, bottom: 0.1 },
            },
            crosshair: { 
                mode: 1, vertLine: { color: '#71717a', labelBackgroundColor: '#3f3f46' }, horzLine: { color: '#71717a', labelBackgroundColor: '#3f3f46' }
            }, 
            handleScroll: false, handleScale: false,
            width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight
        });

        const series = chart.addCandlestickSeries({
             upColor: '#089981', downColor: '#F23645', borderVisible: false, wickUpColor: '#089981', wickDownColor: '#F23645',
             priceFormat: { type: 'price', precision: trade.symbol.includes('JPY') ? 3 : 5, minMove: 0.00001 },
             priceLineVisible: false, // Disable the price line to avoid confusion with SL/TP
             lastValueVisible: false, // Disable the price label on axis
        });

        chartRef.current = chart;

        const loadData = async () => {
            if (!trade.entryTime || !trade.closeTime) { setIsLoadingChart(false); return; }
            const duration = trade.closeTime - trade.entryTime;
            const tfSecs = TF_SECONDS[activeTimeframe];
            const fetchLimit = Math.ceil(duration / tfSecs) + 100; 
            const endTime = trade.closeTime + (30 * tfSecs);
            
            try {
                const data = await fetchContextCandles(trade.symbol as SymbolType, activeTimeframe, endTime, Math.max(150, fetchLimit));
                if (data.length > 0) {
                    series.setData(data as any);
                    
                    const markers: any[] = [];
                    markers.push({ time: trade.entryTime, position: trade.side === 'LONG' ? 'belowBar' : 'aboveBar', color: trade.side === 'LONG' ? '#22c55e' : '#ef4444', shape: trade.side === 'LONG' ? 'arrowUp' : 'arrowDown', text: 'ENTRY' });
                    markers.push({ time: trade.closeTime, position: trade.side === 'LONG' ? 'aboveBar' : 'belowBar', color: '#fbbf24', shape: trade.side === 'LONG' ? 'arrowDown' : 'arrowUp', text: 'EXIT' });
                    series.setMarkers(markers);
                    
                    series.createPriceLine({ price: trade.entryPrice, color: '#a1a1aa', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `ENTRY` });
                    if (trade.stopLoss > 0) series.createPriceLine({ price: trade.stopLoss, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `SL` });
                    if (trade.takeProfit > 0) series.createPriceLine({ price: trade.takeProfit, color: '#22c55e', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `TP` });
                    
                    chart.timeScale().fitContent();
                }
            } catch (e) { console.error("Failed to load chart", e); } finally { setIsLoadingChart(false); }
        };
        loadData();
        return () => chart.remove();
    }, [trade, activeTimeframe]);

    const handleSave = () => {
        const journalData: TradeJournal = {
            tags: tags.split(',').map(t => t.trim()).filter(t => t !== ''),
            confidence, setupRating, notes, checklist, screenshot: trade.journal?.screenshot
        };
        onSave(trade.id, journalData);
        onClose();
    };

    const isProfit = (trade.pnl || 0) >= 0;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="glass-panel border border-white/10 rounded-2xl shadow-2xl w-[95%] max-w-3xl max-h-[90vh] flex flex-col overflow-hidden bg-[#09090b]">
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-white/[0.02] shrink-0">
                    <div className="flex items-center space-x-4">
                        <span className={`text-sm font-black px-3 py-1.5 rounded-lg shadow-sm tracking-wide ${trade.side === 'LONG' ? 'bg-green-500 text-zinc-900' : 'bg-red-500 text-white'}`}>
                            {trade.side}
                        </span>
                        <div className="flex flex-col">
                            <span className="text-xl font-bold text-white leading-none mb-1">{trade.symbol} <span className="text-zinc-500 text-sm font-normal">#{trade.id.substr(0,4)}</span></span>
                            <span className={`text-lg font-mono font-bold leading-none ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                                {isProfit ? '+' : ''}${formatCurrency(trade.pnl || 0)}
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 p-2.5 rounded-lg">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                    
                    {/* CHART SNAPSHOT */}
                    <div className="bg-[#18181b] border border-white/10 rounded-2xl h-80 relative overflow-hidden shadow-inner ring-1 ring-white/5">
                        {isLoadingChart && (
                            <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50 backdrop-blur-sm">
                                <div className="flex flex-col items-center">
                                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                                    <span className="text-sm text-blue-400 font-bold uppercase tracking-wider">Loading Chart...</span>
                                </div>
                            </div>
                        )}
                        <div ref={chartContainerRef} className="w-full h-full" />
                    </div>

                    {/* Inputs */}
                    <div className="space-y-6">
                        <div>
                            <label className="text-sm font-bold text-zinc-300 uppercase mb-2 block tracking-wider">Trade Tags</label>
                            <input 
                                type="text" 
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                                placeholder="e.g. Breakout, Trend Following, Asian Session"
                                className="input-bubble w-full rounded-xl px-4 py-3.5 text-base text-white placeholder-zinc-600 focus:border-blue-500/50 outline-none transition-all focus:ring-1 focus:ring-blue-500/20"
                            />
                            <p className="text-xs text-zinc-500 mt-2 ml-1">Separate tags with commas</p>
                        </div>
                        
                        <div>
                            <label className="text-sm font-bold text-zinc-300 uppercase mb-2 block tracking-wider">Analysis & Notes</label>
                            <textarea 
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Describe your thought process, emotions, and execution details..."
                                className="input-bubble w-full h-40 rounded-xl px-4 py-3.5 text-base text-white placeholder-zinc-600 focus:border-blue-500/50 outline-none resize-none font-mono transition-all focus:ring-1 focus:ring-blue-500/20 leading-relaxed"
                            />
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="px-6 py-5 border-t border-white/10 flex justify-end space-x-3 bg-black/20 shrink-0">
                    <button onClick={onClose} className="px-6 py-3 text-sm font-bold text-zinc-400 hover:text-white transition-colors uppercase tracking-wider">Discard</button>
                    <button 
                        onClick={handleSave}
                        className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-900/30 transition-all active:scale-95 flex items-center space-x-2 uppercase tracking-wider"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        <span>Save Entry</span>
                    </button>
                </div>

            </div>
        </div>
    );
};
