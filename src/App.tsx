import React from 'react';
import { TradeProvider } from './context/TradeContext';
import { DashboardLayout } from './components/Dashboard';

export default function App() {
  return (
    <TradeProvider>
      <DashboardLayout />
    </TradeProvider>
  );
}
