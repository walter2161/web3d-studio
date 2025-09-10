import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { 
  Play, 
  Pause, 
  Square, 
  SkipBack, 
  SkipForward,
  Circle
} from 'lucide-react';

interface TimelineProps {
  currentFrame: number;
  totalFrames: number;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onFrameChange: (frame: number) => void;
  onSetKeyframe: () => void;
}

export const Timeline = ({
  currentFrame,
  totalFrames,
  isPlaying,
  onPlay,
  onPause,
  onStop,
  onFrameChange,
  onSetKeyframe
}: TimelineProps) => {
  const [frameRange, setFrameRange] = useState([0, totalFrames]);

  return (
    <div className="h-20 bg-timeline border-t border-panel-border px-4 py-2">
      <div className="flex items-center gap-4 mb-2">
        {/* Transport Controls */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0 bg-gradient-button border-panel-border hover:bg-menu-hover"
            onClick={onStop}
          >
            <Square className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0 bg-gradient-button border-panel-border hover:bg-menu-hover"
            onClick={isPlaying ? onPause : onPlay}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* Frame Navigation */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0 bg-gradient-button border-panel-border hover:bg-menu-hover"
            onClick={() => onFrameChange(Math.max(0, currentFrame - 1))}
          >
            <SkipBack className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0 bg-gradient-button border-panel-border hover:bg-menu-hover"
            onClick={() => onFrameChange(Math.min(totalFrames, currentFrame + 1))}
          >
            <SkipForward className="w-4 h-4" />
          </Button>
        </div>

        {/* Current Frame */}
        <div className="text-xs font-mono bg-timeline-track px-2 py-1 rounded border border-panel-border">
          {currentFrame} / {totalFrames}
        </div>

        {/* Keyframe Button */}
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-3 bg-gradient-button border-panel-border hover:bg-menu-hover"
          onClick={onSetKeyframe}
        >
          <Circle className="w-3 h-3 mr-1 fill-timeline-keyframe" />
          <span className="text-xs">Key</span>
        </Button>

        {/* Auto Key Toggle */}
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-3 bg-gradient-button border-panel-border hover:bg-menu-hover"
        >
          <span className="text-xs">Auto Key</span>
        </Button>
      </div>

      {/* Timeline Track */}
      <div className="relative">
        <Slider
          value={[currentFrame]}
          onValueChange={(value) => onFrameChange(value[0])}
          max={totalFrames}
          step={1}
          className="w-full"
        />
        
        {/* Frame Markers */}
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>0</span>
          <span>{Math.floor(totalFrames / 4)}</span>
          <span>{Math.floor(totalFrames / 2)}</span>
          <span>{Math.floor(3 * totalFrames / 4)}</span>
          <span>{totalFrames}</span>
        </div>
      </div>
    </div>
  );
};