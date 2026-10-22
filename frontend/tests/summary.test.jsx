import {describe, expect, it} from 'vitest';
import SummaryStrip from '../src/components/SummaryStrip';
import {render} from './harness';
import {data} from './fixtures';

describe('the summary strip', () => {
  it('shows the headline numbers of the active topology', async () => {
    const view = await render(<SummaryStrip stats={data.topologies.protected.stats} topology="protected" cities={22}/>);
    expect(view.text).toContain('27');
    expect(view.text).toContain('9,088');
    expect(view.text).toContain('28.3');
    expect(view.text).toContain('11,239');
    expect(view.text).toContain('22');
  });

  it('marks a topology that still has bridges as failing', async () => {
    const view = await render(<SummaryStrip stats={data.topologies.mst.stats} topology="mst" cities={22}/>);
    const bridge = view.queryAll('.metric').find(node => node.textContent.includes('Bridge'));
    expect(bridge.dataset.tone).toBe('fail');
    expect(bridge.textContent).toContain('21');
  });

  it('says the topology cannot be built instead of showing empty numbers', async () => {
    const view = await render(<SummaryStrip stats={null} topology="protected" cities={22}/>);
    expect(view.text).toContain('Байгуулах боломжгүй');
    expect(view.text).not.toContain('NaN');
    expect(view.text).not.toContain('undefined');
  });
});
