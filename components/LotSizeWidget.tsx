import React, { useMemo } from 'react';
import { SymbolType, LotSizeConfig } from '../types';

interface Props {
    config: LotSizeConfig;
    activeSymbol: SymbolType;
    currentPrice: number;
    onDoubleClick: () => void;
}

export const LotSizeWidget: React.FC<Props> = ({ config, activeSymbol, currentPrice, onDoubleClick }) => {
    if (!config.show) return null;

    const calculation = useMemo(() => {
        // Step 1: Calculate Risk Amount
        const riskAmount = config.accountBalance * (config.riskPercent / 100);

        if (config.stopLossPips <= 0) {
            return { riskAmount, units: 0, lots: 0 };
        }

        // Step 2: Determine Asset Properties based on symbol
        let pipSize = 0.0001;
        let contractSize = 100000;

        if (activeSymbol.includes('JPY')) {
            pipSize = 0.01;
            contractSize = 100000;
        } else if (activeSymbol.includes('XAU')) {
            pipSize = 0.01;
            contractSize = 100;
        } else if (activeSymbol.includes('XAG')) {
            pipSize = 0.01;
            contractSize = 5000;
        } else {
            pipSize = 0.0001;
            contractSize = 100000;
        }

        // Step 3: Calculate Pip Value
        // conversionRate: The current exchange rate to convert the Quote Currency back to Account Currency.
        let conversionRate = 1.0;
        const accountCurrency = config.currency || 'USD';
        
        // Heuristic to determine Quote Currency (Last 3 chars)
        const quoteCurrency = activeSymbol.length >= 3 ? activeSymbol.slice(-3) : '';
        const baseCurrency = activeSymbol.length >= 6 ? activeSymbol.slice(0, activeSymbol.length - 3) : '';

        if (quoteCurrency === accountCurrency) {
            // e.g. EURUSD, XAUUSD -> Quote is USD. Account is USD. Rate = 1.
            conversionRate = 1.0;
        } else if (baseCurrency === accountCurrency) {
            // e.g. USDJPY -> Base is USD. Quote is JPY. Account is USD.
            // We need JPY -> USD rate.
            // Current Price is USD/JPY.
            // 1 USD = Price JPY.
            // 1 JPY = 1 / Price USD.
            if (currentPrice > 0) conversionRate = 1.0 / currentPrice;
        } else {
            // Cross pair (e.g. EURJPY) or unknown.
            // Default to 1.0 as we might not have the specific conversion pair price (e.g. USDJPY) available in this context.
            // However, for JPY pairs, 1.0 is significantly off.
            // If it's a JPY quote but not USDJPY, we ideally need USDJPY price.
            // Without it, we fallback to 1.0 (or user must provide it).
            conversionRate = 1.0;
        }

        const pipValueAccount = pipSize * conversionRate;

        // Step 4: Calculate Position Size (Units)
        let units = 0;
        if (pipValueAccount > 0) {
            units = riskAmount / (config.stopLossPips * pipValueAccount);
        }

        // Step 5: Calculate Standard Lots
        const rawLots = units / contractSize;
        // Apply rounding to nearest 2 decimal places (standard practice for some calculators, though floor is safer for strict risk)
        // User requested match with scenarios that imply rounding (e.g. 0.266 -> 0.27)
        const finalLots = Math.round(rawLots * 100) / 100;

        return {
            riskAmount,
            units,
            lots: finalLots
        };
    }, [config, activeSymbol, currentPrice]);

    const positionClasses = {
        'top-left': 'top-4 left-4',
        'top-right': 'top-4 right-[70px]',
        'bottom-left': 'bottom-10 left-4',
        'bottom-right': 'bottom-10 right-[70px]',
    };

    return (
        <div 
            className={`absolute ${positionClasses[config.position]} z-30 glass-panel p-4 rounded-xl border border-white/10 shadow-2xl cursor-pointer hover:bg-white/5 transition-colors min-w-[220px] animate-in fade-in zoom-in-95 duration-300`}
            onDoubleClick={onDoubleClick}
            title="Double click to configure"
        >
            <div className="flex items-center space-x-2 mb-3 border-b border-white/10 pb-2">
                <span className="text-red-400 text-lg">📌</span>
                <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">คู่เงิน: <span className="text-white">{activeSymbol}</span></span>
            </div>
            
            <div className="space-y-2 text-xs text-zinc-400 font-mono">
                <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1">💰 <span className="font-sans">ความเสี่ยง:</span></span>
                    <span className="text-white font-bold">{calculation.riskAmount.toFixed(2)} {config.currency}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1">🛑 <span className="font-sans">หยุดขาดทุน:</span></span>
                    <span className="text-white font-bold">{config.stopLossPips} Pips</span>
                </div>
            </div>

            <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between bg-black/20 p-2 rounded-lg">
                <span className="text-lg">🛒</span>
                <span className="text-sm font-black text-yellow-400 tracking-tight">Lot Size : {calculation.lots.toFixed(2)} Lots</span>
            </div>
        </div>
    );
};
