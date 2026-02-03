
// Add React to the imports to resolve namespace errors
import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, MouseEventParams, LogicalRange, IPriceLine } from 'lightweight-charts';
import { Candle, Trade, OrderSide, OrderStatus, ToolType, DrawingObject, Point, IndicatorType, DrawingSettings, SymbolType } from '../types';

interface Props {
  data: Candle[];
  trades: Trade[];
  activeTool: ToolType;
  magnetMode: boolean;
  drawingSettings: DrawingSettings;
  indicators: IndicatorType[];
  // Fix: Add activeSymbol to Props to satisfy DrawingObject requirements
  activeSymbol: SymbolType;
  interval: number; // Added interval prop for accurate time calc
  smaData?: { time: number; value: number }[];
  rsiData?: { time: number; value: number }[];
  macdData?: { macd: { time: number; value: number }[], signal: { time: number; value: number }[], histogram: { time: number; value: number }[] };
  onDrawingCreate?: (d: DrawingObject) => void;
  onDrawingUpdate?: (d: DrawingObject) => void;
  onDrawingEdit?: (d: DrawingObject) => void;
  onDrawingSelect?: (id: string | null) => void;
  onDrawingDelete?: (id: string) => void; // Added onDrawingDelete prop
  onModifyTrade?: (id: string, sl: number, tp: number) => void;
  onLoadMore?: () => void; // New prop for lazy loading
  drawings: DrawingObject[];
  selectedDrawingId: string | null;
  pricePrecision?: number; 
}

export interface ChartRef {
    fitContent: () => void;
}

interface DragState {
    id: string;
    point: 'p1' | 'p2' | 'all' | 'target' | 'stop';
    initialP1: Point;
    initialP2: Point;
    initialTarget?: number;
    initialStop?: number;
    initialMouse: Point;
}

interface DragTradeState {
    id: string;
    type: 'SL' | 'TP';
    startPrice: number;
    currentPrice: number;
}

export const ChartContainer = forwardRef<ChartRef, Props>(({ 
    data, trades, activeTool, magnetMode, drawingSettings, indicators, 
    activeSymbol, interval, // Destructure interval
    smaData, rsiData, macdData, 
    onDrawingCreate, onDrawingUpdate, onDrawingEdit, onDrawingSelect, onDrawingDelete, onModifyTrade, onLoadMore, drawings, selectedDrawingId,
    pricePrecision = 5
}, ref) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const oscContainerRef = useRef<HTMLDivElement>(null); 
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  const chartRef = useRef<IChartApi | null>(null);
  const oscChartRef = useRef<IChartApi | null>(null);

  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  
  const entryLinesRef = useRef<Map<string, IPriceLine>>(new Map());

  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [tempPoint, setTempPoint] = useState<Point | null>(null);
  const [svgPaths, setSvgPaths] = useState<React.ReactNode[]>([]);
  
  const [activeDragObject, setActiveDragObject] = useState<DrawingObject | null>(null);
  const [dragTarget, setDragTarget] = useState<DragState | null>(null);
  
  const [dragTrade, setDragTrade] = useState<DragTradeState | null>(null);

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Refs for props accessed in closures (Fixes Stale Closure Issues)
  const activeToolRef = useRef(activeTool);
  const magnetModeRef = useRef(magnetMode);
  const drawingSettingsRef = useRef(drawingSettings);
  const activeSymbolRef = useRef(activeSymbol);
  const onDrawingCreateRef = useRef(onDrawingCreate);
  const onDrawingSelectRef = useRef(onDrawingSelect);
  const intervalRef = useRef(interval);

  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { magnetModeRef.current = magnetMode; }, [magnetMode]);
  useEffect(() => { drawingSettingsRef.current = drawingSettings; }, [drawingSettings]);
  useEffect(() => { activeSymbolRef.current = activeSymbol; }, [activeSymbol]);
  useEffect(() => { onDrawingCreateRef.current = onDrawingCreate; }, [onDrawingCreate]);
  useEffect(() => { onDrawingSelectRef.current = onDrawingSelect; }, [onDrawingSelect]);
  useEffect(() => { intervalRef.current = interval; }, [interval]);

  // --- KEYBOARD LISTENERS FOR DELETION ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        // Prevent deletion if user is typing in an input field
        if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) {
            return;
        }

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
        if (chartRef.current) {
            chartRef.current.timeScale().fitContent();
        }
    }
  }));

  const getMagnetPrice = (time: number, rawPrice: number): number => {
      if (!magnetModeRef.current) return rawPrice;
      const currentData = dataRef.current;
      const candle = currentData.find(c => c.time === time);
      if (!candle) return rawPrice;
      const distHigh = Math.abs(candle.high - rawPrice);
      const distLow = Math.abs(candle.low - rawPrice);
      return distHigh < distLow ? candle.high : candle.low;
  };

  const getTimeFromLogical = (logical: number): number | null => {
    const currentData = dataRef.current;
    if (!currentData || currentData.length === 0) return null;
    const cleanLogical = Math.round(logical);
    const lastIdx = currentData.length - 1;

    if (cleanLogical >= 0 && cleanLogical <= lastIdx) {
        return currentData[cleanLogical].time;
    }

    const p1 = currentData[lastIdx].time;
    const candleInterval = intervalRef.current || 60; // Use prop interval
    const diff = cleanLogical - lastIdx;
    
    return p1 + (diff * candleInterval);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect && candleSeriesRef.current && chartRef.current) {
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMousePos({ x, y });

      // 1. Handle Trade Line Dragging (SL/TP)
      if (dragTrade) {
          try {
              const price = candleSeriesRef.current.coordinateToPrice(y);
              if (price !== null) {
                  setDragTrade(prev => prev ? { ...prev, currentPrice: price } : null);
              }
          } catch(e) {}
      }

      // 2. Handle Drawing Object Dragging (Fibo, Trendline, Positions)
      if (dragTarget && activeDragObject) {
          const logical = chartRef.current.timeScale().coordinateToLogical(x);
          const rawPrice = candleSeriesRef.current.coordinateToPrice(y);

          if (logical !== null && rawPrice !== null) {
              const time = getTimeFromLogical(logical);
              
              if (time) {
                  // Apply magnet if dragging a specific point, not when moving the whole object (unless we want 'all' to snap too, but usually not)
                  const finalPrice = (dragTarget.point !== 'all' && dragTarget.point !== 'target' && dragTarget.point !== 'stop') 
                        ? getMagnetPrice(time, rawPrice) 
                        : rawPrice;

                  const newObj = { ...activeDragObject };
                  
                  // Delta calculation for moving the entire object
                  const timeDiff = time - dragTarget.initialMouse.time;
                  const priceDiff = finalPrice - dragTarget.initialMouse.price;

                  if (dragTarget.point === 'all') {
                      newObj.p1 = { 
                          time: dragTarget.initialP1.time + timeDiff, 
                          price: dragTarget.initialP1.price + priceDiff 
                      };
                      newObj.p2 = { 
                          time: dragTarget.initialP2.time + timeDiff, 
                          price: dragTarget.initialP2.price + priceDiff 
                      };
                      if (dragTarget.initialTarget !== undefined && newObj.targetPrice !== undefined) {
                          newObj.targetPrice = dragTarget.initialTarget + priceDiff;
                      }
                      if (dragTarget.initialStop !== undefined && newObj.stopPrice !== undefined) {
                          newObj.stopPrice = dragTarget.initialStop + priceDiff;
                      }
                  } else if (dragTarget.point === 'p1') {
                      newObj.p1 = { time: time, price: finalPrice };
                  } else if (dragTarget.point === 'p2') {
                      newObj.p2 = { time: time, price: finalPrice };
                  } else if (dragTarget.point === 'target') {
                      newObj.targetPrice = rawPrice; // Target usually doesn't snap to magnet
                  } else if (dragTarget.point === 'stop') {
                      newObj.stopPrice = rawPrice; // Stop usually doesn't snap to magnet
                  }

                  setActiveDragObject(newObj);
              }
          }
      }
    }
  };
  
  const handleMouseUp = () => {
      // Finish Trade Dragging
      if (dragTrade && onModifyTrade) {
          const trade = trades.find(t => t.id === dragTrade.id);
          if (trade) {
              const newSl = dragTrade.type === 'SL' ? dragTrade.currentPrice : trade.stopLoss;
              const newTp = dragTrade.type === 'TP' ? dragTrade.currentPrice : trade.takeProfit;
              onModifyTrade(dragTrade.id, newSl, newTp);
          }
          setDragTrade(null);
      }
      // Finish Object Dragging
      if (dragTarget && activeDragObject) {
         if (onDrawingUpdate) onDrawingUpdate(activeDragObject);
         setDragTarget(null);
         setActiveDragObject(null);
      }
  };

  // 1. INITIALIZE CHART
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const customTimeFormatter = (time: number) => {
        const date = new Date(time * 1000);
        return date.toLocaleString('th-TH', { 
            timeZone: 'Asia/Bangkok',
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false 
        });
    };

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#18181b' }, textColor: '#a1a1aa' }, // zinc-900 bg, zinc-400 text
      grid: { vertLines: { color: '#27272a' }, horzLines: { color: '#27272a' } }, // zinc-800 grid
      localization: { locale: 'th-TH', dateFormat: 'dd MMM yyyy', timeFormatter: customTimeFormatter },
      timeScale: { borderColor: '#3f3f46', timeVisible: true, secondsVisible: false, rightOffset: 50, barSpacing: 10 },
      rightPriceScale: { borderColor: '#3f3f46' },
      crosshair: { mode: 1, vertLine: { color: '#71717a', labelBackgroundColor: '#3f3f46' }, horzLine: { color: '#71717a', labelBackgroundColor: '#3f3f46' } },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#089981', downColor: '#F23645', borderVisible: false, wickUpColor: '#089981', wickDownColor: '#F23645',
      priceFormat: { type: 'price', precision: pricePrecision, minMove: 1 / Math.pow(10, pricePrecision) },
    });

    const smaSeries = chart.addLineSeries({ 
        color: '#2962ff', lineWidth: 2, title: 'SMA',
        priceFormat: { type: 'price', precision: pricePrecision, minMove: 1 / Math.pow(10, pricePrecision) }
    });

    candleSeriesRef.current = candleSeries;
    smaSeriesRef.current = smaSeries;
    chartRef.current = chart;

    if (dataRef.current.length > 0) {
        candleSeries.setData(dataRef.current as any);
    }
    
    // RE-ADD ENTRIES ON MOUNT (Fix for lines disappearing on symbol switch)
    entryLinesRef.current.clear();
    
    const resizeObserver = new ResizeObserver(entries => {
        if (entries.length === 0 || !entries[0].contentRect) return;
        const { width, height } = entries[0].contentRect;
        chart.applyOptions({ width, height });
    });
    resizeObserver.observe(chartContainerRef.current);

    const handleClick = (param: MouseEventParams) => {
        if (activeToolRef.current === 'CURSOR') {
             if (onDrawingSelectRef.current) onDrawingSelectRef.current(null);
             return;
        }
        if (param.point && chartRef.current && candleSeriesRef.current) {
            const logical = chartRef.current.timeScale().coordinateToLogical(param.point.x);
            let time: number | null = null;
            if (logical !== null) time = getTimeFromLogical(logical);
            if (!time && param.time) time = param.time as number;
            
            // Critical check for tool creation
            if (!time) {
                // If we failed to get time (e.g. empty space click), verify if we can extrapolate
                if (logical !== null) {
                     // Force extrapolation attempt if standard check failed
                     const currentData = dataRef.current;
                     if (currentData.length > 0) {
                         const lastIdx = currentData.length - 1;
                         const p1 = currentData[lastIdx].time;
                         const candleInterval = intervalRef.current || 60;
                         const diff = Math.round(logical) - lastIdx;
                         time = p1 + (diff * candleInterval);
                     }
                }
            }
            
            if (!time) return;

            let rawPrice = candleSeriesRef.current.coordinateToPrice(param.point.y);
            if (rawPrice === null) return;
            const currentData = dataRef.current;
            const isFuture = logical !== null && logical > (currentData.length - 1);
            const finalPrice = (!isFuture) ? getMagnetPrice(time, rawPrice) : rawPrice;
            const clickedPoint: Point = { time: time, price: finalPrice };

            if (['TRENDLINE', 'FIB', 'LONG_POSITION', 'SHORT_POSITION'].includes(activeToolRef.current)) {
                setTempPoint(prev => {
                    if (!prev) return clickedPoint;
                    if (onDrawingCreateRef.current) {
                        const isLong = activeToolRef.current === 'LONG_POSITION';
                        const isShort = activeToolRef.current === 'SHORT_POSITION';
                        let targetPrice = undefined;
                        let stopPrice = undefined;

                        if (isLong || isShort) {
                            const entryP = prev.price;
                            const currentP = clickedPoint.price;
                            
                            // If user just clicks without dragging much (small diff), use default risk
                            const minDiff = entryP * 0.0005;
                            if (Math.abs(currentP - entryP) < minDiff) {
                                // Default Creation
                                const risk = entryP * 0.002; // 0.2% default risk distance
                                stopPrice = isLong ? entryP - risk : entryP + risk;
                                targetPrice = isLong ? entryP + (risk * 2) : entryP - (risk * 2); // 1:2 RR default
                            } else {
                                // Drag Creation: Mouse position defines the STOP LOSS primarily, or Target?
                                // Standard UX: Drag to Target is intuitive.
                                targetPrice = currentP;
                                // Auto set Stop Loss to 1/2 of reward to enforce 1:2 initially, or fixed distance?
                                // Let's make it simpler: Target is mouse, Stop is calculated as 0.5 ratio
                                const reward = Math.abs(targetPrice - entryP);
                                const risk = reward * 0.5;
                                stopPrice = isLong ? entryP - risk : entryP + risk;
                            }
                        }
                        
                        onDrawingCreateRef.current({
                            id: Math.random().toString(36).substr(2, 9),
                            symbol: activeSymbolRef.current, // Use Ref here
                            type: activeToolRef.current,
                            p1: prev, p2: clickedPoint, visible: true, locked: false,
                            color: drawingSettingsRef.current.color, lineWidth: drawingSettingsRef.current.lineWidth, lineStyle: drawingSettingsRef.current.lineStyle,
                            targetPrice, stopPrice
                        });
                    }
                    return null;
                });
            }
        }
    };
    chart.subscribeClick(handleClick);
    return () => {
        resizeObserver.disconnect();
        chart.unsubscribeClick(handleClick);
        chart.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
     if (candleSeriesRef.current) {
         candleSeriesRef.current.applyOptions({
             priceFormat: { type: 'price', precision: pricePrecision, minMove: 1 / Math.pow(10, pricePrecision) }
         });
     }
  }, [pricePrecision]);

  // Update Data for Candle Series
  useEffect(() => {
     if (candleSeriesRef.current) {
        candleSeriesRef.current.setData(data as any);
     }
  }, [data]);

  // Update Data for Indicator Series
  useEffect(() => {
      // SMA
      if (smaSeriesRef.current) {
          if (smaData && smaData.length > 0) {
              smaSeriesRef.current.setData(smaData as any);
              smaSeriesRef.current.applyOptions({ visible: indicators.includes('SMA') });
          } else {
              smaSeriesRef.current.setData([]);
          }
      }

      // RSI
      if (rsiSeriesRef.current && rsiData) {
          rsiSeriesRef.current.setData(rsiData as any);
      }

      // MACD
      if (macdData) {
          if (macdSeriesRef.current) macdSeriesRef.current.setData(macdData.macd as any);
          if (macdSignalSeriesRef.current) macdSignalSeriesRef.current.setData(macdData.signal as any);
          if (macdHistSeriesRef.current) macdHistSeriesRef.current.setData(macdData.histogram as any);
      }
  }, [data, smaData, rsiData, macdData, indicators]);

  // 3. ENTRY LINES LOGIC - FIXED: More robust update trigger
  useEffect(() => {
    if (!candleSeriesRef.current || !chartRef.current) return;
    
    // Convert trades to a string ID signature to force effect re-run if ids change
    const activeTradeIds = new Set(trades.filter(t => t.status !== OrderStatus.CLOSED).map(t => t.id));
    
    // Cleanup old lines that are no longer in the active trade list
    entryLinesRef.current.forEach((line, id) => {
        if (!activeTradeIds.has(id)) {
             try { candleSeriesRef.current?.removePriceLine(line); } catch(e) {}
             entryLinesRef.current.delete(id);
        }
    });

    // Add or Update lines
    trades.forEach(t => {
        if (t.status === OrderStatus.CLOSED) return;
        
        // If line doesn't exist, create it
        if (!entryLinesRef.current.has(t.id)) {
            const isPending = t.status === OrderStatus.PENDING;
            try {
                const line = candleSeriesRef.current!.createPriceLine({ 
                    price: t.entryPrice, 
                    color: isPending ? '#f59e0b' : '#787b86', 
                    lineWidth: 1, 
                    lineStyle: 2, 
                    axisLabelVisible: true, 
                    title: `${isPending ? (t.type === 'LIMIT' ? 'LIMIT' : 'STOP') : 'ENTRY'} #${t.id.substr(0,4)}` 
                });
                entryLinesRef.current.set(t.id, line);
            } catch(e) {}
        } 
    });
  }, [trades, data, pricePrecision]); 

  // Oscillator Logic
  useEffect(() => {
     const needsOsc = indicators.includes('RSI') || indicators.includes('MACD');
     if (!needsOsc) {
         if (oscChartRef.current) { oscChartRef.current.remove(); oscChartRef.current = null; }
         return;
     }
     if (!oscContainerRef.current) return;
     if (oscChartRef.current) oscChartRef.current.remove();
     
     const customTimeFormatter = (time: number) => {
        const date = new Date(time * 1000);
        return date.toLocaleString('th-TH', { 
            timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false 
        });
     };

     const chart = createChart(oscContainerRef.current, {
        layout: { background: { type: ColorType.Solid, color: '#18181b' }, textColor: '#a1a1aa' },
        grid: { vertLines: { color: '#27272a' }, horzLines: { color: '#27272a' } },
        localization: { locale: 'th-TH', dateFormat: 'dd MMM yyyy', timeFormatter: customTimeFormatter },
        timeScale: { borderColor: '#3f3f46', timeVisible: true, visible: true, secondsVisible: false, rightOffset: 50, barSpacing: 10 },
        // UPDATED: Added autoScale: true to allow tiny MACD values to be seen
        rightPriceScale: { borderColor: '#3f3f46', autoScale: true }, 
        crosshair: { mode: 1 },
        width: oscContainerRef.current.clientWidth, height: oscContainerRef.current.clientHeight
      });

      if (indicators.includes('RSI')) {
          rsiSeriesRef.current = chart.addLineSeries({ color: '#7e57c2', lineWidth: 2, title: 'RSI' });
          if (rsiData) rsiSeriesRef.current.setData(rsiData as any);
      }
      
      if (indicators.includes('MACD')) {
          // UPDATED: High Precision format (6 decimals) for MACD
          const macdFormat = { type: 'price', precision: 6, minMove: 0.000001 };
          
          macdHistSeriesRef.current = chart.addHistogramSeries({ 
              color: '#2962ff', title: 'Hist', priceFormat: macdFormat 
          });
          
          macdSeriesRef.current = chart.addLineSeries({ 
              color: '#2962ff', lineWidth: 2, title: 'MACD', priceFormat: macdFormat 
          });
          
          macdSignalSeriesRef.current = chart.addLineSeries({ 
              color: '#f57c00', lineWidth: 2, title: 'Signal', priceFormat: macdFormat 
          });
          
          if (macdData) {
              macdHistSeriesRef.current.setData(macdData.histogram as any);
              macdSeriesRef.current.setData(macdData.macd as any);
              macdSignalSeriesRef.current.setData(macdData.signal as any);
          }
      }
      oscChartRef.current = chart;
      
      const resizeObserver = new ResizeObserver(entries => {
        if (entries.length === 0 || !entries[0].contentRect) return;
        const { width, height } = entries[0].contentRect;
        chart.applyOptions({ width, height });
      });
      resizeObserver.observe(oscContainerRef.current);

      const main = chartRef.current;
      if (main) {
          const syncMainToOsc = (range: LogicalRange | null) => { if (range && oscChartRef.current) oscChartRef.current.timeScale().setVisibleLogicalRange(range); };
          const syncOscToMain = (range: LogicalRange | null) => { if (range && chartRef.current) chartRef.current.timeScale().setVisibleLogicalRange(range); };
          main.timeScale().subscribeVisibleLogicalRangeChange(syncMainToOsc);
          chart.timeScale().subscribeVisibleLogicalRangeChange(syncOscToMain);
          const range = main.timeScale().getVisibleLogicalRange();
          if (range) chart.timeScale().setVisibleLogicalRange(range);
          return () => { 
             resizeObserver.disconnect();
             try { main.timeScale().unsubscribeVisibleLogicalRangeChange(syncMainToOsc); } catch(e) {}
             chart.remove(); oscChartRef.current = null; 
          };
      }
      return () => { resizeObserver.disconnect(); chart.remove(); oscChartRef.current = null; };
  }, [indicators]);

  // --- DRAWING RENDERER (SVG) ---
  const updateDrawings = () => {
      if (!chartRef.current || !candleSeriesRef.current || !chartContainerRef.current) return;
      const newPaths: React.ReactNode[] = [];
      const timeScale = chartRef.current.timeScale();
      
      const getCoord = (time: number) => {
         if (time === null || time === undefined) return -1000;
         const c = timeScale.timeToCoordinate(time as any);
         if (c !== null) return c;
         
         const currentData = dataRef.current;
         if (currentData.length > 0) {
             const lastIndex = currentData.length - 1;
             const lastTime = currentData[lastIndex].time;
             const candleInterval = intervalRef.current || 60; // Use prop interval
             const timeDiff = time - lastTime;
             const indexDiff = timeDiff / candleInterval;
             const logical = lastIndex + indexDiff;
             const coord = timeScale.logicalToCoordinate(logical);
             if (coord !== null) return coord;
         }
         return -1000; 
      }
      
      const safePriceCoord = (price: number) => { 
          if (price === null || price === undefined || isNaN(price)) return -10000;
          try {
              const coord = candleSeriesRef.current!.priceToCoordinate(price); 
              return coord === null ? -10000 : coord; 
          } catch(e) { return -10000; }
      };
      
      const width = chartContainerRef.current.clientWidth;

      // --- TRADE LINES (INTERACTIVE SL/TP) ---
      trades.forEach(t => {
          if (t.status === OrderStatus.CLOSED) return;

          const isDraggingThis = dragTrade && dragTrade.id === t.id;
          
          // SL LINE
          if (t.stopLoss > 0 || (isDraggingThis && dragTrade.type === 'SL')) {
              const price = (isDraggingThis && dragTrade.type === 'SL') ? dragTrade.currentPrice : t.stopLoss;
              const y = safePriceCoord(price);
              if (y > 0 && y < chartContainerRef.current!.clientHeight) {
                  const color = '#F23645';
                  newPaths.push(
                    <g key={`sl-${t.id}`} className="cursor-ns-resize group" style={{pointerEvents: 'auto'}}>
                        <line x1={0} y1={y} x2={width} y2={y} stroke="transparent" strokeWidth={20} style={{pointerEvents: 'stroke', cursor: 'ns-resize'}} onMouseDown={(e) => { e.stopPropagation(); setDragTrade({ id: t.id, type: 'SL', startPrice: t.stopLoss, currentPrice: t.stopLoss }); }} />
                        <line x1={0} y1={y} x2={width} y2={y} stroke={color} strokeDasharray="4 4" strokeWidth={1} style={{pointerEvents: 'none'}} />
                        <g transform={`translate(${width - 65}, ${y - 10})`} style={{pointerEvents: 'none'}}>
                            <rect width="55" height="20" rx="2" fill={color} />
                            <text x="27.5" y="14" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">SL</text>
                        </g>
                    </g>
                  );
              }
          }

          // TP LINE
          if (t.takeProfit > 0 || (isDraggingThis && dragTrade.type === 'TP')) {
              const price = (isDraggingThis && dragTrade.type === 'TP') ? dragTrade.currentPrice : t.takeProfit;
              const y = safePriceCoord(price);
              if (y > 0 && y < chartContainerRef.current!.clientHeight) {
                  const color = '#089981';
                  newPaths.push(
                    <g key={`tp-${t.id}`} className="cursor-ns-resize group" style={{pointerEvents: 'auto'}}>
                        <line x1={0} y1={y} x2={width} y2={y} stroke="transparent" strokeWidth={20} style={{pointerEvents: 'stroke', cursor: 'ns-resize'}} onMouseDown={(e) => { e.stopPropagation(); setDragTrade({ id: t.id, type: 'TP', startPrice: t.takeProfit, currentPrice: t.takeProfit }); }} />
                        <line x1={0} y1={y} x2={width} y2={y} stroke={color} strokeDasharray="4 4" strokeWidth={1} style={{pointerEvents: 'none'}} />
                        <g transform={`translate(${width - 65}, ${y - 10})`} style={{pointerEvents: 'none'}}>
                            <rect width="55" height="20" rx="2" fill={color} />
                            <text x="27.5" y="14" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">TP</text>
                        </g>
                    </g>
                  );
              }
          }
      });

      // --- DRAWINGS ---
      const displayDrawings = drawings.map(d => (activeDragObject && d.id === activeDragObject.id) ? activeDragObject : d);
      displayDrawings.forEach(d => {
          if (!d.visible) return;
          const x1 = getCoord(d.p1.time), x2 = getCoord(d.p2.time), y1 = safePriceCoord(d.p1.price), y2 = safePriceCoord(d.p2.price);
          const isSelected = d.id === selectedDrawingId;
           const handleObjectMouseDown = (point: DragState['point']) => (e: React.MouseEvent) => {
              if (d.locked) return; e.stopPropagation(); e.preventDefault();
              const rect = chartContainerRef.current!.getBoundingClientRect();
              const logical = chartRef.current!.timeScale().coordinateToLogical(e.clientX - rect.left);
              const time = logical !== null ? getTimeFromLogical(logical) : null;
              try {
                  const price = candleSeriesRef.current!.coordinateToPrice(e.clientY - rect.top);
                  if (time && price !== null) { 
                      setDragTarget({ id: d.id, point, initialP1: { ...d.p1 }, initialP2: { ...d.p2 }, initialTarget: d.targetPrice, initialStop: d.stopPrice, initialMouse: { time, price } }); 
                      setActiveDragObject(d); 
                      if (onDrawingSelect) onDrawingSelect(d.id); 
                  }
              } catch(e) {}
          };
          const commonProps = { 
              onClick: (e: React.MouseEvent) => { e.stopPropagation(); if (onDrawingSelect) onDrawingSelect(d.id); }, 
              onDoubleClick: (e: React.MouseEvent) => { e.stopPropagation(); if (onDrawingEdit) onDrawingEdit(d); }, 
              style: { pointerEvents: 'auto' as const, cursor: d.locked ? 'default' : 'pointer' } 
          };
          
          if (d.type === 'TRENDLINE') {
              newPaths.push(<line key={d.id+'hit'} x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={10} onMouseDown={handleObjectMouseDown('all')} {...commonProps} />);
              newPaths.push(<line key={d.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={isSelected ? 'white' : d.color} strokeWidth={d.lineWidth} strokeDasharray={d.lineStyle === 'dashed' ? '8 4' : d.lineStyle === 'dotted' ? '2 2' : ''} style={{pointerEvents: 'none'}} />);
          } else if (d.type === 'FIB') {
               const diff = d.p2.price - d.p1.price, minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
              newPaths.push(<line key={d.id+'main-hit'} x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={10} onMouseDown={handleObjectMouseDown('all')} {...commonProps} />);
              newPaths.push(<line key={d.id+'main'} x1={x1} y1={y1} x2={x2} y2={y2} stroke={d.color} strokeWidth={1} strokeDasharray="4 4" opacity={0.5} style={{pointerEvents: 'none'}} />);
              (d.fibLevels || []).filter(l => l.visible).forEach((l, idx) => {
                  const y = safePriceCoord(d.p1.price + (diff * l.level));
                  newPaths.push(<line key={d.id+idx+'hit'} x1={minX} y1={y} x2={maxX} y2={y} stroke="transparent" strokeWidth={10} onMouseDown={handleObjectMouseDown('all')} {...commonProps} />);
                  newPaths.push(<g key={d.id+idx} style={{pointerEvents:'none'}}><line x1={minX} y1={y} x2={maxX} y2={y} stroke={l.color} strokeWidth={1} opacity={0.8}/><text x={minX} y={y-2} fill={l.color} fontSize="11" fontWeight="bold">{l.level}</text></g>);
              });
          } else if (d.type === 'LONG_POSITION' || d.type === 'SHORT_POSITION') {
              const isLong = d.type === 'LONG_POSITION';
              const targetPrice = d.targetPrice || d.p1.price;
              const stopPrice = d.stopPrice || d.p1.price;
              const targetY = safePriceCoord(targetPrice);
              const stopY = safePriceCoord(stopPrice);
              const minX = Math.min(x1, x2), maxX = Math.max(x1, x2), rW = Math.max(2, maxX - minX);
              const tpColor = '#089981';
              const slColor = '#F23645';
              const entryP = d.p1.price;
              const risk = Math.abs(entryP - stopPrice);
              const reward = Math.abs(targetPrice - entryP);
              const rr = risk === 0 ? 0 : reward / risk;

              newPaths.push(<rect key={d.id+'tp'} x={minX} y={Math.min(y1, targetY)} width={rW} height={Math.abs(y1 - targetY)} fill={tpColor + '20'} stroke={tpColor} strokeWidth={1} onMouseDown={handleObjectMouseDown('all')} {...commonProps} />);
              newPaths.push(<rect key={d.id+'sl'} x={minX} y={Math.min(y1, stopY)} width={rW} height={Math.abs(y1 - stopY)} fill={slColor + '20'} stroke={slColor} strokeWidth={1} onMouseDown={handleObjectMouseDown('all')} {...commonProps} />);
              const labelX = maxX + 4;
              const precision = pricePrecision || 5;
              newPaths.push(
                  <g key={d.id+'lbl-en'} style={{pointerEvents: 'none'}}>
                      <rect x={labelX} y={y1 - 10} width="70" height="20" rx="3" fill="#3f3f46" />
                      <text x={labelX + 6} y={y1 + 5} fill="white" fontSize="12" fontFamily="monospace" fontWeight="bold">{entryP.toFixed(precision)}</text>
                  </g>
              );
              newPaths.push(
                  <g key={d.id+'lbl-tp'} style={{pointerEvents: 'none'}}>
                       <rect x={labelX} y={targetY - 10} width="110" height="20" rx="3" fill={tpColor} />
                       <text x={labelX + 6} y={targetY + 5} fill="white" fontSize="12" fontFamily="monospace" fontWeight="bold">TP: {targetPrice.toFixed(precision)}</text>
                  </g>
              );
              newPaths.push(
                  <g key={d.id+'lbl-sl'} style={{pointerEvents: 'none'}}>
                       <rect x={labelX} y={stopY - 10} width="110" height="20" rx="3" fill={slColor} />
                       <text x={labelX + 6} y={stopY + 5} fill="white" fontSize="12" fontFamily="monospace" fontWeight="bold">SL: {stopPrice.toFixed(precision)}</text>
                  </g>
              );
              newPaths.push(
                  <g key={d.id+'lbl-rr'} style={{pointerEvents: 'none'}}>
                      <text x={minX + rW/2} y={y1 - (y1-targetY)/2} fill={tpColor} fontSize="12" fontWeight="black" textAnchor="middle" opacity={0.8}>Reward</text>
                      <text x={minX + rW/2} y={y1 - (y1-stopY)/2} fill={slColor} fontSize="12" fontWeight="black" textAnchor="middle" opacity={0.8}>Risk</text>
                      <g transform={`translate(${minX + rW/2}, ${y1})`}>
                          <rect x="-35" y="-11" width="70" height="22" rx="4" fill="#18181b" stroke="#3f3f46" strokeWidth="1" />
                          <text x="0" y="5" fill="white" fontSize="12" fontWeight="bold" textAnchor="middle">R: {rr.toFixed(2)}</text>
                      </g>
                  </g>
              );
              if (isSelected && !d.locked) {
                  newPaths.push(<circle key={d.id+'ht'} cx={minX+rW/2} cy={targetY} r={5} fill="white" stroke={tpColor} strokeWidth="2" onMouseDown={handleObjectMouseDown('target')} style={{cursor:'ns-resize', pointerEvents:'auto'}} />);
                  newPaths.push(<circle key={d.id+'hs'} cx={minX+rW/2} cy={stopY} r={5} fill="white" stroke={slColor} strokeWidth="2" onMouseDown={handleObjectMouseDown('stop')} style={{cursor:'ns-resize', pointerEvents:'auto'}} />);
              }
          }
          if (isSelected && !d.locked) {
              newPaths.push(<circle key={d.id+'p1'} cx={x1} cy={y1} r={6} fill={d.color} stroke="white" onMouseDown={handleObjectMouseDown('p1')} style={{cursor:'move', pointerEvents:'auto'}} />);
              const p2Cy = (d.type === 'LONG_POSITION' || d.type === 'SHORT_POSITION') ? y1 : y2;
              newPaths.push(<circle key={d.id+'p2'} cx={x2} cy={p2Cy} r={6} fill={d.color} stroke="white" onMouseDown={handleObjectMouseDown('p2')} style={{cursor:'move', pointerEvents:'auto'}} />);
          }
      });
      // ... Temp point preview ...
      if (tempPoint && activeToolRef.current !== 'CURSOR') {
           const logical = chartRef.current.timeScale().coordinateToLogical(mousePos.x);
          const currentT = logical !== null ? getTimeFromLogical(logical) : null;
          try {
              const currentP = candleSeriesRef.current.coordinateToPrice(mousePos.y);
              if (currentT && currentP !== null) {
                  const tx1 = getCoord(tempPoint.time), tx2 = getCoord(currentT);
                  const ty1 = safePriceCoord(tempPoint.price), ty2 = safePriceCoord(currentP);
                  newPaths.push(<line key="preview" x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke={drawingSettingsRef.current.color} strokeWidth={1} strokeDasharray="5 5" opacity={0.7} />);
              }
          } catch(e) {}
      }
      setSvgPaths(newPaths);
  };
  
  useEffect(() => {
      if (!chartRef.current) return;
      
      const handleVisibleRangeChange = (range: LogicalRange | null) => {
          if (!range) return;
          requestAnimationFrame(updateDrawings);
          
          if (range.from < 5 && onLoadMore) {
              onLoadMore();
          }
      };

      chartRef.current.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
      const ro = new ResizeObserver(() => requestAnimationFrame(updateDrawings));
      if (chartContainerRef.current) ro.observe(chartContainerRef.current);
      updateDrawings();
      
      return () => { 
          try { chartRef.current?.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange); } catch(e) {} 
          ro.disconnect(); 
      };
  }, [drawings, data, activeTool, selectedDrawingId, dragTarget, tempPoint, mousePos, activeDragObject, pricePrecision, dragTrade, trades, onLoadMore]);

  return (
    <div ref={wrapperRef} className="w-full h-full flex flex-col relative" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      <div className="relative flex-1 min-h-0">
          <div ref={chartContainerRef} className="w-full h-full" />
          <svg className="absolute top-0 left-0 w-full h-full z-10 overflow-hidden" style={{pointerEvents: 'none'}}>{svgPaths}</svg>
      </div>
      {(indicators.includes('RSI') || indicators.includes('MACD')) && (
          <div className="h-40 border-t border-[#27272a] relative flex flex-col bg-[#18181b]">
              <div ref={oscContainerRef} className="flex-1 w-full min-h-0" />
          </div>
      )}
    </div>
  );
});
