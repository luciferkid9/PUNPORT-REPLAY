
export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  STOP = 'STOP'
}

export enum OrderSide {
  LONG = 'LONG',
  SHORT = 'SHORT'
}

export enum OrderStatus {
  PENDING = 'PENDING',
  OPEN = 'OPEN',
  CLOSED = 'CLOSED'
}

export interface DragTradeUpdate {
    id: string;
    type: 'SL' | 'TP' | 'ENTRY';
    price: number;
}

export interface TradeJournal {
    tags: string[];
    confidence: number; // 1-5
    setupRating: number; // 1-5
    notes: string;
    screenshot?: string; // URL or placeholder
    checklist?: { id: string; label: string; checked: boolean }[];
}

export interface Candle {
  time: number; // Unix Timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface Trade {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  initialStopLoss?: number; // For R:R Calculation
  quantity: number;
  status: OrderStatus;
  entryTime?: number; 
  closeTime?: number;
  closePrice?: number;
  pnl?: number;
  orderTime: number; // Time when the order was placed
  journal?: TradeJournal; // New Journal Data
}

export interface AccountState {
  balance: number;
  equity: number;
  maxEquity: number; // For DD Calculation
  maxDrawdown: number; // In currency
  history: Trade[];
}

export interface SimulationState {
  isPlaying: boolean;
  speed: number; // ms per tick
  currentIndex: number;
  maxIndex: number;
}

export type ToolType = 'CURSOR' | 'TRENDLINE' | 'FIB' | 'LONG_POSITION' | 'SHORT_POSITION' | 'RECTANGLE' | 'KILLZONE' | 'TEXT';
export type IndicatorType = 'EMA' | 'RSI' | 'MACD';

export interface IndicatorConfig {
    id: string; // Unique ID for multiple instances
    type: IndicatorType;
    visible: boolean;
    color?: string; // Main line color
    // MACD Settings
    fastLength?: number;
    slowLength?: number;
    signalLength?: number;
    signalColor?: string; // Signal line color
    histogramColor?: string; // Histogram color
    // RSI Settings
    period?: number;
    upperLevel?: number;
    lowerLevel?: number;
}

export interface Point {
    time: number;
    price: number;
}

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface DrawingSettings {
    color: string;
    lineWidth: number;
    lineStyle: LineStyle;
    fontSize?: number; // For Text Tool
}

export interface FibLevel {
    level: number;
    color: string;
    visible: boolean;
}

export interface SessionConfig {
    enabled: boolean;
    label: string;
    color: string;
    start: string; // HH:MM
    end: string;   // HH:MM
}

export interface KillZoneConfig {
    asian: SessionConfig;
    london: SessionConfig;
    ny: SessionConfig;
    showHighLowLines: boolean; // Line : Top/Bottom
    showAverage: boolean;
    extend: boolean;
    showLabel: boolean;
    opacity: number; // Added opacity control (0-1)
}

export interface DrawingObject {
    id: string;
    symbol: SymbolType; 
    type: ToolType;
    p1: Point;
    p2: Point; 
    visible: boolean;
    locked: boolean;
    color: string;
    lineWidth: number;
    lineStyle: LineStyle;
    text?: string; 
    fontSize?: number; // Added for Text Tool
    fibLevels?: FibLevel[]; 
    // For Position Tools
    stopPrice?: number;
    targetPrice?: number;
    riskAmount?: number;
    // For Kill Zone
    killZoneConfig?: KillZoneConfig;
    // For Multi-Pane support
    pane?: string; // 'MAIN' | 'RSI' | 'MACD' etc.
}

// Updated SymbolType to match Supabase folders
export type SymbolType = 
  | 'AUDUSD' | 'EURAUD' | 'EURJPY' | 'EURUSD' 
  | 'GBPAUD' | 'GBPJPY' | 'GBPUSD' | 'NZDUSD' 
  | 'USDCHF' | 'USDJPY' | 'XAGUSD' | 'XAUUSD'
  | 'CUSTOM'; 

// Removed M1, starting from M2
export type TimeframeType = 'M2' | 'M5' | 'M15' | 'M30' | 'H1' | 'H2' | 'H4' | 'D1';

// --- NEW PROFILE INTERFACE ---
export interface TraderProfile {
    id: string;
    name: string;
    createdAt: number;
    lastPlayed: number;
    timePlayed: number; // Total real-world seconds spent in this session
    
    // State Persistence
    account: AccountState;
    activeSymbol: SymbolType;
    activeTimeframe: TimeframeType;
    currentSimTime: number; // Resume from exact time
    
    // Setup Settings
    selectedSymbols: SymbolType[]; // Only these will show in dashboard
    startDate: number; // Unix timestamp for simulation start
    endDate: number; // Unix timestamp for simulation end
    
    drawings?: DrawingObject[]; // Persist drawings per profile
    
    customDigits?: number; // For CSV data
    lotSizeConfig?: LotSizeConfig; // Persist Lot Size Calculator settings
}

export interface LotSizeConfig {
    show: boolean;
    accountBalance: number;
    stopLossPips: number;
    riskPercent: number;
    currency: string;
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}