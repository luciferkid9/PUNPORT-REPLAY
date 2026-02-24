import { useState, useEffect, useMemo, useCallback } from 'react';
import { DrawingObject, ToolType, IndicatorConfig, IndicatorType, DrawingSettings, FibLevel, SymbolType, Candle } from '../types';
import { calculateEMA, calculateRSI, calculateMACD } from '../services/logicEngine';

const DEFAULT_KILLZONE_CONFIG = {
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
  chartData: Candle[],
  warmupDataRef: React.MutableRefObject<Candle[]>,
  lastTime: number
) {
  const [allDrawings, setAllDrawings] = useState<DrawingObject[]>([]);
  const [activeTool, setActiveTool] = useState<ToolType>('CURSOR');
  const [magnetMode, setMagnetMode] = useState<boolean>(false);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [editingDrawingId, setEditingDrawingId] = useState<string | null>(null);
  const [showDrawingManager, setShowDrawingManager] = useState<boolean>(false);
  const [drawingSettings, setDrawingSettings] = useState<DrawingSettings>({ 
      color: '#3b82f6', 
      lineWidth: 2, 
      lineStyle: 'solid' 
  });

  const [currentFibLevels, setCurrentFibLevels] = useState<FibLevel[]>(DEFAULT_FIB_LEVELS);

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

  const [indicatorConfigs, setIndicatorConfigs] = useState<IndicatorConfig[]>([
      { id: 'default-macd', type: 'MACD', visible: true, fastLength: 12, slowLength: 26, signalLength: 9, color: '#2962ff', signalColor: '#f57c00', histogramColor: undefined },
      { id: 'default-rsi', type: 'RSI', visible: true, period: 14, upperLevel: 70, lowerLevel: 30, color: '#7e57c2' },
      { id: 'default-ema', type: 'EMA', visible: false, period: 14, color: '#2962ff' }
  ]);
  const [editingIndicator, setEditingIndicator] = useState<IndicatorConfig | null>(null);
  
  const [emaDataMap, setEmaDataMap] = useState<Map<string, { time: number; value: number }[]>>(new Map());
  const [rsiData, setRsiData] = useState<{ time: number; value: number }[]>([]);
  const [macdData, setMacdData] = useState<{ macd: any[], signal: any[], histogram: any[] }>({ macd: [], signal: [], histogram: [] });
  const [showIndicatorMenu, setShowIndicatorMenu] = useState<boolean>(false);

  useEffect(() => {
      if (chartData.length === 0) return;
      const rawFull = [...warmupDataRef.current, ...chartData];
      const fullSeries = rawFull.filter((v, i, a) => i === 0 || v.time > a[i - 1].time);
      const visibleStartTime = chartData[0].time;

      const newEmaMap = new Map<string, { time: number; value: number }[]>();
      indicatorConfigs.filter(c => c.type === 'EMA' && c.visible).forEach(config => {
          const rawEma = calculateEMA(fullSeries, config.period || 14);
          newEmaMap.set(config.id, rawEma.filter(d => d.time >= visibleStartTime));
      });
      setEmaDataMap(newEmaMap);

      const rsiConfig = indicatorConfigs.find(c => c.type === 'RSI');
      if (rsiConfig?.visible) {
          const rawRsi = calculateRSI(fullSeries, rsiConfig.period || 14);
          setRsiData(rawRsi.filter(d => d.time >= visibleStartTime));
      }
      const macdConfig = indicatorConfigs.find(c => c.type === 'MACD');
      if (macdConfig?.visible) {
          const rawMacd = calculateMACD(fullSeries, macdConfig.fastLength || 12, macdConfig.slowLength || 26, macdConfig.signalLength || 9);
          setMacdData({
              macd: rawMacd.macd.filter(d => d.time >= visibleStartTime),
              signal: rawMacd.signal.filter(d => d.time >= visibleStartTime),
              histogram: rawMacd.histogram.filter(d => d.time >= visibleStartTime)
          });
      }
  }, [chartData, indicatorConfigs, warmupDataRef]);

  const slicedEmaMap = useMemo(() => {
      if (emaDataMap.size === 0) return undefined;
      const sliced = new Map<string, { time: number; value: number }[]>();
      emaDataMap.forEach((points, id) => {
          sliced.set(id, points.filter(p => p.time <= lastTime));
      });
      return sliced;
  }, [emaDataMap, lastTime]);

  const toggleIndicator = useCallback((id: string) => {
      setIndicatorConfigs(prev => prev.map(c => c.id === id ? { ...c, visible: !c.visible } : c));
  }, []);

  const handleRemoveIndicator = useCallback((id: string) => {
      setIndicatorConfigs(prev => prev.filter(c => c.id !== id));
  }, []);

  const handleIndicatorUpdate = useCallback((newConfig: IndicatorConfig) => {
      setIndicatorConfigs(prev => prev.map(c => c.id === newConfig.id ? newConfig : c));
  }, []);

  const handleAddIndicator = useCallback((type: IndicatorType) => {
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
  }, []);

  const handleAddAutoKillZone = useCallback(() => {
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
  }, [activeSymbol, allDrawings, currentSimTime, tradingPrice]);

  const handleDrawingCreate = useCallback((d: DrawingObject) => {
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
      setAllDrawings(prev => [...prev, symbolDrawing]); 
      setSelectedDrawingId(d.id); 
      setActiveTool('CURSOR'); 
  }, [activeSymbol, chartData, currentFibLevels]);
  
  const handleDrawingUpdate = useCallback((updated: DrawingObject) => {
      if (updated.type === 'FIB' && updated.fibLevels) {
          setCurrentFibLevels(updated.fibLevels.map(l => ({...l})));
      }
      setAllDrawings(prev => prev.map(d => d.id === updated.id ? updated : d));
  }, []);
  
  const handleDrawingDelete = useCallback((id: string) => {
      setAllDrawings(prev => prev.filter(d => d.id !== id));
  }, []);

  const resetDrawings = useCallback(() => {
      setAllDrawings([]);
  }, []);

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
      showDrawingManager,
      setShowDrawingManager,
      drawingSettings,
      setDrawingSettings,
      currentFibLevels,
      setCurrentFibLevels,
      currentDrawings,
      hasKillZone,
      activeKillZoneConfig,
      indicatorConfigs,
      setIndicatorConfigs,
      editingIndicator,
      setEditingIndicator,
      emaDataMap,
      rsiData,
      macdData,
      showIndicatorMenu,
      setShowIndicatorMenu,
      slicedEmaMap,
      toggleIndicator,
      handleRemoveIndicator,
      handleIndicatorUpdate,
      handleAddIndicator,
      handleAddAutoKillZone,
      handleDrawingCreate,
      handleDrawingUpdate,
      handleDrawingDelete,
      resetDrawings
  };
}
