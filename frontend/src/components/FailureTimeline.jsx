import {useEffect, useState} from 'react';
import {ChevronLeft, ChevronRight, Pause, Play, RotateCcw, SkipBack, SkipForward} from 'lucide-react';

const SPEEDS = [{label: '0.5×', ms: 2400}, {label: '1×', ms: 1200}, {label: '2×', ms: 600}];

// The failure timeline. It plays back frames the engine computed — the motion
// is the state change, not a decorative animation.
export default function FailureTimeline({replay, onReset, reducedMotion}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const frames = replay?.frames || [];

  useEffect(() => { setIndex(0); setPlaying(false); }, [replay]);

  useEffect(() => {
    if (!playing || reducedMotion) return;
    if (index >= frames.length - 1) { setPlaying(false); return; }
    const timer = setTimeout(() => setIndex(value => value + 1), SPEEDS[speed].ms);
    return () => clearTimeout(timer);
  }, [playing, index, speed, frames.length, reducedMotion]);

  if (!replay || !frames.length) return null;
  const current = frames[Math.min(index, frames.length - 1)];

  return <div className="overlay overlay-panel timeline" role="group" aria-label="Тасралтын хугацааны шугам">
    <div className="timeline-track">
      {frames.map((frame, position) => {
        const state = position < index ? 'done' : position === index ? 'current' : 'todo';
        return <button
          key={frame.key}
          className="timeline-step"
          data-state={state}
          onClick={() => { setIndex(position); setPlaying(false); }}
          aria-current={position === index}>
          <i className="bead"/>
          <span>{frame.title}</span>
        </button>;
      })}
    </div>

    <div className="timeline-caption">
      <b>{current.title}.</b>
      <span>{current.caption}</span>
    </div>

    <div className="timeline-controls">
      <button onClick={() => { setIndex(0); setPlaying(false); }} aria-label="Эхний хүрээ" disabled={index === 0}><SkipBack size={13}/></button>
      <button onClick={() => { setIndex(i => Math.max(0, i - 1)); setPlaying(false); }} aria-label="Өмнөх хүрээ" disabled={index === 0}><ChevronLeft size={13}/></button>
      <button onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Түр зогсоох' : 'Үргэлжлүүлэх'} disabled={reducedMotion}>
        {playing ? <Pause size={13}/> : <Play size={13}/>}
      </button>
      <button onClick={() => { setIndex(i => Math.min(frames.length - 1, i + 1)); setPlaying(false); }} aria-label="Дараагийн хүрээ" disabled={index >= frames.length - 1}><ChevronRight size={13}/></button>
      <button onClick={() => { setIndex(frames.length - 1); setPlaying(false); }} aria-label="Сүүлийн хүрээ" disabled={index >= frames.length - 1}><SkipForward size={13}/></button>
      <div className="speed">
        {SPEEDS.map((item, position) => <button key={item.label} aria-pressed={speed === position} onClick={() => setSpeed(position)}>{item.label}</button>)}
      </div>
      <button onClick={onReset} aria-label="Тасралтыг арилгах"><RotateCcw size={13}/></button>
    </div>
  </div>;
}
