import {describe, expect, it, vi} from 'vitest';
import FailureTimeline from '../src/components/FailureTimeline';
import {click, render} from './harness';
import {replay} from './fixtures';

describe('the failure timeline', () => {
  it('renders one stop per computed frame', async () => {
    const view = await render(<FailureTimeline replay={replay} reducedMotion={false} onReset={() => {}}/>);
    const stops = view.queryAll('.timeline-step');
    expect(stops).toHaveLength(replay.frames.length);
    expect(stops[0].textContent).toContain('Эхний төлөв');
    expect(stops[2].textContent).toContain('Нөөц зам');
  });

  it('starts on the first frame and marks the earlier ones as done when it moves', async () => {
    const view = await render(<FailureTimeline replay={replay} reducedMotion={false} onReset={() => {}}/>);
    expect(view.queryAll('.timeline-step')[0].dataset.state).toBe('current');
    await click(view.queryAll('.timeline-step')[2]);
    const states = view.queryAll('.timeline-step').map(node => node.dataset.state);
    expect(states).toEqual(['done', 'done', 'current', 'todo']);
  });

  it('shows the caption of the frame that is on screen', async () => {
    const view = await render(<FailureTimeline replay={replay} reducedMotion={false} onReset={() => {}}/>);
    expect(view.query('.timeline-caption').textContent).toContain('27 кабель');
    await click(view.queryAll('.timeline-step')[2]);
    expect(view.query('.timeline-caption').textContent).toContain('773 км');
  });

  it('offers a reset and reports it', async () => {
    const onReset = vi.fn();
    const view = await render(<FailureTimeline replay={replay} reducedMotion={false} onReset={onReset}/>);
    const reset = view.queryAll('.timeline-controls button').at(-1);
    await click(reset);
    expect(onReset).toHaveBeenCalled();
  });

  it('disables the play control when the reader asked for reduced motion', async () => {
    const view = await render(<FailureTimeline replay={replay} reducedMotion={true} onReset={() => {}}/>);
    const play = view.queryAll('.timeline-controls button').find(node => /Үргэлжлүүлэх/.test(node.getAttribute('aria-label') || ''));
    expect(play).toBeTruthy();
    expect(play.disabled).toBe(true);
  });

  it('renders nothing when there is no failure', async () => {
    const view = await render(<FailureTimeline replay={null} reducedMotion={false} onReset={() => {}}/>);
    expect(view.container.innerHTML).toBe('');
  });
});
