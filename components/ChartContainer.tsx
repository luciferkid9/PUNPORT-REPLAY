
import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, MouseEventParams, LogicalRange, IPriceLine, TickMarkType } from 'lightweight-charts';
import { Candle, Trade, OrderStatus, ToolType, DrawingObject, Point, IndicatorConfig, DrawingSettings, SymbolType, SessionConfig, IndicatorType, DragTradeUpdate, LotSizeConfig, TimeframeType } from '../types';
import { TF_SECONDS } from '../constants';
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
  onLoadMore?: () => void;
  onIndicatorDblClick: (config: IndicatorConfig) => void; 
  onRemoveIndicator: (id: string) => void;
  drawings: DrawingObject[];
  selectedDrawingId: string | null;
  pricePrecision?: number; 
  lotSizeConfig?: LotSizeConfig;
  onLotSizeWidgetDoubleClick?: () => void;
  currentPrice?: number;
  autoConversionPrice?: number | null;
}

export interface ChartRef {
    fitContent: () => void;
    getChart: () => IChartApi | null;
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

const SvgOverlay = forwardRef((props: { pane: string }, ref) => {
    const [paths, setPaths] = useState<React.ReactNode[]>([]);
    useImperativeHandle(ref, () => ({
        setPaths
    }));
    return <svg className="absolute top-0 left-0 w-full h-full z-10 overflow-hidden" style={{pointerEvents: 'none'}}>{paths}</svg>;
});

export const ChartContainer = forwardRef<ChartRef, Props>(({ 
    data, trades, activeTool, magnetMode, drawingSettings, indicatorConfigs, 
    activeSymbol, interval,
    emaDataMap, rsiData, macdData, 
    onDrawingCreate, onDrawingUpdate, onDrawingEdit, onDrawingSelect, onDrawingDelete, onModifyTrade, onModifyOrderEntry, onLoadMore, onIndicatorDblClick, onRemoveIndicator, drawings, selectedDrawingId,
    pricePrecision = 5,
    lotSizeConfig, onLotSizeWidgetDoubleClick, currentPrice, autoConversionPrice
}, ref) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  const indicatorChartRefs = useRef<Map<string, IChartApi>>(new Map());
  const indicatorContainerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  
  const [indicatorHeights, setIndicatorHeights] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ type: string, startY: number, startHeight: number } | null>(null);

  const [indicatorValues, setIndicatorValues] = useState<Record<string, any>>({});

  const isSyncingRef = useRef<boolean>(false);
  const isLoadingHistoryRef = useRef<boolean>(false);

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
  const tempPointRef = useRef<{ point: Point, pane: string } | null>(null);
  const hoverPointRef = useRef<{ point: Point, pane: string } | null>(null); 
  
  // SVG Paths split by Pane ID
  const svgOverlayRefs = useRef<Record<string, { setPaths: React.Dispatch<React.SetStateAction<React.ReactNode[]>> } | null>>({});
  
  const activeDragObjectRef = useRef<DrawingObject | null>(null);
  
  const dragTargetRef = useRef<DragState | null>(null);
  
  const dragTradeRef = useRef<DragTradeState | null>(null);

  const mousePosRef = useRef({ x: 0, y: 0 });

  const activeToolRef = useRef(activeTool);
  const magnetModeRef = useRef(magnetMode);
  const drawingSettingsRef = useRef(drawingSettings);
  const activeSymbolRef = useRef(activeSymbol);
  const onDrawingCreateRef = useRef(onDrawingCreate);
  const onDrawingSelectRef = useRef(onDrawingSelect);
  const intervalRef = useRef(interval);
  const isShiftPressed = useRef(false);
  const dragRafRef = useRef<number | null>(null);

  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { magnetModeRef.current = magnetMode; }, [magnetMode]);
  useEffect(() => { drawingSettingsRef.current = drawingSettings; }, [drawingSettings]);
  useEffect(() => { activeSymbolRef.current = activeSymbol; }, [activeSymbol]);
  useEffect(() => { onDrawingCreateRef.current = onDrawingCreate; }, [onDrawingCreate]);
  useEffect(() => { onDrawingSelectRef.current = onDrawingSelect; }, [onDrawingSelect]);
  useEffect(() => { intervalRef.current = interval; }, [interval]);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Shift') isShiftPressed.current = true;
        if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) return;
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
            if (onDrawingDelete) {
                onDrawingDelete(selectedDrawingId);
                if (onDrawingSelect) onDrawingSelect(null);
            }
        }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Shift') isShiftPressed.current = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedDrawingId, onDrawingDelete, onDrawingSelect]);

  useImperativeHandle(ref, () => ({
    fitContent: () => {
        chartRef.current?.timeScale().fitContent();
    },
    getChart: () => chartRef.current
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

  const getMagnetPoint = (time: number, rawPrice: number, pane: string): { time: number, price: number } => {
      if (!magnetModeRef.current || pane !== 'MAIN') return { time, price: rawPrice };

      const currentData = dataRef.current;
      if (!currentData.length) return { time, price: rawPrice };

      // Prevent snapping if time is outside the data range (future or past)
      const firstTime = currentData[0].time;
      const lastTime = currentData[currentData.length - 1].time;
      if (time > lastTime || time < firstTime) {
          return { time, price: rawPrice };
      }

      // ค้นหาแท่งเทียนที่ใกล้ที่สุด (Nearest Candle)
      let low = 0, high = currentData.length - 1;
      let nearestIdx = 0;
      while (low <= high) {
          const mid = (low + high) >>> 1;
          if (currentData[mid].time === time) { nearestIdx = mid; break; }
          if (currentData[mid].time < time) { nearestIdx = mid; low = mid + 1; }
          else { high = mid - 1; }
      }
      
      const candle = currentData[nearestIdx];
      if (!candle) return { time, price: rawPrice };

      const candleInterval = intervalRef.current || 60;
      const timeDiff = Math.abs(time - candle.time);
      
      // ถ้าเวลาอยู่ห่างจากแท่งเทียนเกิน 1 ช่วงแท่งเทียน ไม่ต้อง Snap (ป้องกันการกระโดดไปหาแท่งแรกสุด)
      if (timeDiff > candleInterval) {
          return { time, price: rawPrice };
      }

      const distHigh = Math.abs(candle.high - rawPrice);
      const distLow = Math.abs(candle.low - rawPrice);
      const distClose = Math.abs(candle.close - rawPrice);
      const distOpen = Math.abs(candle.open - rawPrice);
      
      const minDist = Math.min(distHigh, distLow, distClose, distOpen);
      let snappedPrice = rawPrice;
      if (minDist === distHigh) snappedPrice = candle.high;
      else if (minDist === distLow) snappedPrice = candle.low;
      else if (minDist === distClose) snappedPrice = candle.close;
      else snappedPrice = candle.open;

      return { time: candle.time, price: snappedPrice };
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

  // Helper to get logical index from time (for robust calculations)
  const getLogicalFromTime = (time: number): number => {
      const data = dataRef.current;
      if (!data || data.length === 0) return 0;
      
      // Binary search for nearest candle
      let l = 0, r = data.length - 1;
      while (l <= r) {
          const m = (l + r) >>> 1;
          if (data[m].time === time) return m;
          if (data[m].time < time) l = m + 1;
          else r = m - 1;
      }
      
      const candleInterval = intervalRef.current || 60;

      // Extrapolate if outside range
      if (r < 0) return -1 + (time - data[0].time) / candleInterval;
      if (l >= data.length) return data.length + (time - data[data.length-1].time) / candleInterval;
      
      // Interpolate if between candles
      const t1 = data[r].time;
      const t2 = data[l].time;
      const ratio = (time - t1) / (t2 - t1);
      return r + ratio;
  };

  // --- MOUSE HANDLER ---
  const handleMouseMove = (e: React.MouseEvent, pane: string) => {
    const targetDiv = pane === 'MAIN' ? chartContainerRef.current : indicatorContainerRefs.current.get(pane);
    if (!targetDiv) return;
    // ... (rect calc)
    const rect = targetDiv.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const { chart, series } = getPaneContext(pane);
    
    if (chart && series) {
      mousePosRef.current = { x, y };

      const logical = chart.timeScale().coordinateToLogical(x);
      const rawPrice = series.coordinateToPrice(y);
      
      if (logical !== null && rawPrice !== null) {
          const time = getTimeFromLogical(logical, chart);
          if (time) {
              const useMagnet = magnetModeRef.current && activeToolRef.current !== 'RECTANGLE';
              const snapped = useMagnet ? getMagnetPoint(time, rawPrice, pane) : { time, price: rawPrice };
              let finalTime = snapped.time;
              let finalPrice = snapped.price;

              // --- SHIFT KEY SNAP LOGIC (Trendline Creation) ---
              if (e.shiftKey && tempPointRef.current && tempPointRef.current.pane === pane && activeToolRef.current === 'TRENDLINE') {
                  const p1Time = tempPointRef.current.point.time;
                  const p1Price = tempPointRef.current.point.price;
                  
                  // Use projected coordinate for P1 to handle off-screen snapping
                  const p1Logical = getLogicalFromTime(p1Time);
                  const p1X = chart.timeScale().logicalToCoordinate(p1Logical);
                  const p1Y = series.priceToCoordinate(p1Price);

                  if (p1X !== null && p1Y !== null) {
                      const dx = Math.abs(x - p1X);
                      const dy = Math.abs(y - p1Y);
                      if (dx > dy) finalPrice = p1Price; // Horizontal Snap
                      else finalTime = p1Time; // Vertical Snap
                  }
              }
              // -----------------------------

              if (tempPointRef.current || activeToolRef.current === 'CROSSHAIR' || activeToolRef.current !== 'CURSOR') {
                  hoverPointRef.current = { point: { time: finalTime, price: finalPrice }, pane };
                  
                  // Only update drawings if we are actively drawing a tool (tempPoint exists) or if we need crosshair info.
                  // Usually crosshair is handled by typical chart APIs, but for drawn components like dynamic text or handles,
                  // we need to re-render.
                  if (tempPointRef.current) {
                      if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current);
                      dragRafRef.current = requestAnimationFrame(() => {
                          updateDrawings();
                          dragRafRef.current = null;
                      });
                  }
              }
          }
      }

      // Main pane trade dragging logic
      if (pane === 'MAIN' && dragTradeRef.current) {
          // ... (Trade drag logic preserved)
          try {
              const price = series.coordinateToPrice(y);
              if (price !== null) {
                  const updatePayload = { id: dragTradeRef.current.id, type: dragTradeRef.current.type, price: price };
                  dragTradeRef.current = { ...dragTradeRef.current, currentPrice: price };
                  import('../constants').then(m => m.emitActiveDragTradeChange(updatePayload));
              }
          } catch(e) {
              // Ignore coordinateToPrice errors
          }
      }

      // Drawing Dragging Logic
      if (dragTargetRef.current && activeDragObjectRef.current && dragTargetRef.current.pane === pane) {
          if (logical !== null && rawPrice !== null) {
              const time = getTimeFromLogical(logical, chart);
              if (time) {
                  const useMagnet = magnetModeRef.current && !isShiftPressed.current && dragTargetRef.current.point !== 'all' && dragTargetRef.current.point !== 'target' && dragTargetRef.current.point !== 'stop' && dragTargetRef.current.point !== 'entry';
                  const snapped = useMagnet ? getMagnetPoint(time, rawPrice, pane) : { time, price: rawPrice };
                  const finalTime = snapped.time;
                  const finalPrice = snapped.price;
                  
                  const sym = activeSymbolRef.current || '';
                  const isJpy = sym.includes('JPY');
                  const isXau = sym.includes('XAU');
                  const isXag = sym.includes('XAG');
                  const digits = isJpy ? 3 : ((isXau || isXag) ? 2 : 5);
                  const roundPrice = (p: number) => Math.round(p * Math.pow(10, digits)) / Math.pow(10, digits);

                  const newObj = { ...activeDragObjectRef.current };
                  
                  // --- FIX 2: Use Logical Difference for Moving "All" to prevent stretching ---
                  let timeDiff = 0;
                  if (dragTargetRef.current.point === 'all') {
                      const currentLogical = logical;
                      const startLogical = getLogicalFromTime(dragTargetRef.current.initialMouse.time);
                      const logicalDiff = currentLogical - startLogical;
                      
                      const p1StartLogical = getLogicalFromTime(dragTargetRef.current.initialP1.time);
                      const p2StartLogical = getLogicalFromTime(dragTargetRef.current.initialP2.time);
                      
                      const newP1Time = getTimeFromLogical(p1StartLogical + logicalDiff, chart);
                      const newP2Time = getTimeFromLogical(p2StartLogical + logicalDiff, chart);
                      
                      // We calculate the effective time diffs for P1 and P2 separately
                      // But for the "newObj" assignment below, we need to handle it carefully.
                      // Actually, we can just set the new times directly in the 'all' block.
                  } else {
                      timeDiff = time - dragTargetRef.current.initialMouse.time;
                  }
                  
                  const priceDiff = finalPrice - dragTargetRef.current.initialMouse.price;

                  // --- SHIFT SNAP LOGIC FOR EDITING ---
                  let snapTime = time;
                  let snapPrice = finalPrice;
                  let effectivePriceDiff = priceDiff;

                  if (e.shiftKey && activeDragObjectRef.current.type === 'TRENDLINE') {
                      // 1. Snapping when dragging endpoints (P1 or P2)
                      if (dragTargetRef.current.point === 'p1' || dragTargetRef.current.point === 'p2') {
                          const otherPoint = dragTargetRef.current.point === 'p1' ? activeDragObjectRef.current.p2 : activeDragObjectRef.current.p1;
                          
                          // FIX 1: Use projected coordinates to handle off-screen points
                          const otherLogical = getLogicalFromTime(otherPoint.time);
                          const otherX = chart.timeScale().logicalToCoordinate(otherLogical);
                          const otherY = series.priceToCoordinate(otherPoint.price);
                          
                          // If otherX is null (projection failed?), fallback to Infinity, but logicalToCoordinate usually returns value.
                          const dx = otherX !== null ? Math.abs(x - otherX) : Infinity;
                          const dy = otherY !== null ? Math.abs(y - otherY) : Infinity;

                          if (dx > dy) {
                              snapPrice = otherPoint.price; // Horizontal Snap
                          } else if (dy >= dx && dx !== Infinity) {
                              snapTime = otherPoint.time; // Vertical Snap
                          }
                      }
                      
                      // 2. Orthogonal constraint when moving the whole line
                      if (dragTargetRef.current.point === 'all') {
                          const startLogical = getLogicalFromTime(dragTargetRef.current.initialMouse.time);
                          const initX = chart.timeScale().logicalToCoordinate(startLogical);
                          const initY = series.priceToCoordinate(dragTargetRef.current.initialMouse.price);
                          
                          if (initX !== null && initY !== null) {
                              const dx = Math.abs(x - initX);
                              const dy = Math.abs(y - initY);
                              if (dx > dy) {
                                  effectivePriceDiff = 0; // Horizontal Move Only
                              } else {
                                  // Vertical Move Only: Reset logical diff
                                  // We handle this in the 'all' block below
                              }
                          }
                      }
                  }
                  // ------------------------------------

                  if (dragTargetRef.current.point === 'all') {
                      // Apply Logical Move
                      const currentLogical = logical;
                      const startLogical = getLogicalFromTime(dragTargetRef.current.initialMouse.time);
                      let logicalDiff = currentLogical - startLogical;
                      
                      // Apply Shift Constraint (Vertical Move Only -> No Time Change)
                      if (e.shiftKey && activeDragObjectRef.current.type === 'TRENDLINE') {
                          const startLogical = getLogicalFromTime(dragTargetRef.current.initialMouse.time);
                          const initX = chart.timeScale().logicalToCoordinate(startLogical);
                          const initY = series.priceToCoordinate(dragTargetRef.current.initialMouse.price);
                          if (initX !== null && initY !== null) {
                              const dx = Math.abs(x - initX);
                              const dy = Math.abs(y - initY);
                              if (dy >= dx) logicalDiff = 0; // Vertical Move Only (No Time Change)
                          }
                      }

                      const p1StartLogical = getLogicalFromTime(dragTargetRef.current.initialP1.time);
                      const p2StartLogical = getLogicalFromTime(dragTargetRef.current.initialP2.time);
                      
                      const newP1Time = getTimeFromLogical(p1StartLogical + logicalDiff, chart);
                      const newP2Time = getTimeFromLogical(p2StartLogical + logicalDiff, chart);
                      
                      if (newP1Time && newP2Time) {
                          newObj.p1 = { time: newP1Time, price: roundPrice(dragTargetRef.current.initialP1.price + effectivePriceDiff) };
                          newObj.p2 = { time: newP2Time, price: roundPrice(dragTargetRef.current.initialP2.price + effectivePriceDiff) };
                      }
                      
                      if (dragTargetRef.current.initialTarget !== undefined && newObj.targetPrice !== undefined) newObj.targetPrice = roundPrice(dragTargetRef.current.initialTarget + effectivePriceDiff);
                      if (dragTargetRef.current.initialStop !== undefined && newObj.stopPrice !== undefined) newObj.stopPrice = roundPrice(dragTargetRef.current.initialStop + effectivePriceDiff);
                  
                  } else if (dragTargetRef.current.point === 'p1') {
                      newObj.p1 = { time: snapTime, price: roundPrice(snapPrice) };
                      if (useMagnet) newObj.p1.time = finalTime;
                  } else if (dragTargetRef.current.point === 'p2') {
                      newObj.p2 = { time: snapTime, price: roundPrice(snapPrice) };
                      if (useMagnet) newObj.p2.time = finalTime;
                  } else if (dragTargetRef.current.point === 'target') {
                      newObj.targetPrice = roundPrice(rawPrice); 
                  } else if (dragTargetRef.current.point === 'stop') {
                      newObj.stopPrice = roundPrice(rawPrice); 
                  } else if (dragTargetRef.current.point === 'entry') {
                      newObj.p1 = { ...newObj.p1, price: roundPrice(rawPrice) };
                      newObj.p2 = { ...newObj.p2, price: roundPrice(rawPrice) }; 
                  }
                  
                  activeDragObjectRef.current = newObj as DrawingObject;
                  
                  if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current);
                  dragRafRef.current = requestAnimationFrame(() => {
                      updateDrawings();
                      import('../constants').then(m => m.emitActiveDragChange(newObj as DrawingObject));
                      dragRafRef.current = null;
                  });
              }
          }
      }
    }
  };
  
  const handleMouseUp = () => {
      if (dragTradeRef.current) {
          const trade = trades.find(t => t.id === dragTradeRef.current?.id);
          if (trade) {
              if (dragTradeRef.current.type === 'SL' && onModifyTrade) {
                  onModifyTrade(dragTradeRef.current.id, dragTradeRef.current.currentPrice, trade.takeProfit);
              } else if (dragTradeRef.current.type === 'TP' && onModifyTrade) {
                  onModifyTrade(dragTradeRef.current.id, trade.stopLoss, dragTradeRef.current.currentPrice);
              } else if (dragTradeRef.current.type === 'ENTRY' && onModifyOrderEntry) {
                  onModifyOrderEntry(dragTradeRef.current.id, dragTradeRef.current.currentPrice);
              }
          }
          dragTradeRef.current = null;
          import('../constants').then(m => m.emitActiveDragTradeChange(null));
      }
      if (dragTargetRef.current && activeDragObjectRef.current) {
         if (onDrawingUpdate) onDrawingUpdate(activeDragObjectRef.current);
         dragTargetRef.current = null;
         activeDragObjectRef.current = null;
         updateDrawings();
         import('../constants').then(m => m.emitActiveDragChange(null));
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

      dragTargetRef.current = {
          id: targetId,
          point: pointType,
          initialP1: objectToDrag.p1,
          initialP2: objectToDrag.p2,
          initialMouse: { time, price },
          initialTarget: objectToDrag.targetPrice,
          initialStop: objectToDrag.stopPrice,
          pane: pane 
      };
      activeDragObjectRef.current = objectToDrag;
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
            // Disable magnet snapping when dragging to prevent "flipping" or "jumping" issues
            // Also disable for RECTANGLE tool to allow free placement as requested
            const snapped = (activeDragObjectRef.current || activeToolRef.current === 'RECTANGLE') ? { time, price: rawPrice } : getMagnetPoint(time, rawPrice, pane);
            const clickedPoint: Point = { time: snapped.time, price: snapped.price };

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
                    tempPointRef.current = { point: clickedPoint, pane };
                    return;
                }
                
                if (onDrawingCreateRef.current) {
                    const isLong = activeToolRef.current === 'LONG_POSITION';
                    const isShort = activeToolRef.current === 'SHORT_POSITION';
                    let targetPrice = undefined, stopPrice = undefined;
                    let p2 = clickedPoint;

                    // --- SHIFT SNAP FOR CREATION ---
                    if (activeToolRef.current === 'TRENDLINE' && isShiftPressed.current) {
                        const p1 = prev.point;
                        const p1X = chart.timeScale().timeToCoordinate(p1.time);
                        const p1Y = series.priceToCoordinate(p1.price);
                        const p2X = chart.timeScale().timeToCoordinate(p2.time);
                        const p2Y = series.priceToCoordinate(p2.price);
                        
                        if (p1X !== null && p1Y !== null && p2X !== null && p2Y !== null) {
                            const dx = Math.abs(p2X - p1X);
                            const dy = Math.abs(p2Y - p1Y);
                            if (dx > dy) p2 = { ...p2, price: p1.price }; // Horizontal
                            else p2 = { ...p2, time: p1.time }; // Vertical
                        }
                    }
                    // -------------------------------

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
                        p1: prev.point, p2: p2, visible: true, locked: false,
                        color: drawingSettingsRef.current.color, lineWidth: drawingSettingsRef.current.lineWidth, lineStyle: drawingSettingsRef.current.lineStyle,
                        fillOpacity: drawingSettingsRef.current.fillOpacity,
                        rectTextVAlign: drawingSettingsRef.current.rectTextVAlign || 'top',
                        rectTextHAlign: drawingSettingsRef.current.rectTextHAlign || 'left',
                        rectTextPlacement: drawingSettingsRef.current.rectTextPlacement || 'inside',
                        showBorder: drawingSettingsRef.current.showBorder,
                        targetPrice, stopPrice,
                        pane: pane 
                    });
                }
                tempPointRef.current = null;
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
      const height = chartContainerRef.current?.clientHeight || 0;

      if (chartRef.current && candleSeriesRef.current && chartContainerRef.current) {
          const mainPaths = panePaths.MAIN;
          const safePriceCoord = (price: number) => { 
              if (price === null || isNaN(price)) return -10000;
              try { 
                  const coord = candleSeriesRef.current!.priceToCoordinate(price); 
                  if (coord !== null) return coord;
                  
                  // Fallback: Estimate coordinate if off-screen
                  const firstCandle = dataRef.current[0];
                  if (!firstCandle) return -10000;
                  const c0 = candleSeriesRef.current!.priceToCoordinate(firstCandle.close);
                  if (c0 === null) return -10000;
                  
                  const c1 = candleSeriesRef.current!.priceToCoordinate(firstCandle.close * 1.001);
                  if (c1 === null) return price > firstCandle.close ? -50000 : height + 50000;
                  
                  const pDiff = firstCandle.close * 0.001;
                  const cDiff = c1 - c0;
                  return c0 + (price - firstCandle.close) * (cDiff / pDiff);
              } catch(e) { 
                  return -10000; 
              }
          };

          // ... (Trade lines rendering logic preserved) ...
          const tradePointerEvents = activeToolRef.current === 'CURSOR' ? 'auto' : 'none';
          trades.forEach(t => {
              if (t.status === OrderStatus.CLOSED) return;
              const isDraggingThis = dragTradeRef.current && dragTradeRef.current.id === t.id;
              const labelWidth = 100;
              const xOffset = width - labelWidth - 5;
              if (t.status === OrderStatus.PENDING) {
                  const price = (isDraggingThis && dragTradeRef.current.type === 'ENTRY') ? dragTradeRef.current.currentPrice : t.entryPrice;
                  const y = safePriceCoord(price);
                  if (y > 0 && y < chartContainerRef.current!.clientHeight) {
                      const color = '#f59e0b';
                      const label = t.type === 'LIMIT' ? 'LIMIT' : 'STOP';
                      mainPaths.push(
                          <g key={`entry-${t.id}`} className="cursor-ns-resize group" style={{pointerEvents: tradePointerEvents}}>
                              <line x1={0} y1={y} x2={width} y2={y} stroke="transparent" strokeWidth={20} style={{pointerEvents: 'stroke', cursor: 'ns-resize'}} onMouseDown={(e) => { e.stopPropagation(); dragTradeRef.current = { id: t.id, type: 'ENTRY', startPrice: t.entryPrice, currentPrice: t.entryPrice }; }} onDoubleClick={(e) => { e.stopPropagation(); const newPrice = window.prompt("Enter new price:", t.entryPrice.toString()); if (newPrice && !isNaN(parseFloat(newPrice)) && onModifyOrderEntry) onModifyOrderEntry(t.id, parseFloat(newPrice)); }} />
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
                       if (t.stopLoss === 0 && (!isDraggingThis || dragTradeRef.current.type !== 'SL')) {
                            mainPaths.push(<g key={`sl-add-${t.id}`} className="cursor-pointer select-none" style={{pointerEvents: tradePointerEvents}} transform={`translate(${width - 115}, ${entryY - 10})`} onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); dragTradeRef.current = { id: t.id, type: 'SL', startPrice: t.entryPrice, currentPrice: t.entryPrice }; }}><rect width="28" height="18" rx="4" fill="#18181b" stroke="#F23645" strokeWidth={1} /><text x="14" y="12" textAnchor="middle" fill="#F23645" fontSize="11" fontWeight="bold">SL+</text></g>);
                       }
                       if (t.takeProfit === 0 && (!isDraggingThis || dragTradeRef.current.type !== 'TP')) {
                            mainPaths.push(<g key={`tp-add-${t.id}`} className="cursor-pointer select-none" style={{pointerEvents: tradePointerEvents}} transform={`translate(${width - 83}, ${entryY - 10})`} onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); dragTradeRef.current = { id: t.id, type: 'TP', startPrice: t.entryPrice, currentPrice: t.entryPrice }; }}><rect width="28" height="18" rx="4" fill="#18181b" stroke="#089981" strokeWidth={1} /><text x="14" y="12" textAnchor="middle" fill="#089981" fontSize="11" fontWeight="bold">TP+</text></g>);
                       }
                   }
              }
              if (t.stopLoss > 0 || (isDraggingThis && dragTradeRef.current.type === 'SL')) {
                  const price = (isDraggingThis && dragTradeRef.current.type === 'SL') ? dragTradeRef.current.currentPrice : t.stopLoss;
                  const y = safePriceCoord(price);
                  if (y > 0 && y < chartContainerRef.current!.clientHeight) {
                      mainPaths.push(
                        <g key={`sl-${t.id}`} className="cursor-ns-resize group" style={{pointerEvents: tradePointerEvents}}>
                            <line x1={0} y1={y} x2={width} y2={y} stroke="transparent" strokeWidth={20} style={{pointerEvents: 'stroke', cursor: 'ns-resize'}} onMouseDown={(e) => { e.stopPropagation(); dragTradeRef.current = { id: t.id, type: 'SL', startPrice: t.stopLoss, currentPrice: t.stopLoss }; }} />
                            <line x1={0} y1={y} x2={width} y2={y} stroke="#F23645" strokeDasharray="4 4" strokeWidth={1} style={{pointerEvents: 'none'}} />
                            <text x={10} y={y - 4} fill="#F23645" fontSize="12" fontWeight="bold" style={{pointerEvents: 'none'}}>SL #{t.id.substr(0,4)}</text>
                            <g transform={`translate(${xOffset}, ${y - 10})`} style={{pointerEvents: 'none'}}><rect width={labelWidth} height={20} rx={4} fill="#F23645" /><text x={labelWidth/2} y={14} textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">SL {price.toFixed(pricePrecision)}</text></g>
                        </g>
                      );
                  }
              }
              if (t.takeProfit > 0 || (isDraggingThis && dragTradeRef.current.type === 'TP')) {
                  const price = (isDraggingThis && dragTradeRef.current.type === 'TP') ? dragTradeRef.current.currentPrice : t.takeProfit;
                  const y = safePriceCoord(price);
                  if (y > 0 && y < chartContainerRef.current!.clientHeight) {
                      mainPaths.push(
                        <g key={`tp-${t.id}`} className="cursor-ns-resize group" style={{pointerEvents: tradePointerEvents}}>
                            <line x1={0} y1={y} x2={width} y2={y} stroke="transparent" strokeWidth={20} style={{pointerEvents: 'stroke', cursor: 'ns-resize'}} onMouseDown={(e) => { e.stopPropagation(); dragTradeRef.current = { id: t.id, type: 'TP', startPrice: t.takeProfit, currentPrice: t.takeProfit }; }} />
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
      if (activeDragObjectRef.current) {
         const idx = renderList.findIndex(d => d.id === activeDragObjectRef.current!.id);
         if (idx >= 0) renderList[idx] = activeDragObjectRef.current; 
         else renderList.push(activeDragObjectRef.current);
      }
      
      if (tempPointRef.current && hoverPointRef.current && activeToolRef.current !== 'CURSOR' && activeToolRef.current !== 'KILLZONE' && activeToolRef.current !== 'TEXT') {
          // ... (Ghost rendering preserved) ...
          if (tempPointRef.current.pane === hoverPointRef.current.pane) {
              const ghostId = `ghost-preview-${tempPointRef.current.pane}`;
              const ghostDrawing: DrawingObject = {
                  id: ghostId, symbol: activeSymbolRef.current, type: activeToolRef.current,
                  p1: tempPointRef.current.point, p2: hoverPointRef.current.point, visible: true, locked: false,
                  color: drawingSettingsRef.current.color, lineWidth: drawingSettingsRef.current.lineWidth, lineStyle: drawingSettingsRef.current.lineStyle,
                  fillOpacity: drawingSettingsRef.current.fillOpacity,
                  showBorder: drawingSettingsRef.current.showBorder,
                  pane: tempPointRef.current.pane
              };
              if (activeToolRef.current === 'LONG_POSITION' || activeToolRef.current === 'SHORT_POSITION') {
                    const isLong = activeToolRef.current === 'LONG_POSITION';
                    const entryP = tempPointRef.current.point.price;
                    const currentP = hoverPointRef.current.point.price;
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
              if (!renderList.find(d => d.id === ghostId)) {
                  renderList = [...renderList, ghostDrawing];
              }
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
          // AND handle future/past times for free drawing beyond candlesticks
          const getCoord = (time: number): number | null => {
             const ts = timeScale;
             if (!ts) return null;
             
             const currentData = dataRef.current;
             if (!currentData || currentData.length === 0) return null;

             const firstTime = currentData[0].time;
             const lastTime = currentData[currentData.length - 1].time;
             const interval = intervalRef.current || 60;

             // Handle Future Times
             if (time > lastTime) {
                 const futureBars = (time - lastTime) / interval;
                 const lastCoord = ts.timeToCoordinate(lastTime as any);
                 if (lastCoord !== null && lastCoord !== undefined) {
                     const lastLogical = ts.coordinateToLogical(lastCoord);
                     if (lastLogical !== null && lastLogical !== undefined) {
                         const c = ts.logicalToCoordinate(lastLogical + futureBars);
                         if (c !== null && c !== undefined) return c;
                     }
                 }
             }
             
             // Handle Past Times
             if (time < firstTime) {
                 const pastBars = (firstTime - time) / interval;
                 const firstCoord = ts.timeToCoordinate(firstTime as any);
                 if (firstCoord !== null && firstCoord !== undefined) {
                     const firstLogical = ts.coordinateToLogical(firstCoord);
                     if (firstLogical !== null && firstLogical !== undefined) {
                         const c = ts.logicalToCoordinate(firstLogical - pastBars);
                         if (c !== null && c !== undefined) return c;
                     }
                 }
             }

             // Inside data range: Time Alignment
             // This ensures drawings snap to valid time points in the current TF
             let low = 0, high = currentData.length - 1;
             let nearestIdx = 0;
             
             // Binary search for the nearest candle
             while (low <= high) {
                 const mid = (low + high) >>> 1;
                 if (currentData[mid].time === time) { nearestIdx = mid; break; }
                 if (currentData[mid].time < time) {
                     nearestIdx = mid;
                     low = mid + 1;
                 } else {
                     high = mid - 1;
                 }
             }
             
             // Snap to the nearest candle time
             const snappedTime = currentData[nearestIdx].time;

             // Try direct coordinate from Library using snapped time
             const c = ts.timeToCoordinate(snappedTime as any);
             if (c !== null && c !== undefined) return c;

             return null;
          }

          const safePriceCoord = (price: number) => { 
              if (price === null || isNaN(price)) return -10000;
              try { 
                  const coord = series.priceToCoordinate(price); 
                  if (coord !== null) return coord;
                  
                  // Fallback: Estimate coordinate if off-screen
                  const firstCandle = dataRef.current[0];
                  if (!firstCandle) return -10000;
                  const c0 = series.priceToCoordinate(firstCandle.close);
                  if (c0 === null) return -10000;
                  
                  // Simple linear estimation based on a small price difference
                  const c1 = series.priceToCoordinate(firstCandle.close * 1.001);
                  if (c1 === null) return price > firstCandle.close ? -50000 : height + 50000;
                  
                  const pDiff = firstCandle.close * 0.001;
                  const cDiff = c1 - c0;
                  return c0 + (price - firstCandle.close) * (cDiff / pDiff);
              } catch(e) { 
                  return -10000; 
              }
          };

          const x1Val = getCoord(d.p1.time);
          const x2Val = getCoord(d.p2.time);
          
          // Use a much larger clamping value to avoid "expanding" effect when zooming
          const x1 = x1Val ?? (d.p1.time < (dataRef.current[0]?.time || 0) ? -50000 : width + 50000);
          const x2 = x2Val ?? (d.p2.time < (dataRef.current[0]?.time || 0) ? -50000 : width + 50000);
          const y1 = safePriceCoord(d.p1.price);
          const y2 = safePriceCoord(d.p2.price);
          
          const handleDblClick = (e: React.MouseEvent) => { e.stopPropagation(); if (onDrawingEdit && !d.id.startsWith('ghost-preview')) onDrawingEdit(d); };
          // Disable pointer events on existing drawings if a tool is active (except CURSOR)
          // to prevent them from blocking the click for placing new points.
          const isGhost = d.id.startsWith('ghost-preview');
          const pointerEventsStyle = (isGhost || activeToolRef.current !== 'CURSOR') ? 'none' : 'auto';
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
                                  {d.killZoneConfig!.showLabel && <text x={sx} y={sy - 5} fill={sess.color} fontSize={12} fontWeight="bold" style={{pointerEvents: pointerEventsStyle, cursor: 'pointer'}}>{sess.label}</text>}
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
                          <text 
                            x={midX} 
                            y={midY} 
                            dy={d.textPosition === 'bottom' ? (d.fontSize || 12) + 4 : -6} 
                            textAnchor="middle" 
                            fill={d.color} 
                            fontSize={d.fontSize || 12} 
                            fontWeight="bold" 
                            transform={`rotate(${rotation}, ${midX}, ${midY})`} 
                            style={{textShadow: '0px 1px 2px rgba(0,0,0,0.8)', pointerEvents: 'none'}}
                          >
                              {d.text}
                          </text>
                      )}
                      {isSelected && (<><circle cx={x1} cy={y1} r={5} fill="white" stroke={d.color} strokeWidth={1} className="cursor-pointer" onMouseDown={(e) => startDrag(e, d, 'p1')} /><circle cx={x2} cy={y2} r={5} fill="white" stroke={d.color} strokeWidth={1} className="cursor-pointer" onMouseDown={(e) => startDrag(e, d, 'p2')} /></>)}
                  </g>
              );
          } else if (d.type === 'RECTANGLE') {
              const xStart = Math.min(x1, x2);
              const yStart = Math.min(y1, y2);
              const widthRect = Math.abs(x2 - x1);
              const heightRect = Math.abs(y2 - y1);
              const fillOpacity = d.fillOpacity !== undefined ? d.fillOpacity : 0.05;
              
              // Only skip if both points are extremely far off in the same direction
              const isOffScreen = (y1 < -1000 && y2 < -1000) || (y1 > height + 1000 && y2 > height + 1000);

              if (!isOffScreen) {
                  paths.push(
                    <g key={d.id} onDoubleClick={handleDblClick} style={{pointerEvents: pointerEventsStyle}}>
                        {/* Fill - No pointer events so user can click candles behind */}
                        <rect 
                            x={xStart} y={yStart} width={widthRect} height={heightRect} 
                            fill={d.color} fillOpacity={fillOpacity} 
                            stroke="none"
                            style={{pointerEvents: 'none'}}
                        />
                        
                        {/* Border - Hit area and visible line */}
                        <rect 
                            x={xStart} y={yStart} width={widthRect} height={heightRect} 
                            fill="none" 
                            stroke={d.showBorder !== false ? d.color : 'transparent'} 
                            strokeWidth={d.showBorder !== false ? d.lineWidth : 12} 
                            strokeDasharray={d.lineStyle === 'dashed' ? '4 2' : d.lineStyle === 'dotted' ? '2 2' : ''} 
                            className="cursor-move" 
                            onMouseDown={(e) => startDrag(e, d, 'all')} 
                            style={{pointerEvents: pointerEventsStyle === 'none' ? 'none' : 'stroke'}}
                        />

                        {d.text && (() => {
                            let textX = xStart + 5;
                            let textY = yStart + 15;
                            let textAnchor = "start";
                            const isOutside = d.rectTextPlacement === 'outside';

                            // Horizontal Alignment
                            if (d.rectTextHAlign === 'center') {
                                textX = xStart + widthRect / 2;
                                textAnchor = "middle";
                            } else if (d.rectTextHAlign === 'right') {
                                textX = xStart + widthRect - 5;
                                textAnchor = "end";
                            }

                            // Vertical Alignment
                            if (d.rectTextVAlign === 'middle') {
                                textY = yStart + heightRect / 2 + 5;
                            } else if (d.rectTextVAlign === 'bottom') {
                                textY = yStart + heightRect - 5;
                                if (isOutside) textY = yStart + heightRect + 15;
                            } else if (d.rectTextVAlign === 'top') {
                                textY = yStart + 15;
                                if (isOutside) textY = yStart - 5;
                            }

                            return (
                                <text 
                                    x={textX} y={textY} 
                                    fill={d.color} 
                                    fontSize={11} 
                                    fontWeight="bold" 
                                    textAnchor={textAnchor}
                                    style={{textShadow: '0px 1px 2px black', pointerEvents: 'none'}}
                                >
                                    {d.text}
                                </text>
                            );
                        })()}
                        {isSelected && !d.id.startsWith('ghost-preview') && (
                            <>
                                <circle cx={x1} cy={y1} r={5} fill="white" stroke={d.color} strokeWidth={1} className="cursor-pointer" onMouseDown={(e) => startDrag(e, d, 'p1')} />
                                <circle cx={x2} cy={y2} r={5} fill="white" stroke={d.color} strokeWidth={1} className="cursor-pointer" onMouseDown={(e) => startDrag(e, d, 'p2')} />
                            </>
                        )}
                    </g>
                  );
              }
          } else if (d.type === 'FIB') {
              // ... (Fib rendering preserved) ...
              if (y1 > -5000 && y2 > -5000) {
                  paths.push(<line key={`${d.id}-hit`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={15} style={{pointerEvents: pointerEventsStyle, cursor: 'move'}} onMouseDown={(e) => !d.id.startsWith('ghost-preview') && startDrag(e, d, 'all')} onDoubleClick={handleDblClick} />);
                  paths.push(<line key={`${d.id}-main`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={d.color} strokeWidth={1} strokeDasharray="4 4" opacity={0.5} style={{pointerEvents: 'none'}} />);
                  if (isSelected && !d.id.startsWith('ghost-preview')) {
                      paths.push(<circle key={`${d.id}-p1`} cx={x1} cy={y1} r={5} fill="white" stroke={d.color} strokeWidth={1} className="cursor-pointer" onMouseDown={(e) => startDrag(e, d, 'p1')} style={{pointerEvents: pointerEventsStyle}} />);
                      paths.push(<circle key={`${d.id}-p2`} cx={x2} cy={y2} r={5} fill="white" stroke={d.color} strokeWidth={1} className="cursor-pointer" onMouseDown={(e) => startDrag(e, d, 'p2')} style={{pointerEvents: pointerEventsStyle}} />);
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
                      if (d.id.startsWith('ghost-preview') && y2 > -5000 && x1 > -5000 && x2 > -5000) {
                          paths.push(<line key={`${d.id}-connect`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={d.color} strokeWidth={1} strokeDasharray="4 4" opacity={0.8} style={{pointerEvents: 'none'}} />);
                      }
                      if (!d.id.startsWith('ghost-preview')) {
                          const totalTop = Math.min(targetY, stopY);
                          const totalH = Math.abs(targetY - stopY);
                          paths.push(<rect key={`${d.id}-move`} x={boxX} y={totalTop} width={boxW} height={totalH} fill="transparent" cursor="move" onMouseDown={(e) => startDrag(e, d, 'all')} onDoubleClick={handleDblClick} style={{pointerEvents: pointerEventsStyle}} />);
                          paths.push(<line key={`${d.id}-resize-w1`} x1={boxX} y1={totalTop} x2={boxX} y2={totalTop+totalH} stroke="transparent" strokeWidth={10} cursor="ew-resize" onMouseDown={(e) => startDrag(e, d, x1 < x2 ? 'p1' : 'p2')} style={{pointerEvents: pointerEventsStyle}} />);
                          paths.push(<line key={`${d.id}-resize-w2`} x1={boxX+boxW} y1={totalTop} x2={boxX+boxW} y2={totalTop+totalH} stroke="transparent" strokeWidth={10} cursor="ew-resize" onMouseDown={(e) => startDrag(e, d, x1 < x2 ? 'p2' : 'p1')} style={{pointerEvents: pointerEventsStyle}} />);
                          paths.push(<line key={`${d.id}-resize-top`} x1={boxX} y1={totalTop} x2={boxX+boxW} y2={totalTop} stroke="transparent" strokeWidth={10} cursor="ns-resize" onMouseDown={(e) => startDrag(e, d, isLong ? (targetY < stopY ? 'target' : 'stop') : (stopY < targetY ? 'stop' : 'target'))} style={{pointerEvents: pointerEventsStyle}} />);
                          paths.push(<line key={`${d.id}-resize-bot`} x1={boxX} y1={totalTop+totalH} x2={boxX+boxW} y2={totalTop+totalH} stroke="transparent" strokeWidth={10} cursor="ns-resize" onMouseDown={(e) => startDrag(e, d, isLong ? (targetY > stopY ? 'target' : 'stop') : (stopY > targetY ? 'stop' : 'target'))} style={{pointerEvents: pointerEventsStyle}} />);
                          paths.push(<line key={`${d.id}-resize-entry`} x1={boxX} y1={y1} x2={boxX+boxW} y2={y1} stroke="transparent" strokeWidth={10} cursor="ns-resize" onMouseDown={(e) => startDrag(e, d, 'entry')} style={{pointerEvents: pointerEventsStyle}} />);
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
      
      Object.entries(panePaths).forEach(([k, v]) => { svgOverlayRefs.current[k]?.setPaths(v); });
  };

  useEffect(() => {
      tempPointRef.current = null;
  }, [activeTool]);

  useEffect(() => {
      if (!chartRef.current) return;
      const handleVisibleRangeChange = (range: LogicalRange | null) => {
          if (!range) return;
          requestAnimationFrame(updateDrawings);
          
          // Trigger onLoadMore if scrolling near the beginning of data
          if (range.from < 50 && onLoadMore && !isLoadingHistoryRef.current) {
              isLoadingHistoryRef.current = true;
              onLoadMore();
              // Reset loading ref after a short delay to allow data to load and range to update
              setTimeout(() => {
                  isLoadingHistoryRef.current = false;
              }, 1000);
          }
      };

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
  }, [drawings, data, activeTool, selectedDrawingId, pricePrecision, trades, indicatorValues]);

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
          <SvgOverlay pane="MAIN" ref={el => svgOverlayRefs.current["MAIN"] = el} />
          
          {lotSizeConfig && onLotSizeWidgetDoubleClick && currentPrice !== undefined && (
              <LotSizeWidget 
                  config={lotSizeConfig} 
                  activeSymbol={activeSymbol} 
                  currentPrice={currentPrice} 
                  onDoubleClick={onLotSizeWidgetDoubleClick} 
                  autoConversionPrice={autoConversionPrice}
              />
          )}
      </div>

      {/* INDICATORS */}
      {activeIndicators.map(config => (
          <div key={config.type} className="border-t border-[#27272a] relative bg-[#18181b] group flex flex-col" style={{ height: indicatorHeights[config.type] || 160 }} onMouseMove={(e) => handleMouseMove(e, config.type)}>
              <div className="w-full h-1 bg-[#27272a] hover:bg-blue-500 cursor-row-resize absolute top-0 left-0 z-20 transition-colors" onMouseDown={(e) => handleResizeStart(e, config.type)} />
              
              <div ref={(el) => { if (el) indicatorContainerRefs.current.set(config.type, el); }} className="w-full h-full relative" >
                  {/* SVG OVERLAY FOR INDICATOR */}
                  <SvgOverlay pane={config.type} ref={el => svgOverlayRefs.current[config.type] = el} />
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
