
import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, MouseEventParams, LogicalRange, IPriceLine, TickMarkType } from 'lightweight-charts';
import { Candle, Trade, OrderStatus, ToolType, DrawingObject, Point, IndicatorConfig, DrawingSettings, SymbolType, SessionConfig, IndicatorType, DragTradeUpdate, LotSizeConfig } from '../types';
import { LotSizeWidget } from './LotSizeWidget';

interface Props {
  data: Candle[];
  trades: Trade[];
  activeTool: ToolType;
  magnetMode: boolean;
  drawingSettings: DrawingSettings;
  indicatorConfigs: IndicatorConfig[];
  activeSymbol: SymbolType;
  interval: number;
  emaDataMap?: Map<string, { time: number; value: number }[]>; 
  rsiData?: { time: number; value: number }[];
  macdData?: { macd: { time: number; value: number }[], signal: { time: number; value: number }[], histogram: { time: number; value: number }[] };
  onDrawingCreate?: (d: DrawingObject) => void;
  onDrawingUpdate?: (d: DrawingObject) => void;
  onDrawingEdit?: (d: DrawingObject) => void;
  onDrawingSelect?: (id: string | null) => void;
  onDrawingDelete?: (id: string) => void;
  onModifyTrade?: (id: string, sl: number, tp: number) => void;
  onModifyOrderEntry?: (id: string, newEntry: number) => void;
  onTradeDrag?: (update: DragTradeUpdate | null) => void; 
  onLoadMore?: () => void;
  onIndicatorDblClick: (config: IndicatorConfig) => void; 
  onRemoveIndicator: (id: string) => void;
  drawings: DrawingObject[];
  selectedDrawingId: string | null;
  pricePrecision?: number; 
  lotSizeConfig?: LotSizeConfig;
  onLotSizeWidgetDoubleClick?: () => void;
  currentPrice?: number;
}

export interface ChartRef {
    fitContent: () => void;
}

interface DragState {
    id: string;
    point: 'p1' | 'p2' | 'all' | 'target' | 'stop' | 'entry';
    initialP1: Point;
    initialP2: Point;
    initialTarget?: number;
    initialStop?: number;
    initialMouse: Point;
    pane: string; // Store which pane we are dragging on
}

interface DragTradeState {
    id: string;
    type: 'SL' | 'TP' | 'ENTRY';
    startPrice: number;
    currentPrice: number;
}

// CONSTANT: Seconds offset for Bangkok Time (UTC+7)
const BANGKOK_OFFSET = 25200; 

const getSessionTimestamp = (dateStr: string, timeStr: string): number => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute] = timeStr.split(':').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
    return (date.getTime() / 1000) - BANGKOK_OFFSET;
};

export const ChartContainer = forwardRef<ChartRef, Props>(({ 
    data, trades, activeTool, magnetMode, drawingSettings, indicatorConfigs, 
    activeSymbol, interval,
    emaDataMap, rsiData, macdData, 
    onDrawingCreate, onDrawingUpdate, onDrawingEdit, onDrawingSelect, onDrawingDelete, onModifyTrade, onModifyOrderEntry, onTradeDrag, onLoadMore, onIndicatorDblClick, onRemoveIndicator, drawings, selectedDrawingId,
    pricePrecision = 5,
    lotSizeConfig, onLotSizeWidgetDoubleClick, currentPrice
}, ref) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  const indicatorChartRefs = useRef<Map<string, IChartApi>>(new Map());
  const indicatorContainerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  
  const [indicatorHeights, setIndicatorHeights] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ type: string, startY: number, startHeight: number } | null>(null);

  const [indicatorValues, setIndicatorValues] = useState<Record<string, any>>({});

  const isSyncingRef = useRef<boolean>(false);

  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  
  const emaSeriesRefs = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  
  const entryLinesRef = useRef<Map<string, IPriceLine>>(new Map());

  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiUpperLineRef = useRef<IPriceLine | null>(null);
  const rsiLowerLineRef = useRef<IPriceLine | null>(null);

  const macdSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistogramSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  
  // Track active drawing point (per pane or global if careful)
  const [tempPoint, setTempPoint] = useState<{ point: Point, pane: string } | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{ point: Point, pane: string } | null>(null); 
  
  // SVG Paths split by Pane ID
  const [svgPaths, setSvgPaths] = useState<Record<string, React.ReactNode[]>>({ MAIN: [] });
  
  const [activeDragObject, setActiveDragObject] = useState<DrawingObject | null>(null);
  const [dragTarget, setDragTarget] = useState<DragState | null>(null);
  
  const [dragTrade, setDragTrade] = useState<DragTradeState | null>(null);

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const activeToolRef = useRef(activeTool);
  const magnetModeRef = useRef(magnetMode);
  const drawingSettingsRef = useRef(drawingSettings);
  const activeSymbolRef = useRef(activeSymbol);
  const onDrawingCreateRef = useRef(onDrawingCreate);
  const onDrawingSelectRef = useRef(onDrawingSelect);
  const intervalRef = useRef(interval);
  const tempPointRef = useRef(tempPoint);

  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { magnetModeRef.current = magnetMode; }, [magnetMode]);
  useEffect(() => { drawingSettingsRef.current = drawingSettings; }, [drawingSettings]);
  useEffect(() => { activeSymbolRef.current = activeSymbol; }, [activeSymbol]);
  useEffect(() => { onDrawingCreateRef.current = onDrawingCreate; }, [onDrawingCreate]);
  useEffect(() => { onDrawingSelectRef.current = onDrawingSelect; }, [onDrawingSelect]);
  useEffect(() => { intervalRef.current = interval; }, [interval]);
  useEffect(() => { tempPointRef.current = tempPoint; }, [tempPoint]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) return;
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
            if (onDrawingDelete) {
                onDrawingDelete(selectedDrawingId);
                if (onDrawingSelect) onDrawingSelect(null);
            }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDrawingId, onDrawingDelete, onDrawingSelect]);

  useImperativeHandle(ref, () => ({
    fitContent: () => {
        chartRef.current?.timeScale().fitContent();
    }
  }));

  // Helper to get Chart and Series for a given Pane
  const getPaneContext = (pane: string) => {
      if (pane === 'MAIN') {
          return { chart: chartRef.current, series: candleSeriesRef.current };
      }
      const indChart = indicatorChartRefs.current.get(pane);
      let indSeries: ISeriesApi<any> | null = null;
      
      if (pane === 'RSI') indSeries = rsiSeriesRef.current;
      else if (pane === 'MACD') indSeries = macdSeriesRef.current; // Use MACD line as primary for coords
      
      return { chart: indChart || null, series: indSeries || null };
  };

  const getMagnetPrice = (time: number, rawPrice: number, pane: string): number => {
      if (!magnetModeRef.current) return rawPrice;
      
      // Magnet only logic for Main Pane currently for simplicity
      // For Indicators, we could snap to values, but simpler to skip for now
      if (pane !== 'MAIN') return rawPrice;

      const currentData = dataRef.current;
      const candle = currentData.find(c => c.time === time);
      if (!candle) return rawPrice;
      const distHigh = Math.abs(candle.high - rawPrice);
      const distLow = Math.abs(candle.low - rawPrice);
      const distClose = Math.abs(candle.close - rawPrice);
      const distOpen = Math.abs(candle.open - rawPrice);
      
      const minDist = Math.min(distHigh, distLow, distClose, distOpen);
      if (minDist === distHigh) return candle.high;
      if (minDist === distLow) return candle.low;
      if (minDist === distClose) return candle.close;
      return candle.open;
  };

  const getTimeFromLogical = (logical: number, chart: IChartApi): number | null => {
    const currentData = dataRef.current;
    if (!currentData || currentData.length === 0) return null;
    const cleanLogical = Math.round(logical);
    const lastIdx = currentData.length - 1;

    // Direct index lookup if within data range
    if (cleanLogical >= 0 && cleanLogical <= lastIdx) {
        return currentData[cleanLogical].time;
    }
    
    // Extrapolate if outside
    const p1 = currentData[lastIdx].time;
    const candleInterval = intervalRef.current || 60;
    const diff = cleanLogical - lastIdx;
    return p1 + (diff * candleInterval);
  };

  // ... (Resize Handlers omitted for brevity but preserved in full file) ...
  const handleResizeStart = (e: React.MouseEvent, type: string) => {
      e.preventDefault(); e.stopPropagation();
      resizingRef.current = { type, startY: e.clientY, startHeight: indicatorHeights[type] || 160 };
      document.body.style.cursor = 'row-resize';
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
  };
  const handleResizeMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = e.clientY - resizingRef.current.startY;
      setIndicatorHeights(prev => ({ ...prev, [resizingRef.current!.type]: Math.max(50, Math.min(600, resizingRef.current!.startHeight - delta)) }));
  };
  const handleResizeEnd = () => {
      resizingRef.current = null; document.body.style.cursor = 'default';
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
  };

  // --- MOUSE HANDLER ---
  const handleMouseMove = (e: React.MouseEvent, pane: string) => {
    const targetDiv = pane === 'MAIN' ? chartContainerRef.current : indicatorContainerRefs.current.get(pane);
    if (!targetDiv) return;

    const rect = targetDiv.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const { chart, series } = getPaneContext(pane);
    
    if (chart && series) {
      setMousePos({ x, y });

      const logical = chart.timeScale().coordinateToLogical(x);
      const rawPrice = series.coordinateToPrice(y);
      
      if (logical !== null && rawPrice !== null) {
          let time = getTimeFromLogical(logical, chart);
          if (time) {
              let finalPrice = getMagnetPrice(time, rawPrice, pane);

              // --- SHIFT KEY SNAP LOGIC (Trendline) ---
              if (e.shiftKey && tempPoint && tempPoint.pane === pane && activeToolRef.current === 'TRENDLINE') {
                  const p1Time = tempPoint.point.time;
                  const p1Price = tempPoint.point.price;
                  
                  const p1X = chart.timeScale().timeToCoordinate(p1Time);
                  const p1Y = series.priceToCoordinate(p1Price);

                  if (p1X !== null && p1Y !== null) {
                      const dx = Math.abs(x - p1X);
                      const dy = Math.abs(y - p1Y);
                      if (dx > dy) finalPrice = p1Price; // Horizontal Snap
                      else time = p1Time; // Vertical Snap
                  }
              }
              // -----------------------------

              setHoverPoint({ point: { time, price: finalPrice }, pane });
          }
      }

      // Main pane trade dragging logic
      if (pane === 'MAIN' && dragTrade) {
          try {
              const price = series.coordinateToPrice(y);
              if (price !== null) {
                  setDragTrade(prev => prev ? { ...prev, currentPrice: price } : null);
                  if (onTradeDrag) {
                      onTradeDrag({ id: dragTrade.id, type: dragTrade.type, price: price });
                  }
              }
          } catch(e) {
              // Ignore drag errors
          }
      }

      // Drawing Dragging Logic
      if (dragTarget && activeDragObject && dragTarget.pane === pane) {
          if (logical !== null && rawPrice !== null) {
              const time = getTimeFromLogical(logical, chart);
              if (time) {
                  const useMagnet = dragTarget.point !== 'all' && dragTarget.point !== 'target' && dragTarget.point !== 'stop' && dragTarget.point !== 'entry';
                  const finalPrice = useMagnet ? getMagnetPrice(time, rawPrice, pane) : rawPrice;
                  
                  const sym = activeSymbolRef.current || '';
                  const isJpy = sym.includes('JPY');
                  const isXau = sym.includes('XAU');
                  const isXag = sym.includes('XAG');
                  const digits = isJpy ? 3 : ((isXau || isXag) ? 2 : 5);
                  const roundPrice = (p: number) => Math.round(p * Math.pow(10, digits)) / Math.pow(10, digits);

                  const newObj = { ...activeDragObject };
                  const timeDiff = time - dragTarget.initialMouse.time;
                  const priceDiff = finalPrice - dragTarget.initialMouse.price;

                  if (dragTarget.point === 'all') {
                      newObj.p1 = { time: dragTarget.initialP1.time + timeDiff, price: roundPrice(dragTarget.initialP1.price + priceDiff) };
                      newObj.p2 = { time: dragTarget.initialP2.time + timeDiff, price: roundPrice(dragTarget.initialP2.price + priceDiff) };
                      if (dragTarget.initialTarget !== undefined && newObj.targetPrice !== undefined) newObj.targetPrice = roundPrice(dragTarget.initialTarget + priceDiff);
                      if (dragTarget.initialStop !== undefined && newObj.stopPrice !== undefined) newObj.stopPrice = roundPrice(dragTarget.initialStop + priceDiff);
                  } else if (dragTarget.point === 'p1') {
                      newObj.p1 = { time: time, price: roundPrice(finalPrice) };
                  } else if (dragTarget.point === 'p2') {
                      newObj.p2 = { time: time, price: roundPrice(finalPrice) };
                  } else if (dragTarget.point === 'target') {
                      newObj.targetPrice = roundPrice(rawPrice); 
                  } else if (dragTarget.point === 'stop') {
                      newObj.stopPrice = roundPrice(rawPrice); 
                  } else if (dragTarget.point === 'entry') {
                      newObj.p1 = { ...newObj.p1, price: roundPrice(rawPrice) };
                      newObj.p2 = { ...newObj.p2, price: roundPrice(rawPrice) }; 
                  }
                  setActiveDragObject(newObj);
              }
          }
      }
    }
  };
  
  const handleMouseUp = () => {
      if (dragTrade) {
          const trade = trades.find(t => t.id === dragTrade.id);
          if (trade) {
              if (dragTrade.type === 'SL' && onModifyTrade) {
                  onModifyTrade(dragTrade.id, dragTrade.currentPrice, trade.takeProfit);
              } else if (dragTrade.type === 'TP' && onModifyTrade) {
                  onModifyTrade(dragTrade.id, trade.stopLoss, dragTrade.currentPrice);
              } else if (dragTrade.type === 'ENTRY' && onModifyOrderEntry) {
                  onModifyOrderEntry(dragTrade.id, dragTrade.currentPrice);
              }
          }
          setDragTrade(null);
          if (onTradeDrag) onTradeDrag(null);
      }
      if (dragTarget && activeDragObject) {
         if (onDrawingUpdate) onDrawingUpdate(activeDragObject);
         setDragTarget(null);
         setActiveDragObject(null);
      }
  };

  const startDrag = (e: React.MouseEvent, d: DrawingObject, pointType: 'all' | 'p1' | 'p2' | 'target' | 'stop' | 'entry') => {
      e.stopPropagation();
      e.preventDefault();
      
      const pane = d.pane || 'MAIN';
      const { chart, series } = getPaneContext(pane);
      const targetDiv = pane === 'MAIN' ? chartContainerRef.current : indicatorContainerRefs.current.get(pane);

      if (!chart || !series || !targetDiv) return;
      
      const rect = targetDiv.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const logical = chart.timeScale().coordinateToLogical(x);
      const price = series.coordinateToPrice(y);
      if (logical === null || price === null) return;
      const time = getTimeFromLogical(logical, chart); 
      if(!time) return;

      let targetId = d.id;
      let objectToDrag = d;

      if ((e.ctrlKey || e.metaKey) && onDrawingCreate) {
           const newId = Math.random().toString(36).substr(2, 9);
           objectToDrag = { ...d, id: newId };
           targetId = newId;
           onDrawingCreate(objectToDrag);
      }

      setDragTarget({
          id: targetId,
          point: pointType,
          initialP1: objectToDrag.p1,
          initialP2: objectToDrag.p2,
          initialMouse: { time, price },
          initialTarget: objectToDrag.targetPrice,
          initialStop: objectToDrag.stopPrice,
          pane: pane 
      });
      setActiveDragObject(objectToDrag);
      if (onDrawingSelect) onDrawingSelect(targetId);
  };

  // ... (handleChartClick and chart setup useEffects preserved) ...
  const handleChartClick = (param: MouseEventParams, pane: string) => {
        if (activeToolRef.current === 'CURSOR') {
             if (onDrawingSelectRef.current) onDrawingSelectRef.current(null);
             return;
        }

        const { chart, series } = getPaneContext(pane);
        if (!chart || !series) return;

        if (param.point) {
            const logical = chart.timeScale().coordinateToLogical(param.point.x);
            let time: number | null = null;
            if (logical !== null) time = getTimeFromLogical(logical, chart);
            if (!time && param.time) time = param.time as number;
            
            if (!time) return;

            const rawPrice = series.coordinateToPrice(param.point.y);
            if (rawPrice === null) return;
            const finalPrice = getMagnetPrice(time, rawPrice, pane);
            const clickedPoint: Point = { time: time, price: finalPrice };

            if (activeToolRef.current === 'TEXT') {
                if (onDrawingCreateRef.current) {
                    onDrawingCreateRef.current({
                        id: Math.random().toString(36).substr(2, 9),
                        symbol: activeSymbolRef.current,
                        type: 'TEXT',
                        p1: clickedPoint,
                        p2: clickedPoint, 
                        visible: true,
                        locked: false,
                        color: '#ffffff',
                        lineWidth: 1,
                        lineStyle: 'solid',
                        text: 'Text',
                        fontSize: 14,
                        pane: pane
                    });
                }
                return;
            }

            const isPositionTool = ['LONG_POSITION', 'SHORT_POSITION'].includes(activeToolRef.current);
            if (isPositionTool && pane !== 'MAIN') return; 

            if (['TRENDLINE', 'FIB', 'LONG_POSITION', 'SHORT_POSITION', 'RECTANGLE'].includes(activeToolRef.current)) {
                const prev = tempPointRef.current;
                if (!prev || prev.pane !== pane) {
                    setTempPoint({ point: clickedPoint, pane });
                    return;
                }
                
                if (onDrawingCreateRef.current) {
                    const isLong = activeToolRef.current === 'LONG_POSITION';
                    const isShort = activeToolRef.current === 'SHORT_POSITION';
                    let targetPrice = undefined, stopPrice = undefined;

                    if (isLong || isShort) {
                        const entryP = prev.point.price;
                        const currentP = clickedPoint.price;
                        const dist = Math.abs(currentP - entryP);
                        const minDiff = entryP * 0.0005;
                        
                        if (dist < minDiff) {
                            const risk = entryP * 0.002;
                            stopPrice = isLong ? entryP - risk : entryP + risk;
                            targetPrice = isLong ? entryP + (risk * 2) : entryP - (risk * 2);
                        } else {
                            if (isLong) {
                                if (currentP > entryP) { targetPrice = currentP; stopPrice = entryP - (dist * 0.5); } 
                                else { stopPrice = currentP; targetPrice = entryP + (dist * 2); }
                            } else { 
                                if (currentP < entryP) { targetPrice = currentP; stopPrice = entryP + (dist * 0.5); } 
                                else { stopPrice = currentP; targetPrice = entryP - (dist * 2); }
                            }
                        }
                    }
                    
                    onDrawingCreateRef.current({
                        id: Math.random().toString(36).substr(2, 9),
                        symbol: activeSymbolRef.current,
                        type: activeToolRef.current,
                        p1: prev.point, p2: clickedPoint, visible: true, locked: false,
                        color: drawingSettingsRef.current.color, lineWidth: drawingSettingsRef.current.lineWidth, lineStyle: drawingSettingsRef.current.lineStyle,
                        targetPrice, stopPrice,
                        pane: pane 
                    });
                }
                setTempPoint(null);
            }
        }
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const customTimeFormatter = (time: number) => {
        const date = new Date(time * 1000);
        return date.toLocaleString('th-TH', { 
            timeZone: 'Asia/Bangkok', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false 
        });
    };
    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#18181b' }, textColor: '#a1a1aa' },
      grid: { vertLines: { color: '#27272a' }, horzLines: { color: '#27272a' } },
      localization: { locale: 'th-TH', dateFormat: 'dd MMM yyyy', timeFormatter: customTimeFormatter },
      timeScale: { 
          borderColor: '#3f3f46', timeVisible: true, secondsVisible: false, rightOffset: 50, barSpacing: 10,
          tickMarkFormatter: (time: number, tickMarkType: TickMarkType, locale: string) => {
              const date = new Date(time * 1000);
              const options: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Bangkok' };
              if (tickMarkType === 0) return date.toLocaleDateString('th-TH', { ...options, year: 'numeric' });
              if (tickMarkType === 1) return date.toLocaleDateString('th-TH', { ...options, month: 'short' });
              if (tickMarkType === 2) {
                  const dayName = date.toLocaleDateString('th-TH', { weekday: 'short', timeZone: 'Asia/Bangkok' });
                  return `${date.getDate()} ${dayName}`;
              }
              return date.toLocaleTimeString('th-TH', { ...options, hour: '2-digit', minute: '2-digit', hour12: false });
          }
      },
      rightPriceScale: { borderColor: '#3f3f46' },
      crosshair: { mode: 0, vertLine: { color: '#71717a', labelBackgroundColor: '#3f3f46' }, horzLine: { color: '#71717a', labelBackgroundColor: '#3f3f46' } },
      width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight
    });
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#089981', downColor: '#F23645', borderVisible: false, wickUpColor: '#089981', wickDownColor: '#F23645',
      priceFormat: { type: 'price', precision: pricePrecision, minMove: 1 / Math.pow(10, pricePrecision) },
    });
    candleSeriesRef.current = candleSeries;
    chartRef.current = chart;
    
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (!range || isSyncingRef.current) return;
        isSyncingRef.current = true;
        indicatorChartRefs.current.forEach((indChart) => {
            indChart.timeScale().setVisibleLogicalRange(range);
        });
        isSyncingRef.current = false;
    });

    if (dataRef.current.length > 0) candleSeries.setData(dataRef.current as any);
    entryLinesRef.current.clear();
    
    const resizeObserver = new ResizeObserver(entries => {
        if (entries.length === 0 || !entries[0].contentRect) return;
        const { width, height } = entries[0].contentRect;
        chart.applyOptions({ width, height });
    });
    resizeObserver.observe(chartContainerRef.current);
    chart.subscribeClick((p) => handleChartClick(p, 'MAIN'));
    return () => { resizeObserver.disconnect(); chart.remove(); chartRef.current = null; };
  }, []);

  useEffect(() => {
     if (candleSeriesRef.current) {
         candleSeriesRef.current.applyOptions({
             priceFormat: { type: 'price', precision: pricePrecision, minMove: 1 / Math.pow(10, pricePrecision) }
         });
     }
  }, [pricePrecision]);

  useEffect(() => {
     if (candleSeriesRef.current) candleSeriesRef.current.setData(data as any);
  }, [data]);

  useEffect(() => {
      if (!chartRef.current || !emaDataMap) return;
      const activeEmaConfigs = indicatorConfigs.filter(c => c.type === 'EMA');
      const activeIds = new Set(activeEmaConfigs.map(c => c.id));
      emaSeriesRefs.current.forEach((series, id) => {
          if (!activeIds.has(id)) { chartRef.current!.removeSeries(series); emaSeriesRefs.current.delete(id); }
      });
      activeEmaConfigs.forEach(config => {
          if (!config.visible) {
              const existing = emaSeriesRefs.current.get(config.id);
              if (existing) { chartRef.current!.removeSeries(existing); emaSeriesRefs.current.delete(config.id); }
              return;
          }
          let series = emaSeriesRefs.current.get(config.id);
          const seriesOptions = { 
              color: config.color || '#2962ff', lineWidth: 2, title: '',
              priceFormat: { type: 'price', precision: pricePrecision, minMove: 1 / Math.pow(10, pricePrecision) },
              priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false
          };
          if (!series) {
              series = chartRef.current!.addLineSeries(seriesOptions);
              emaSeriesRefs.current.set(config.id, series);
          } else { series.applyOptions(seriesOptions); }
          const data = emaDataMap.get(config.id);
          if (data && data.length > 0) series.setData(data as any);
      });
  }, [data, emaDataMap, indicatorConfigs, pricePrecision]);

  useEffect(() => {
    if (!candleSeriesRef.current || !chartRef.current) return;
    entryLinesRef.current.forEach((line, id) => {
        const trade = trades.find(t => t.id === id);
        if (!trade || trade.status === OrderStatus.CLOSED || trade.status === OrderStatus.PENDING) {
             try { 
                 candleSeriesRef.current?.removePriceLine(line); 
             } catch(e) {
                 // Ignore removal errors
             }
             entryLinesRef.current.delete(id);
        }
    });
    trades.forEach(t => {
        if (t.status === OrderStatus.CLOSED || t.status === OrderStatus.PENDING) return;
        if (!entryLinesRef.current.has(t.id)) {
            try {
                const line = candleSeriesRef.current!.createPriceLine({ 
                    price: t.entryPrice, color: '#787b86', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `ENTRY`
                });
                entryLinesRef.current.set(t.id, line);
            } catch(e) {
                // Ignore series removal errors
            }
        } 
    });
  }, [trades, data, pricePrecision]); 

  const activeIndicators = indicatorConfigs.filter(c => c.visible && c.type !== 'EMA'); 

  useEffect(() => {
     const activeTypes = new Set(activeIndicators.map(c => c.type));
     indicatorChartRefs.current.forEach((chart, type) => {
         if (!activeTypes.has(type as any)) {
             chart.remove();
             indicatorChartRefs.current.delete(type);
             if (type === 'MACD') { macdSeriesRef.current = null; macdSignalSeriesRef.current = null; macdHistogramSeriesRef.current = null; }
             if (type === 'RSI') { rsiSeriesRef.current = null; rsiUpperLineRef.current = null; rsiLowerLineRef.current = null; }
         }
     });
     activeIndicators.forEach(config => {
         const type = config.type;
         const container = indicatorContainerRefs.current.get(type);
         if (!container) return;
         let chart = indicatorChartRefs.current.get(type);
         if (!chart) {
             const customTimeFormatter = (time: number) => {
                const date = new Date(time * 1000);
                return date.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
             };
             chart = createChart(container, {
                layout: { background: { type: ColorType.Solid, color: '#18181b' }, textColor: '#a1a1aa' },
                grid: { vertLines: { color: '#27272a' }, horzLines: { color: '#27272a' } },
                localization: { locale: 'th-TH', dateFormat: 'dd MMM yyyy', timeFormatter: customTimeFormatter },
                timeScale: { 
                    borderColor: '#3f3f46', timeVisible: true, visible: true, secondsVisible: false, rightOffset: 50, barSpacing: 10,
                    tickMarkFormatter: (time: number, tickMarkType: TickMarkType, locale: string) => {
                        const date = new Date(time * 1000);
                        const options: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Bangkok' };
                        if (tickMarkType === 0) return date.toLocaleDateString('th-TH', { ...options, year: 'numeric' });
                        if (tickMarkType === 1) return date.toLocaleDateString('th-TH', { ...options, month: 'short' });
                        if (tickMarkType === 2) {
                            const dayName = date.toLocaleDateString('th-TH', { weekday: 'short', timeZone: 'Asia/Bangkok' });
                            return `${date.getDate()} ${dayName}`;
                        }
                        return date.toLocaleTimeString('th-TH', { ...options, hour: '2-digit', minute: '2-digit', hour12: false });
                    }
                },
                rightPriceScale: { borderColor: '#3f3f46', autoScale: true },
                crosshair: { mode: 0 },
                width: container.clientWidth, height: container.clientHeight
             });
             indicatorChartRefs.current.set(type, chart);
             
             chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
                 if (!range || isSyncingRef.current) return;
                 isSyncingRef.current = true;
                 if (chartRef.current) {
                     chartRef.current.timeScale().setVisibleLogicalRange(range);
                 }
                 indicatorChartRefs.current.forEach((otherChart, otherType) => {
                     if (otherType !== type) {
                         otherChart.timeScale().setVisibleLogicalRange(range);
                     }
                 });
                 isSyncingRef.current = false;
             });

             const main = chartRef.current;
             if (main) {
                 const range = main.timeScale().getVisibleLogicalRange();
                 if (range) chart.timeScale().setVisibleLogicalRange(range);
             }
             chart.subscribeClick((p) => handleChartClick(p, type));
             chart.subscribeCrosshairMove((param) => {
                 if (!param.time) { setIndicatorValues(prev => ({ ...prev, [type]: null })); return; }
                 const values: any = {};
                 param.seriesData.forEach((val: any, series) => {
                     const v = (typeof val === 'object' && val !== null && 'value' in val) ? val.value : val;
                     if (type === 'RSI' && series === rsiSeriesRef.current) values.rsi = v;
                     if (type === 'MACD') {
                         if (series === macdSeriesRef.current) values.macd = v;
                         if (series === macdSignalSeriesRef.current) values.signal = v;
                         if (series === macdHistogramSeriesRef.current) values.hist = v;
                     }
                 });
                 setIndicatorValues(prev => ({ ...prev, [type]: values }));
             });
         }
     });
  }, [indicatorConfigs]);

  useEffect(() => {
      activeIndicators.forEach(config => {
          const chart = indicatorChartRefs.current.get(config.type);
          if (!chart) return;
          if (config.type === 'RSI' && rsiData) {
              if (!rsiSeriesRef.current) {
                  rsiSeriesRef.current = chart.addLineSeries({ 
                      color: config.color || '#7e57c2', lineWidth: 1, title: 'RSI', priceLineVisible: false, lastValueVisible: true,
                  });
                  rsiSeriesRef.current.applyOptions({
                      autoscaleInfoProvider: (original) => {
                          const res = original();
                          if (res !== null) { return { priceRange: { minValue: Math.min(res.priceRange.minValue, 20), maxValue: Math.max(res.priceRange.maxValue, 80) } }; }
                          return null;
                      },
                  });
              }
              rsiSeriesRef.current.applyOptions({ color: config.color || '#7e57c2' });
              rsiSeriesRef.current.setData(rsiData as any);
          }
          if (config.type === 'MACD' && macdData) {
              if (!macdHistogramSeriesRef.current) {
                  macdHistogramSeriesRef.current = chart.addHistogramSeries({ 
                      priceFormat: { type: 'price', precision: 5, minMove: 0.00001 }, 
                      priceLineVisible: false, lastValueVisible: true 
                  });
              }
              const coloredHist = macdData.histogram.map(h => ({ time: h.time, value: h.value, color: h.value >= 0 ? '#26a69a' : '#ef5350' }));
              macdHistogramSeriesRef.current.setData(coloredHist as any);
              if (!macdSeriesRef.current) {
                  macdSeriesRef.current = chart.addLineSeries({ 
                      color: config.color || '#2962ff', lineWidth: 1, title: 'MACD', priceLineVisible: false, lastValueVisible: true,
                      priceFormat: { type: 'price', precision: 5, minMove: 0.00001 }
                  });
              }
              macdSeriesRef.current.applyOptions({ color: config.color || '#2962ff' });
              macdSeriesRef.current.setData(macdData.macd as any);
              if (!macdSignalSeriesRef.current) {
                  macdSignalSeriesRef.current = chart.addLineSeries({ 
                      color: config.signalColor || '#f57c00', lineWidth: 1, title: 'Signal', priceLineVisible: false, lastValueVisible: true,
                      priceFormat: { type: 'price', precision: 5, minMove: 0.00001 }
                  });
              }
              macdSignalSeriesRef.current.applyOptions({ color: config.signalColor || '#f57c00' });
              macdSignalSeriesRef.current.setData(macdData.signal as any);
          }
      });
  }, [indicatorConfigs, rsiData, macdData]);

  useEffect(() => {
      const rsiConfig = indicatorConfigs.find(c => c.type === 'RSI');
      if (rsiConfig && rsiSeriesRef.current) {
          if (rsiUpperLineRef.current) { rsiSeriesRef.current.removePriceLine(rsiUpperLineRef.current); rsiUpperLineRef.current = null; }
          if (rsiLowerLineRef.current) { rsiSeriesRef.current.removePriceLine(rsiLowerLineRef.current); rsiLowerLineRef.current = null; }
          rsiUpperLineRef.current = rsiSeriesRef.current.createPriceLine({ price: rsiConfig.upperLevel || 70, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
          rsiLowerLineRef.current = rsiSeriesRef.current.createPriceLine({ price: rsiConfig.lowerLevel || 30, color: '#22c55e', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
      }
  }, [indicatorConfigs]); 

  useEffect(() => {
      const ro = new ResizeObserver(entries => {
          if (entries.length === 0) return;
          if (entries[0].target === chartContainerRef.current) {
              chartRef.current?.applyOptions({ width: entries[0].contentRect.width, height: entries[0].contentRect.height });
          }
          indicatorContainerRefs.current.forEach((div, type) => {
              const chart = indicatorChartRefs.current.get(type);
              if (chart && div) {
                  chart.applyOptions({ width: div.clientWidth, height: div.clientHeight });
              }
          });
      });
      if (chartContainerRef.current) ro.observe(chartContainerRef.current);
      return () => ro.disconnect();
  }, [indicatorConfigs, indicatorHeights]);

  const updateDrawings = () => {
      const panePaths: Record<string, React.ReactNode[]> = { MAIN: [], RSI: [], MACD: [] };
      const width = chartContainerRef.current?.clientWidth || 0;

      if (chartRef.current && candleSeriesRef.current && chartContainerRef.current) {
          const mainPaths = panePaths.MAIN;
          const safePriceCoord = (price: number) => { 
              try { 
                  const coord = candleSeriesRef.current!.priceToCoordinate(price); 
                  return coord === null ? -10000 : coord; 
              } catch(e) { 
                  return -10000; 
              }
          };

          // ... (Trade lines rendering logic preserved) ...
          trades.forEach(t => {
              if (t.status === OrderStatus.CLOSED) return;
              const isDraggingThis = dragTrade && dragTrade.id === t.id;
              const labelWidth = 100;
              const xOffset = width - labelWidth - 5;
              if (t.status === OrderStatus.PENDING) {
                  const price = (isDraggingThis && dragTrade.type === 'ENTRY') ? dragTrade.currentPrice : t.entryPrice;
                  const y = safePriceCoord(price);
                  if (y > 0 && y < chartContainerRef.current!.clientHeight) {
                      const color = '#f59e0b';
                      const label = t.type === 'LIMIT' ? 'LIMIT' : 'STOP';
                      mainPaths.push(
                          <g key={`entry-${t.id}`} className="cursor-ns-resize group" style={{pointerEvents: 'auto'}}>
                              <line x1={0} y1={y} x2={width} y2={y} stroke="transparent" strokeWidth={20} style={{pointerEvents: 'stroke', cursor: 'ns-resize'}} onMouseDown={(e) => { e.stopPropagation(); setDragTrade({ id: t.id, type: 'ENTRY', startPrice: t.entryPrice, currentPrice: t.entryPrice }); }} onDoubleClick={(e) => { e.stopPropagation(); const newPrice = window.prompt("Enter new price:", t.entryPrice.toString()); if (newPrice && !isNaN(parseFloat(newPrice)) && onModifyOrderEntry) onModifyOrderEntry(t.id, parseFloat(newPrice)); }} />
                              <line x1={0} y1={y} x2={width} y2={y} stroke={color} strokeDasharray="4 2" strokeWidth={1} style={{pointerEvents: 'none'}} />
                              <text x={10} y={y - 4} fill={color} fontSize="12" fontWeight="bold" style={{pointerEvents: 'none'}}>#{t.id.substr(0,4)}</text>
                              <g transform={`translate(${xOffset}, ${y - 10})`} style={{pointerEvents: 'none'}}><rect width={labelWidth} height={20} rx={2} fill={color} /><text x={labelWidth/2} y={14} textAnchor="middle" fill="black" fontSize="12" fontWeight="bold">{label} {price.toFixed(pricePrecision)}</text></g>
                          </g>
                      );
                  }
              }
              if (t.status === OrderStatus.OPEN) {
                   const entryY = safePriceCoord(t.entryPrice);
                   if (entryY > 0 && entryY < chartContainerRef.current!.clientHeight) {
                       mainPaths.push(<text key={`entry-lbl-${t.id}`} x={10} y={entryY - 4} fill="#a1a1aa" fontSize="12" fontWeight="bold" style={{pointerEvents: 'none'}}>#{t.id.substr(0,4)}</text>);
                       if (t.stopLoss === 0 && (!isDraggingThis || dragTrade.type !== 'SL')) {
                            mainPaths.push(<g key={`sl-add-${t.id}`} className="cursor-pointer select-none" style={{pointerEvents: 'auto'}} transform={`translate(${width - 115}, ${entryY - 10})`} onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDragTrade({ id: t.id, type: 'SL', startPrice: t.entryPrice, currentPrice: t.entryPrice }); }}><rect width="28" height="18" rx="4" fill="#18181b" stroke="#F23645" strokeWidth={1} /><text x="14" y="12" textAnchor="middle" fill="#F23645" fontSize="11" fontWeight="bold">SL+</text></g>);
                       }
                       if (t.takeProfit === 0 && (!isDraggingThis || dragTrade.type !== 'TP')) {
                            mainPaths.push(<g key={`tp-add-${t.id}`} className="cursor-pointer select-none" style={{pointerEvents: 'auto'}} transform={`translate(${width - 83}, ${entryY - 10})`} onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDragTrade({ id: t.id, type: 'TP', startPrice: t.entryPrice, currentPrice: t.entryPrice }); }}><rect width="28" height="18" rx="4" fill="#18181b" stroke="#089981" strokeWidth={1} /><text x="14" y="12" textAnchor="middle" fill="#089981" fontSize="11" fontWeight="bold">TP+</text></g>);
                       }
                   }
              }
              if (t.stopLoss > 0 || (isDraggingThis && dragTrade.type === 'SL')) {
                  const price = (isDraggingThis && dragTrade.type === 'SL') ? dragTrade.currentPrice : t.stopLoss;
                  const y = safePriceCoord(price);
                  if (y > 0 && y < chartContainerRef.current!.clientHeight) {
                      mainPaths.push(
                        <g key={`sl-${t.id}`} className="cursor-ns-resize group" style={{pointerEvents: 'auto'}}>
                            <line x1={0} y1={y} x2={width} y2={y} stroke="transparent" strokeWidth={20} style={{pointerEvents: 'stroke', cursor: 'ns-resize'}} onMouseDown={(e) => { e.stopPropagation(); setDragTrade({ id: t.id, type: 'SL', startPrice: t.stopLoss, currentPrice: t.stopLoss }); }} />
                            <line x1={0} y1={y} x2={width} y2={y} stroke="#F23645" strokeDasharray="4 4" strokeWidth={1} style={{pointerEvents: 'none'}} />
                            <text x={10} y={y - 4} fill="#F23645" fontSize="12" fontWeight="bold" style={{pointerEvents: 'none'}}>SL #{t.id.substr(0,4)}</text>
                            <g transform={`translate(${xOffset}, ${y - 10})`} style={{pointerEvents: 'none'}}><rect width={labelWidth} height={20} rx={4} fill="#F23645" /><text x={labelWidth/2} y={14} textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">SL {price.toFixed(pricePrecision)}</text></g>
                        </g>
                      );
                  }
              }
              if (t.takeProfit > 0 || (isDraggingThis && dragTrade.type === 'TP')) {
                  const price = (isDraggingThis && dragTrade.type === 'TP') ? dragTrade.currentPrice : t.takeProfit;
                  const y = safePriceCoord(price);
                  if (y > 0 && y < chartContainerRef.current!.clientHeight) {
                      mainPaths.push(
                        <g key={`tp-${t.id}`} className="cursor-ns-resize group" style={{pointerEvents: 'auto'}}>
                            <line x1={0} y1={y} x2={width} y2={y} stroke="transparent" strokeWidth={20} style={{pointerEvents: 'stroke', cursor: 'ns-resize'}} onMouseDown={(e) => { e.stopPropagation(); setDragTrade({ id: t.id, type: 'TP', startPrice: t.takeProfit, currentPrice: t.takeProfit }); }} />
                            <line x1={0} y1={y} x2={width} y2={y} stroke="#089981" strokeDasharray="4 4" strokeWidth={1} style={{pointerEvents: 'none'}} />
                            <text x={10} y={y - 4} fill="#089981" fontSize="12" fontWeight="bold" style={{pointerEvents: 'none'}}>TP #{t.id.substr(0,4)}</text>
                            <g transform={`translate(${xOffset}, ${y - 10})`} style={{pointerEvents: 'none'}}><rect width={labelWidth} height={20} rx={4} fill="#089981" /><text x={labelWidth/2} y={14} textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">TP {price.toFixed(pricePrecision)}</text></g>
                        </g>
                      );
                  }
              }
          });
      }

      let renderList = [...drawings];
      if (activeDragObject) {
         const idx = renderList.findIndex(d => d.id === activeDragObject.id);
         if (idx >= 0) renderList[idx] = activeDragObject; 
         else renderList.push(activeDragObject);
      }
      
      if (tempPoint && hoverPoint && activeToolRef.current !== 'CURSOR' && activeToolRef.current !== 'KILLZONE' && activeToolRef.current !== 'TEXT') {
          // ... (Ghost rendering preserved) ...
          if (tempPoint.pane === hoverPoint.pane) {
              const ghostId = 'ghost-preview';
              const ghostDrawing: DrawingObject = {
                  id: ghostId, symbol: activeSymbolRef.current, type: activeToolRef.current,
                  p1: tempPoint.point, p2: hoverPoint.point, visible: true, locked: false,
                  color: drawingSettingsRef.current.color, lineWidth: drawingSettingsRef.current.lineWidth, lineStyle: drawingSettingsRef.current.lineStyle,
                  pane: tempPoint.pane
              };
              if (activeToolRef.current === 'RECTANGLE') ghostDrawing.text = 'Kill Zone';
              if (activeToolRef.current === 'LONG_POSITION' || activeToolRef.current === 'SHORT_POSITION') {
                    const isLong = activeToolRef.current === 'LONG_POSITION';
                    const entryP = tempPoint.point.price;
                    const currentP = hoverPoint.point.price;
                    const dist = Math.abs(currentP - entryP);
                    const minDiff = entryP * 0.0005;
                    let targetPrice, stopPrice;
                    if (dist < minDiff) {
                        const risk = entryP * 0.002;
                        stopPrice = isLong ? entryP - risk : entryP + risk;
                        targetPrice = isLong ? entryP + (risk * 2) : entryP - (risk * 2);
                    } else {
                        if (isLong) {
                            if (currentP > entryP) { targetPrice = currentP; stopPrice = entryP - (dist * 0.5); } 
                            else { stopPrice = currentP; targetPrice = entryP + (dist * 2); }
                        } else { 
                            if (currentP < entryP) { targetPrice = currentP; stopPrice = entryP + (dist * 0.5); } 
                            else { stopPrice = currentP; targetPrice = entryP - (dist * 2); }
                        }
                    }
                    ghostDrawing.targetPrice = targetPrice;
                    ghostDrawing.stopPrice = stopPrice;
              }
              renderList = [...renderList, ghostDrawing];
          }
      }

      renderList.forEach(d => {
          if (!d.visible) return;
          const pane = d.pane || 'MAIN';
          const paths = panePaths[pane];
          if (!paths) return;

          const { chart, series } = getPaneContext(pane);
          if (!chart || !series) return;

          const timeScale = chart.timeScale();

          // FIXED: Improved getCoord to handle interpolation for missing timestamps (H2 even hours)
          const getCoord = (time: number): number | null => {
             const ts = timeScale;
             if (!ts) return null;
             
             // 1. Try direct lookup
             const c = ts.timeToCoordinate(time as any);
             if (c !== null && c !== undefined) return c;

             const currentData = dataRef.current;
             if (!currentData || currentData.length === 0) return null;

             // 2. Binary search for nearest index
             let low = 0, high = currentData.length - 1, leftIdx = -1;
             while (low <= high) {
                 const mid = (low + high) >>> 1;
                 if (currentData[mid].time === time) { leftIdx = mid; break; } 
                 else if (currentData[mid].time < time) { leftIdx = mid; low = mid + 1; } 
                 else { high = mid - 1; }
             }

             // If exact match found by index search
             if (leftIdx !== -1 && currentData[leftIdx].time === time) return ts.logicalToCoordinate(leftIdx);

             const candleInterval = intervalRef.current || 60;
             
             // 3. Project if outside data range
             if (leftIdx === -1) {
                 // Before first candle
                 const first = currentData[0];
                 const logicalOffset = (time - first.time) / candleInterval;
                 return ts.logicalToCoordinate(logicalOffset);
             }
             if (leftIdx === currentData.length - 1) {
                 // After last candle
                 const last = currentData[leftIdx];
                 const logicalOffset = (time - last.time) / candleInterval;
                 return ts.logicalToCoordinate(leftIdx + logicalOffset);
             }

             // 4. Interpolate if between candles
             const leftCandle = currentData[leftIdx];
             const rightCandle = currentData[leftIdx + 1];
             const range = rightCandle.time - leftCandle.time;
             const diff = time - leftCandle.time;
             
             // Use interval for projection if gap is huge, otherwise proportional
             const ratio = (range > candleInterval * 1.5) 
                ? diff / candleInterval  // Treat gap as series of empty candles
                : diff / range;          // Interpolate standard gap
                
             return ts.logicalToCoordinate(leftIdx + ratio);
          }

          const safePriceCoord = (price: number) => { 
              if (price === null || isNaN(price)) return -10000;
              try { 
                  const coord = series.priceToCoordinate(price); 
                  return coord === null ? -10000 : coord; 
              } catch(e) { 
                  return -10000; 
              }
          };

          const x1Val = getCoord(d.p1.time);
          const x2Val = getCoord(d.p2.time);
          const x1 = x1Val ?? -10000;
          const x2 = x2Val ?? -10000;
          const y1 = safePriceCoord(d.p1.price);
          const y2 = safePriceCoord(d.p2.price);
          
          const handleDblClick = (e: React.MouseEvent) => { e.stopPropagation(); if (onDrawingEdit && d.id !== 'ghost-preview') onDrawingEdit(d); };
          const pointerEventsStyle = d.id === 'ghost-preview' ? 'none' : 'auto';
          const isSelected = d.id === selectedDrawingId;

          if (d.type === 'TEXT') {
              // ... (Text rendering preserved) ...
              if (y1 > -5000 && x1Val !== null) {
                  const lines = d.text ? d.text.split('\n') : ["Text"];
                  const fontSize = d.fontSize || 14;
                  const lineHeight = fontSize * 1.2;
                  paths.push(
                      <g key={d.id} onDoubleClick={handleDblClick} style={{pointerEvents: pointerEventsStyle}}>
                          <text x={x1} y={y1} fill={d.color} fontSize={fontSize} fontWeight="bold" className="cursor-move select-none" onMouseDown={(e) => startDrag(e, d, 'p1')} style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.8)', whiteSpace: 'pre' }}>
                              {lines.map((line, i) => (<tspan key={i} x={x1} dy={i === 0 ? 0 : lineHeight}>{line}</tspan>))}
                          </text>
                          {isSelected && (<rect x={x1 - 2} y={y1 - fontSize} width={20} height={20} fill="transparent" stroke="blue" strokeWidth={1} strokeDasharray="2 2" style={{pointerEvents: 'none'}} />)}
                      </g>
                  );
              }
          } else if (d.type === 'KILLZONE' && d.killZoneConfig && pane === 'MAIN') {
               if (intervalRef.current >= 14400) return;
              const logicalRange = timeScale.getVisibleLogicalRange();
              if (!logicalRange) return;
              const startIdx = Math.max(0, Math.floor(logicalRange.from));
              const endIdx = Math.min(dataRef.current.length - 1, Math.ceil(logicalRange.to));
              const uniqueDates = new Set<string>();
              
              const getBangkokDateStr = (ts: number) => {
                  const date = new Date((ts + BANGKOK_OFFSET) * 1000);
                  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
              }

              for (let i = startIdx; i <= endIdx; i++) {
                  const c = dataRef.current[i];
                  if (c) uniqueDates.add(getBangkokDateStr(c.time));
              }
              
              uniqueDates.forEach(dateStr => {
                  const sessions = [
                      { key: 'asian', ...d.killZoneConfig!.asian },
                      { key: 'london', ...d.killZoneConfig!.london },
                      { key: 'ny', ...d.killZoneConfig!.ny },
                  ] as const;
                  const boxOpacity = d.killZoneConfig!.opacity !== undefined ? d.killZoneConfig!.opacity : 0.15;
                  const tfSeconds = intervalRef.current || 60;

                  sessions.forEach(sess => {
                      if (!sess.enabled) return;
                      let startTs = getSessionTimestamp(dateStr, sess.start);
                      let endTs = getSessionTimestamp(dateStr, sess.end);
                      if (endTs <= startTs) endTs += 86400; 
                      
                      // FIXED: Use >= and < to handle boundary conditions properly
                      const relevantData = dataRef.current.filter(c => (c.time + tfSeconds) > startTs && c.time < endTs);
                      let maxH = -Infinity;
                      let minL = Infinity;
                      
                      if (relevantData.length > 0) {
                          relevantData.forEach(c => {
                              if (c.high > maxH) maxH = c.high;
                              if (c.low < minL) minL = c.low;
                          });
                          // Snap logic maintained for High TFs (H1 and above)
                          if (tfSeconds >= 3600) {
                              startTs = relevantData[0].time;
                              // Also snap endTs to the end of the last overlapping candle
                              endTs = relevantData[relevantData.length - 1].time + tfSeconds;
                          }
                      } else { return; }
                      
                      const sxVal = getCoord(startTs);
                      const exVal = getCoord(endTs);
                      if (sxVal === null || exVal === null) return;
                      const sx = sxVal;
                      const ex = exVal;
                      const sy = safePriceCoord(maxH);
                      const ey = safePriceCoord(minL);
                      
                      if (sy > -5000 && ey > -5000) {
                          const boxWidth = Math.max(1, ex - sx);
                          const boxHeight = Math.abs(ey - sy);
                          paths.push(
                              <g key={`${d.id}-${dateStr}-${sess.key}`} onDoubleClick={handleDblClick}>
                                  <rect x={sx} y={sy} width={boxWidth} height={boxHeight} fill={sess.color} fillOpacity={boxOpacity} stroke="none" style={{pointerEvents: 'none'}} />
                                  {d.killZoneConfig!.showLabel && <text x={sx} y={sy - 5} fill={sess.color} fontSize={12} fontWeight="bold" style={{pointerEvents: 'auto', cursor: 'pointer'}}>{sess.label}</text>}
                                  {d.killZoneConfig!.showHighLowLines && (<><line x1={sx} y1={sy} x2={ex} y2={sy} stroke={sess.color} strokeWidth={1} style={{pointerEvents: 'none'}} /><line x1={sx} y1={ey} x2={ex} y2={ey} stroke={sess.color} strokeWidth={1} style={{pointerEvents: 'none'}} /></>)}
                                  {d.killZoneConfig!.extend && (<><line x1={ex} y1={sy} x2={width} y2={sy} stroke={sess.color} strokeWidth={1} strokeDasharray="4 2" opacity={0.7} style={{pointerEvents: 'none'}} /><line x1={ex} y1={ey} x2={width} y2={ey} stroke={sess.color} strokeWidth={1} strokeDasharray="4 2" opacity={0.7} style={{pointerEvents: 'none'}} /></>)}
                                  {d.killZoneConfig!.showAverage && (<line x1={sx} y1={(sy+ey)/2} x2={d.killZoneConfig!.extend ? width : ex} y2={(sy+ey)/2} stroke={sess.color} strokeWidth={1} strokeDasharray="2 2" opacity={0.7} style={{pointerEvents: 'none'}} />)}
                              </g>
                          );
                      }
                  });
              });
          } else if (d.type === 'TRENDLINE') {
              // ... (Trendline rendering preserved) ...
              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2;
              let rotation = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
              if (rotation > 90 || rotation < -90) rotation += 180;

              paths.push(
                  <g key={d.id} onDoubleClick={handleDblClick} style={{pointerEvents: pointerEventsStyle}}>
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={20} className="cursor-move" onMouseDown={(e) => startDrag(e, d, 'all')} />
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={d.color} strokeWidth={d.lineWidth} strokeDasharray={d.lineStyle === 'dashed' ? '8 4' : d.lineStyle === 'dotted' ? '2 2' : ''} style={{pointerEvents: 'none'}} />
                      {d.text && (
                          <text x={midX} y={midY} dy={-6} textAnchor="middle" fill={d.color} fontSize={d.fontSize || 12} fontWeight="bold" transform={`rotate(${rotation}, ${midX}, ${midY})`} style={{textShadow: '0px 1px 2px rgba(0,0,0,0.8)', pointerEvents: 'none'}}>
                              {d.text}
                          </text>
                      )}
                      {isSelected && (<><circle cx={x1} cy={y1} r={5} fill="white" stroke={d.color} strokeWidth={1} className="cursor-pointer" onMouseDown={(e) => startDrag(e, d, 'p1')} /><circle cx={x2} cy={y2} r={5} fill="white" stroke={d.color} strokeWidth={1} className="cursor-pointer" onMouseDown={(e) => startDrag(e, d, 'p2')} /></>)}
                  </g>
              );
          } else if (d.type === 'RECTANGLE') {
              // ... (Rectangle rendering preserved) ...
              const xStart = Math.min(x1, x2);
              const yStart = Math.min(y1, y2);
              const width = Math.abs(x2 - x1);
              const height = Math.abs(y2 - y1);
              if (y1 > -5000 && y2 > -5000) {
                  paths.push(<g key={d.id} onDoubleClick={handleDblClick} style={{pointerEvents: pointerEventsStyle}}><rect x={xStart} y={yStart} width={width} height={height} fill={d.color} fillOpacity={0.2} stroke={d.color} strokeWidth={d.lineWidth} strokeDasharray={d.lineStyle === 'dashed' ? '4 2' : d.lineStyle === 'dotted' ? '2 2' : ''} className="cursor-move" onMouseDown={(e) => startDrag(e, d, 'all')} />{d.text && (<text x={xStart + 5} y={yStart - 5} fill={d.color} fontSize={11} fontWeight="bold" style={{textShadow: '0px 1px 2px black'}}>{d.text}</text>)}{isSelected && d.id !== 'ghost-preview' && (<><circle cx={x1} cy={y1} r={5} fill="white" stroke={d.color} strokeWidth={1} className="cursor-pointer" onMouseDown={(e) => startDrag(e, d, 'p1')} /><circle cx={x2} cy={y2} r={5} fill="white" stroke={d.color} strokeWidth={1} className="cursor-pointer" onMouseDown={(e) => startDrag(e, d, 'p2')} /></>)}</g>);
              }
          } else if (d.type === 'FIB') {
              // ... (Fib rendering preserved) ...
              if (y1 > -5000 && y2 > -5000) {
                  paths.push(<line key={`${d.id}-hit`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={15} style={{pointerEvents: pointerEventsStyle, cursor: 'move'}} onMouseDown={(e) => d.id !== 'ghost-preview' && startDrag(e, d, 'all')} onDoubleClick={handleDblClick} />);
                  paths.push(<line key={`${d.id}-main`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={d.color} strokeWidth={1} strokeDasharray="4 4" opacity={0.5} style={{pointerEvents: 'none'}} />);
                  if (isSelected && d.id !== 'ghost-preview') {
                      paths.push(<circle key={`${d.id}-p1`} cx={x1} cy={y1} r={5} fill="white" stroke={d.color} strokeWidth={1} className="cursor-pointer" onMouseDown={(e) => startDrag(e, d, 'p1')} style={{pointerEvents: 'auto'}} />);
                      paths.push(<circle key={`${d.id}-p2`} cx={x2} cy={y2} r={5} fill="white" stroke={d.color} strokeWidth={1} className="cursor-pointer" onMouseDown={(e) => startDrag(e, d, 'p2')} style={{pointerEvents: 'auto'}} />);
                  }
                  const range = d.p1.price - d.p2.price;
                  d.fibLevels?.forEach(fib => {
                      if (!fib.visible) return;
                      const levelPrice = d.p2.price + (range * fib.level);
                      const ly = safePriceCoord(levelPrice);
                      if (ly > -5000) {
                          paths.push(<g key={`${d.id}-${fib.level}`} onDoubleClick={handleDblClick} style={{pointerEvents: pointerEventsStyle}}><line x1={Math.min(x1, x2)} y1={ly} x2={Math.max(x1, x2)} y2={ly} stroke={fib.color} strokeWidth={1} strokeDasharray="4 4" opacity={0.8} /><text x={Math.max(x1,x2) + 5} y={ly + 3} fill={fib.color} fontSize={12} textAnchor="start">{fib.level} ({levelPrice.toFixed(pricePrecision)})</text></g>);
                      }
                  });
              }
          } else if (d.type === 'LONG_POSITION' || d.type === 'SHORT_POSITION') {
              // ... (Position tool rendering preserved) ...
              if (pane === 'MAIN' && d.targetPrice && d.stopPrice && y1 > -5000 && x1 > -5000 && x2 > -5000) {
                  const targetY = safePriceCoord(d.targetPrice);
                  const stopY = safePriceCoord(d.stopPrice);
                  const isLong = d.type === 'LONG_POSITION';
                  const riskColor = '#ef4444';
                  const rewardColor = '#22c55e';
                  const boxX = Math.min(x1, x2);
                  const boxW = Math.abs(x2 - x1);
                  if (stopY > -5000 && targetY > -5000) {
                      paths.push(<g key={`${d.id}-group`} style={{pointerEvents: pointerEventsStyle}}>
                          <rect x={boxX} y={isLong ? y1 : stopY} width={boxW} height={Math.abs(stopY - y1)} fill={riskColor} fillOpacity={0.15} stroke="none" />
                          <rect x={boxX} y={isLong ? targetY : y1} width={boxW} height={Math.abs(targetY - y1)} fill={rewardColor} fillOpacity={0.15} stroke="none" />
                          <line x1={boxX} y1={y1} x2={boxX+boxW} y2={y1} stroke="#71717a" strokeWidth={1} />
                      </g>);
                      if (d.id === 'ghost-preview' && y2 > -5000 && x1 > -5000 && x2 > -5000) {
                          paths.push(<line key={`${d.id}-connect`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={d.color} strokeWidth={1} strokeDasharray="4 4" opacity={0.8} style={{pointerEvents: 'none'}} />);
                      }
                      if (d.id !== 'ghost-preview') {
                          const totalTop = Math.min(targetY, stopY);
                          const totalH = Math.abs(targetY - stopY);
                          paths.push(<rect key={`${d.id}-move`} x={boxX} y={totalTop} width={boxW} height={totalH} fill="transparent" cursor="move" onMouseDown={(e) => startDrag(e, d, 'all')} onDoubleClick={handleDblClick} style={{pointerEvents: 'auto'}} />);
                          paths.push(<line key={`${d.id}-resize-w1`} x1={boxX} y1={totalTop} x2={boxX} y2={totalTop+totalH} stroke="transparent" strokeWidth={10} cursor="ew-resize" onMouseDown={(e) => startDrag(e, d, x1 < x2 ? 'p1' : 'p2')} style={{pointerEvents: 'auto'}} />);
                          paths.push(<line key={`${d.id}-resize-w2`} x1={boxX+boxW} y1={totalTop} x2={boxX+boxW} y2={totalTop+totalH} stroke="transparent" strokeWidth={10} cursor="ew-resize" onMouseDown={(e) => startDrag(e, d, x1 < x2 ? 'p2' : 'p1')} style={{pointerEvents: 'auto'}} />);
                          paths.push(<line key={`${d.id}-resize-top`} x1={boxX} y1={totalTop} x2={boxX+boxW} y2={totalTop} stroke="transparent" strokeWidth={10} cursor="ns-resize" onMouseDown={(e) => startDrag(e, d, isLong ? (targetY < stopY ? 'target' : 'stop') : (stopY < targetY ? 'stop' : 'target'))} style={{pointerEvents: 'auto'}} />);
                          paths.push(<line key={`${d.id}-resize-bot`} x1={boxX} y1={totalTop+totalH} x2={boxX+boxW} y2={totalTop+totalH} stroke="transparent" strokeWidth={10} cursor="ns-resize" onMouseDown={(e) => startDrag(e, d, isLong ? (targetY > stopY ? 'target' : 'stop') : (stopY > targetY ? 'stop' : 'target'))} style={{pointerEvents: 'auto'}} />);
                          paths.push(<line key={`${d.id}-resize-entry`} x1={boxX} y1={y1} x2={boxX+boxW} y2={y1} stroke="transparent" strokeWidth={10} cursor="ns-resize" onMouseDown={(e) => startDrag(e, d, 'entry')} style={{pointerEvents: 'auto'}} />);
                      }
                      const riskAmt = Math.abs(d.p1.price - d.stopPrice);
                      const rewardAmt = Math.abs(d.targetPrice - d.p1.price);
                      const rr = riskAmt === 0 ? 0 : rewardAmt / riskAmt;
                      const labelX = boxX + boxW + 4; 
                      const sym = activeSymbolRef.current || '';
                      const isJpy = sym.includes('JPY');
                      const isXau = sym.includes('XAU');
                      const isXag = sym.includes('XAG');
                      const pipScalar = isJpy ? 0.01 : ((isXau || isXag) ? 0.01 : 0.0001);
                      const tpPips = rewardAmt / pipScalar;
                      const slPips = riskAmt / pipScalar;
                      
                      // Use consistent digits for price display
                      const displayDigits = isJpy ? 3 : ((isXau || isXag) ? 2 : 5);

                      paths.push(
                        <g key={`${d.id}-labels`} style={{pointerEvents: 'none', fontSize: '12px', fontWeight: 'bold'}}>
                            <text x={boxX + (boxW/2)} y={y1 + (isLong ? -5 : 12)} textAnchor="middle" fill="#a1a1aa">R: {rr.toFixed(2)}</text>
                            <text x={labelX} y={y1 + 3} fill="#a1a1aa">Entry: {d.p1.price.toFixed(displayDigits)}</text>
                            <text x={labelX} y={targetY + 3} fill="#22c55e">TP: {d.targetPrice.toFixed(displayDigits)} ({tpPips.toFixed(2)} pips)</text>
                            <text x={labelX} y={stopY + 3} fill="#ef4444">SL: {d.stopPrice.toFixed(displayDigits)} ({slPips.toFixed(2)} pips)</text>
                        </g>
                      );
                  }
              }
          }
      });
      
      setSvgPaths(panePaths);
  };

  useEffect(() => {
      if (!chartRef.current) return;
      const handleVisibleRangeChange = () => requestAnimationFrame(updateDrawings);
      chartRef.current.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
      const ro = new ResizeObserver(() => requestAnimationFrame(updateDrawings));
      if (chartContainerRef.current) ro.observe(chartContainerRef.current);
      updateDrawings();
      return () => { 
          try { 
              chartRef.current?.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange); 
          } catch(e) {
              // Ignore unsubscribe errors on unmount
          } 
          ro.disconnect(); 
      };
  }, [drawings, data, activeTool, selectedDrawingId, dragTarget, tempPoint, mousePos, activeDragObject, pricePrecision, dragTrade, trades, hoverPoint, indicatorValues]);

  return (
    <div ref={wrapperRef} className="w-full h-full flex flex-col relative" onMouseUp={handleMouseUp}>
      {/* MAIN CHART */}
      <div className="relative flex-1 min-h-0" onMouseMove={(e) => handleMouseMove(e, 'MAIN')}>
          <div ref={chartContainerRef} className="w-full h-full" />
          <div className="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none z-10">
              {indicatorConfigs.filter(c => c.type === 'EMA' && c.visible).map(config => (
                  <div key={config.id} className="flex items-center gap-2 text-[10px] pointer-events-auto">
                      <span className="font-bold cursor-pointer hover:underline" style={{color: config.color || '#2962ff'}} onDoubleClick={() => onIndicatorDblClick(config)}>EMA {config.period}</span>
                      <button onClick={() => onRemoveIndicator(config.id)} className="w-3 h-3 flex items-center justify-center text-zinc-500 hover:text-red-500 transition-colors" title="Remove"><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg></button>
                  </div>
              ))}
          </div>
          <svg className="absolute top-0 left-0 w-full h-full z-10 overflow-hidden" style={{pointerEvents: 'none'}}>{svgPaths.MAIN}</svg>
          
          {lotSizeConfig && onLotSizeWidgetDoubleClick && currentPrice !== undefined && (
              <LotSizeWidget 
                  config={lotSizeConfig} 
                  activeSymbol={activeSymbol} 
                  currentPrice={currentPrice} 
                  onDoubleClick={onLotSizeWidgetDoubleClick} 
              />
          )}
      </div>

      {/* INDICATORS */}
      {activeIndicators.map(config => (
          <div key={config.type} className="border-t border-[#27272a] relative bg-[#18181b] group flex flex-col" style={{ height: indicatorHeights[config.type] || 160 }} onMouseMove={(e) => handleMouseMove(e, config.type)}>
              <div className="w-full h-1 bg-[#27272a] hover:bg-blue-500 cursor-row-resize absolute top-0 left-0 z-20 transition-colors" onMouseDown={(e) => handleResizeStart(e, config.type)} />
              
              <div ref={(el) => { if (el) indicatorContainerRefs.current.set(config.type, el); }} className="w-full h-full relative" >
                  {/* SVG OVERLAY FOR INDICATOR */}
                  <svg className="absolute top-0 left-0 w-full h-full z-10 overflow-hidden" style={{pointerEvents: 'none'}}>{svgPaths[config.type]}</svg>
              </div>

              <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onRemoveIndicator(config.id)} className="p-1 text-zinc-500 hover:text-red-500 hover:bg-white/5 rounded-md transition-colors" title="Remove Indicator"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
              </div>
              <div className="absolute top-2 left-2 flex items-center gap-3 text-[10px] pointer-events-none z-10">
                  <span className="text-zinc-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto cursor-pointer" onDoubleClick={() => onIndicatorDblClick(config)}>{config.type}</span>
                  {config.type === 'RSI' && indicatorValues['RSI'] && (<span className="font-mono text-xs font-bold" style={{color: config.color || '#7e57c2'}}>{typeof indicatorValues['RSI'].rsi === 'number' ? indicatorValues['RSI'].rsi.toFixed(2) : ''}</span>)}
                  {config.type === 'MACD' && indicatorValues['MACD'] && (<><span className="font-mono text-xs font-bold" style={{color: config.color || '#2962ff'}}>{typeof indicatorValues['MACD'].macd === 'number' ? indicatorValues['MACD'].macd.toFixed(5) : ''}</span><span className="font-mono text-xs font-bold" style={{color: config.signalColor || '#f57c00'}}>{typeof indicatorValues['MACD'].signal === 'number' ? indicatorValues['MACD'].signal.toFixed(5) : ''}</span><span className="font-mono text-xs font-bold" style={{color: (indicatorValues['MACD'].hist || 0) >= 0 ? '#26a69a' : '#ef5350'}}>{typeof indicatorValues['MACD'].hist === 'number' ? indicatorValues['MACD'].hist.toFixed(5) : ''}</span></>)}
              </div>
          </div>
      ))}
    </div>
  );
});
