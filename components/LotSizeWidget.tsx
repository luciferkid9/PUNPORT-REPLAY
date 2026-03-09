import React, { useMemo } from 'react';
import { SymbolType, LotSizeConfig } from '../types';

interface Props {
    config: LotSizeConfig;
    activeSymbol: SymbolType;
    currentPrice: number;
    onDoubleClick: () => void;
    autoConversionPrice?: number | null;
}

export const LotSizeWidget: React.FC<Props> = ({ config, activeSymbol, currentPrice, onDoubleClick, autoConversionPrice }) => {
    if (!config.show) return null;

    const calculation = useMemo(() => {
        // Step 1: Calculate Risk Amount
        const riskAmount = config.accountBalance * (config.riskPercent / 100);

        if (config.stopLossPips <= 0) {
            return { riskAmount, units: 0, lots: 0 };
        }

        // Step 2: Determine Asset Properties based on user-provided logic
        const tickerStr = activeSymbol.toUpperCase();
        const isJPY = tickerStr.includes('JPY');
        const isXAU = tickerStr.includes('XAU') || tickerStr.includes('GOLD');
        const isXAG = tickerStr.includes('XAG') || tickerStr.includes('SILVER');

        // User logic: pipSize = (isJPY or isXAU or isXAG) ? 0.01 : 0.0001
        const pipSize = (isJPY || isXAU || isXAG) ? 0.01 : 0.0001;
        
        // User logic: lotSizeUnit = 100,000 (except Gold 100, Silver 5000)
        const lotSizeUnit = 100000.0;
        const goldLotSize = 100.0;
        const silverLotSize = 5000.0;
        const contractSize = isXAU ? goldLotSize : (isXAG ? silverLotSize : lotSizeUnit);

        // Step 3: Calculate Pip Value in Account Currency
        let conversionRate = 1.0;
        const accountCurrency = (config.currency || 'USD').toUpperCase();
        
        const cleanSymbol = tickerStr.replace(/[^A-Z]/g, '');
        let baseCurrency = '';
        let quoteCurrency = '';
        
        if (cleanSymbol.length >= 6) {
            baseCurrency = cleanSymbol.substring(0, 3);
            quoteCurrency = cleanSymbol.substring(3, 6);
        } else if (isXAU || isXAG) {
            baseCurrency = isXAU ? 'XAU' : 'XAG';
            quoteCurrency = 'USD';
        }

        if (quoteCurrency === accountCurrency) {
            // e.g. EURUSD, XAUUSD -> Quote is USD. Account is USD. Rate = 1.
            conversionRate = 1.0;
        } else if (baseCurrency === accountCurrency) {
            // e.g. USDJPY -> Base is USD. Quote is JPY. Account is USD.
            // Pip Value = (PipSize / Price) * LotSize
            if (currentPrice > 0) conversionRate = 1.0 / currentPrice;
        } else {
            // Cross pair case (e.g. EURJPY, EURAUD)
            // Use autoConversionPrice fetched from DB in App.tsx
            const effectiveConvPrice = autoConversionPrice;

            if (effectiveConvPrice && effectiveConvPrice > 0) {
                // Determine if we should multiply or divide based on standard pair conventions
                // AUDUSD, GBPUSD, NZDUSD, EURUSD are usually multipliers
                // USDCAD, USDCHF, USDJPY are usually divisors
                const multiplyPairs = ['AUD', 'NZD', 'GBP', 'EUR'];
                const isMultiply = multiplyPairs.includes(quoteCurrency);
                
                if (isMultiply) {
                    conversionRate = effectiveConvPrice;
                } else {
                    conversionRate = 1.0 / effectiveConvPrice;
                }
            } else {
                // Fallback heuristic if autoConversionPrice is not yet available
                if (isJPY) {
                    conversionRate = 1.0 / 150.0; 
                } else if (quoteCurrency === 'AUD') {
                    conversionRate = 0.70; // Rough estimate for AUDUSD
                } else if (quoteCurrency === 'CAD') {
                    conversionRate = 1.0 / 1.35; // Rough estimate for USDCAD
                } else {
                    conversionRate = 1.0;
                }
            }
        }

        const pipValueAccount = pipSize * conversionRate;

        // Step 4: Calculate Position Size (Units)
        let units = 0;
        if (pipValueAccount > 0 && config.stopLossPips > 0) {
            // Position Size = Risk / (SL * PipValue)
            units = riskAmount / (config.stopLossPips * pipValueAccount);
        }

        // Step 5: Calculate Standard Lots
        const rawLots = units / contractSize;
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
