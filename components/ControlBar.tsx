
import React from 'react';
import { SimulationState } from '../types';

interface Props {
  simState: SimulationState;
  onPlayPause: () => void;
  onNext: () => void;
  onSpeedChange: (speed: number) => void;
}

export const ControlBar: React.FC<Props> = ({ 
    simState
}) => {
  return (
    <div className="h-8 flex items-center px-4 justify-between z-20">
      
      {/* Simulation Info */}
      <div className="flex items-center space-x-6 w-full justify-end">
        <div className="flex flex-col items-end min-w-[200px]">
           <div className="flex items-center space-x-3 w-full">
              <span className="text-[8px] text-zinc-500 uppercase font-black tracking-widest whitespace-nowrap">Progress</span>
              <div className="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                <div 
                  className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-300 shadow-[0_0_8px_rgba(59,130,246,0.5)]" 
                  style={{ width: `${(simState.currentIndex / simState.maxIndex) * 100}%` }}
                ></div>
              </div>
              <span className="text-[9px] text-blue-400 font-mono font-bold tracking-tighter tabular-nums w-16 text-right">
                {simState.currentIndex} / {simState.maxIndex}
              </span>
           </div>
        </div>
      </div>
    </div>
  );
};
