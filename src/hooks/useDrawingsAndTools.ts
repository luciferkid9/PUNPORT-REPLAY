import { useState, useMemo } from 'react';
import { DrawingObject, ToolType, DrawingSettings, FibLevel, IndicatorConfig, IndicatorType, KillZoneConfig, SymbolType, Candle } from '../types';

const DEFAULT_KILLZONE_CONFIG: KillZoneConfig = {
    asian: { enabled: true, label: 'Asian', color: '#e91e63', start: '06:00', end: '11:00' }, 
    london: { enabled: true, label: 'London', color: '#00bcd4', start: '14:00', end: '17:00' },
    ny: { enabled: true, label: 'New York', color: '#ff5d00', start: '19:00', end: '04:00' },
    showHighLowLines: false,
    showAverage: false,     
    extend: false,
    showLabel: true,        
    opacity: 0.15           
};

const DEFAULT_FIB_LEVELS: FibLevel[] = [
    { level: 0, color: '#94a3b8', visible: true },
    { level: 0.236, color: '#ef4444', visible: false }, 
    { level: 0.382, color: '#ef4444', visible: true },
    { level: 0.5, color: '#22c55e', visible: true },
    { level: 0.618, color: '#eab308', visible: true },
    { level: 0.786, color: '#3b82f6', visible: true },
    { level: 0.886, color: '#6366f1', visible: true },
    { level: 1, color: '#a1a1aa', visible: true },
    { level: 1.272, color: '#f87171', visible: true },
    { level: 1.618, color: '#a855f7', visible: true }, 
];

export function useDrawingsAndTools(
    activeSymbol: SymbolType,
    currentSimTime: number,
    tradingPrice: number,
    chartData: Candle[]
) {
  const [allDrawings, setAllDrawings] = useState<DrawingObject[]>([]);
  const [activeTool, setActiveTool] = useState<ToolType>('CURSOR');
  const [magnetMode, setMagnetMode] = useState<boolean>(false);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [editingDrawingId, setEditingDrawingId] = useState<string | null>(null);
  const [drawingSettings, setDrawingSettings] = useState<DrawingSettings>({ 
      color: '#3b82f6', 
      lineWidth: 2, 
      lineStyle: 'solid' 
  });

  const [currentFibLevels, setCurrentFibLevels] = useState<FibLevel[]>(DEFAULT_FIB_LEVELS);

  const [indicatorConfigs, setIndicatorConfigs] = useState<IndicatorConfig[]>([
      { id: 'default-macd', type: 'MACD', visible: true, fastLength: 12, slowLength: 26, signalLength: 9, color: '#2962ff', signalColor: '#f57c00', histogramColor: undefined },
      { id: 'default-rsi', type: 'RSI', visible: true, period: 14, upperLevel: 70, lowerLevel: 30, color: '#7e57c2' },
      { id: 'default-ema', type: 'EMA', visible: false, period: 14, color: '#2962ff' }
  ]);
  const [editingIndicator, setEditingIndicator] = useState<IndicatorConfig | null>(null);

  const currentDrawings = useMemo(() => {
      return allDrawings.filter(d => d.symbol === activeSymbol);
  }, [allDrawings, activeSymbol]);

  const hasKillZone = useMemo(() => {
      return currentDrawings.some(d => d.type === 'KILLZONE');
  }, [currentDrawings]);

  const activeKillZoneConfig = useMemo(() => {
      const kz = currentDrawings.find(d => d.type === 'KILLZONE');
      return kz?.killZoneConfig || DEFAULT_KILLZONE_CONFIG;
  }, [currentDrawings]);

  const toggleIndicator = (id: string) => {
      setIndicatorConfigs(prev => prev.map(c => c.id === id ? { ...c, visible: !c.visible } : c));
  };
  const handleRemoveIndicator = (id: string) => {
      setIndicatorConfigs(prev => prev.filter(c => c.id !== id));
  };
  const handleIndicatorUpdate = (newConfig: IndicatorConfig) => {
      setIndicatorConfigs(prev => prev.map(c => c.id === newConfig.id ? newConfig : c));
  };
  const handleAddIndicator = (type: IndicatorType) => {
      const newId = `custom-${type}-${Math.random().toString(36).substr(2, 5)}`;
      const baseConfig: Partial<IndicatorConfig> = {
          id: newId,
          type,
          visible: true
      };
      
      if (type === 'EMA') {
          baseConfig.period = 14;
          baseConfig.color = '#ff9800';
      } else if (type === 'RSI') {
          baseConfig.period = 14;
          baseConfig.upperLevel = 70;
          baseConfig.lowerLevel = 30;
          baseConfig.color = '#e91e63';
      } else if (type === 'MACD') {
          baseConfig.fastLength = 12;
          baseConfig.slowLength = 26;
          baseConfig.signalLength = 9;
          baseConfig.color = '#00bcd4';
          baseConfig.signalColor = '#ff5722';
      }
      
      setIndicatorConfigs(prev => [...prev, baseConfig as IndicatorConfig]);
  };

  const handleAddAutoKillZone = () => {
      const exists = allDrawings.some(d => d.type === 'KILLZONE' && d.symbol === activeSymbol);
      if (exists) {
          const kz = allDrawings.find(d => d.type === 'KILLZONE' && d.symbol === activeSymbol);
          if (kz) setSelectedDrawingId(kz.id);
          return;
      }
      const newKZ: DrawingObject = {
          id: Math.random().toString(36).substr(2, 9),
          symbol: activeSymbol,
          type: 'KILLZONE',
          p1: { time: currentSimTime, price: tradingPrice },
          p2: { time: currentSimTime, price: tradingPrice },
          visible: true,
          locked: false,
          color: '#ffffff',
          lineWidth: 1,
          lineStyle: 'solid',
          killZoneConfig: { ...DEFAULT_KILLZONE_CONFIG }
      };
      setAllDrawings(prev => [...prev, newKZ]);
      setSelectedDrawingId(newKZ.id);
  };

  const handleDrawingCreate = (d: DrawingObject) => {
      const symbolDrawing = { ...d, symbol: activeSymbol };
      const isPosition = d.type === 'LONG_POSITION' || d.type === 'SHORT_POSITION';
      if (d.type === 'FIB') {
        symbolDrawing.fibLevels = currentFibLevels.map(l => ({...l})); 
      } else if (isPosition) {
        const isLong = d.type === 'LONG_POSITION';
        const entryPrice = d.p1.price;
        const diff = Math.abs(d.p2.price - entryPrice);
        const minThreshold = entryPrice * 0.0001; 
        const priceOffset = diff > minThreshold ? diff : entryPrice * 0.01;
        if (!d.targetPrice) symbolDrawing.targetPrice = isLong ? entryPrice + priceOffset : entryPrice - priceOffset;
        if (!d.stopPrice) {
            const slOffset = priceOffset * 0.5;
            symbolDrawing.stopPrice = isLong ? entryPrice - slOffset : entryPrice + slOffset;
        }
        const timeDiff = Math.abs(d.p2.time - d.p1.time);
        if (timeDiff === 0) {
            const barInterval = chartData.length > 1 ? chartData[1].time - chartData[0].time : 3600;
            symbolDrawing.p2.time = d.p1.time + (barInterval * 20);
        }
      } else if (d.type === 'TEXT') {
          symbolDrawing.text = "Text";
          symbolDrawing.fontSize = 14;
          symbolDrawing.color = '#ffffff'; 
      }
      setAllDrawings(prev => [...prev, symbolDrawing]); setSelectedDrawingId(d.id); setActiveTool('CURSOR'); 
  };
  
  const handleDrawingUpdate = (updated: DrawingObject) => {
      if (updated.type === 'FIB' && updated.fibLevels) {
          setCurrentFibLevels(updated.fibLevels.map(l => ({...l})));
      }
      setAllDrawings(prev => prev.map(d => d.id === updated.id ? updated : d));
  };
  
  const handleDrawingDelete = (id: string) => setAllDrawings(prev => prev.filter(d => d.id !== id));

  return {
      allDrawings,
      setAllDrawings,
      activeTool,
      setActiveTool,
      magnetMode,
      setMagnetMode,
      selectedDrawingId,
      setSelectedDrawingId,
      editingDrawingId,
      setEditingDrawingId,
      drawingSettings,
      setDrawingSettings,
      indicatorConfigs,
      setIndicatorConfigs,
      editingIndicator,
      setEditingIndicator,
      currentDrawings,
      hasKillZone,
      activeKillZoneConfig,
      toggleIndicator,
      handleRemoveIndicator,
      handleIndicatorUpdate,
      handleAddIndicator,
      handleAddAutoKillZone,
      handleDrawingCreate,
      handleDrawingUpdate,
      handleDrawingDelete
  };
}
