
import React, { useEffect, useState, useRef } from 'react';
import { SymbolType } from '../types';
import { fetchContextCandles } from '../services/api';
import { analyzeMarketTrend, MarketTrend } from '../services/logicEngine';

interface Props {
    symbol: SymbolType;
    currentSimTime: number;
    isVisible: boolean;
    onClose: () => void;
}

const TIMEFRAMES = [
    { id: 'D1', label: 'TF1D (MACD)', apiTF: 'D1' },
    { id: 'H4', label: 'TF4H (MACD)', apiTF: 'H4' },
    { id: 'H2', label: 'TF2H (MACD)', apiTF: 'H2' },
    { id: 'M30', label: 'TF30M (MACD)', apiTF: 'M30' }
] as const;

export const MarketStructureWidget: React.FC<Props> = ({ symbol, currentSimTime, isVisible, onClose }) => {
    const [trends, setTrends] = useState<Record<string, MarketTrend>>({});
    // Used to track if we have initial data to show, prevents "Loading..." flash on every tick
    const [hasInitialData, setHasInitialData] = useState(false);
    
    // Throttling to prevent API spam during high-speed replay
    const lastUpdateRef = useRef<number>(0);
    const UPDATE_THRESHOLD = 300; // Only update if sim time moves by 5 minutes (300s)

    useEffect(() => {
        if (!isVisible || !currentSimTime || !symbol) return;

        // Throttle logic: Only skip if we have data AND time difference is small
        if (hasInitialData && Math.abs(currentSimTime - lastUpdateRef.current) < UPDATE_THRESHOLD && lastUpdateRef.current !== 0) {
            return;
        }

        const fetchData = async () => {
            const newTrends: Record<string, MarketTrend> = { ...trends };
            
            // Parallel fetch for all 4 TFs
            await Promise.all(TIMEFRAMES.map(async (tf) => {
                try {
                    // Fetch context. Logic engine now supports any length > 0.
                    // We try to get 100, but even 5 is fine.
                    const data = await fetchContextCandles(symbol, tf.apiTF as any, currentSimTime, 100);
                    const trend = analyzeMarketTrend(data);
                    newTrends[tf.id] = trend;
                } catch (e) {
                    console.error(`Failed to analyze ${tf.id}`, e);
                    if (!newTrends[tf.id]) newTrends[tf.id] = 'UNKNOWN';
                }
            }));

            setTrends(newTrends);
            setHasInitialData(true);
            lastUpdateRef.current = currentSimTime;
        };

        fetchData();

    }, [symbol, currentSimTime, isVisible]);

    if (!isVisible) return null;

    const renderTrendRow = (tfId: string, label: string) => {
        const trend = trends[tfId];
        
        let bgColor = 'bg-zinc-700';
        let text = 'Loading...';
        let arrow = '-';
        let arrowColor = 'text-zinc-500';
        let textColor = 'text-zinc-300';
        let suffix = '';

        const displayTrend = trend || 'UNKNOWN';
        const isEarly = displayTrend.endsWith('_EARLY');
        
        // Visual Feedback: 70% Opacity for Early Signals
        const opacityClass = isEarly ? 'opacity-70' : 'opacity-100';

        if (!hasInitialData && !trend) {
             text = 'Loading...';
        } else {
            const baseTrend = isEarly ? displayTrend.replace('_EARLY', '') : displayTrend;
            
            if (isEarly) suffix = ' (Early)';

            switch (baseTrend) {
                case 'BULLISH_MOMENTUM':
                    bgColor = 'bg-green-600';
                    text = 'Bullish Momentum';
                    arrow = '⬆';
                    arrowColor = 'text-green-500';
                    textColor = 'text-white';
                    break;
                case 'BEARISH_MOMENTUM':
                    bgColor = 'bg-red-600';
                    text = 'Bearish Momentum';
                    arrow = '⬇';
                    arrowColor = 'text-red-500';
                    textColor = 'text-white';
                    break;
                case 'SIDEWAY_UP':
                    bgColor = 'bg-amber-400';
                    text = 'Sideway Up';
                    arrow = '↗';
                    arrowColor = 'text-amber-500';
                    textColor = 'text-zinc-900';
                    break;
                case 'SIDEWAY_DOWN':
                    bgColor = 'bg-amber-400';
                    text = 'Sideway Down';
                    arrow = '↘';
                    arrowColor = 'text-amber-500';
                    textColor = 'text-zinc-900';
                    break;
                default:
                    text = 'No Data';
                    bgColor = 'bg-zinc-700';
            }
        }

        return (
            <div key={tfId} className={`grid grid-cols-12 border-b border-white/10 last:border-0 h-9 transition-opacity ${opacityClass}`}>
                {/* TF Label */}
                <div className="col-span-4 bg-[#5479cf] flex items-center justify-center text-[10px] font-bold text-white border-r border-white/10">
                    {label}
                </div>
                
                {/* Direction Arrow */}
                <div className={`col-span-3 flex items-center justify-center border-r border-white/10 ${bgColor}`}>
                    <span className={`text-lg font-bold ${textColor}`}>{arrow}</span>
                </div>
                
                {/* Status Text */}
                <div className={`col-span-5 flex items-center justify-center text-[10px] font-bold ${textColor} ${bgColor} whitespace-nowrap px-1`}>
                    {text}{suffix}
                </div>
            </div>
        );
    };

    return (
        // Positioned Top-Right, offset by 70px to avoid covering the price scale
        <div className="absolute right-[70px] top-4 z-30 w-72 glass-bubble rounded-lg overflow-hidden shadow-2xl border border-white/10 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Header */}
            <div className="bg-[#374151] grid grid-cols-12 h-7 items-center border-b border-white/10">
                <div className="col-span-4 text-center text-[10px] font-bold text-white">Check List</div>
                <div className="col-span-3 text-center text-[10px] font-bold text-white">Direction</div>
                <div className="col-span-4 text-center text-[10px] font-bold text-white">Trend</div>
                <div className="col-span-1 flex items-center justify-center">
                     <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                     </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex flex-col bg-zinc-900">
                {TIMEFRAMES.map(tf => renderTrendRow(tf.id, tf.label))}
            </div>
        </div>
    );
};
