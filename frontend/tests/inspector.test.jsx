import {describe, expect, it, vi} from 'vitest';
import Inspector from '../src/components/Inspector';
import {click, render} from './harness';
import {data, replay} from './fixtures';

const baseProps = {
  data, topology: 'protected', edge: data.routes[0], edges: data.routes,
  selected: 'UB--Zuunmod', setSelected: vi.fn(), onSelectEdge: vi.fn(),
  node: null, setNode: vi.fn(), stats: data.topologies.protected.stats, chosen: true,
  name: id => data.cities.find(c => c.id === id)?.name || id,
  busy: '', factor: 1, setFactor: vi.fn(), onFactorSave: vi.fn(), onExclude: vi.fn(),
  onFocus: vi.fn(), onEdit: vi.fn(), onAddNode: vi.fn(), onReset: vi.fn(), onToggleRoute: vi.fn(),
  scope: 'cable', setScope: vi.fn(), onRun: vi.fn(), onClear: vi.fn(),
  replay, corridor: null, evolution: null, stage: 'mst', setStage: vi.fn(),
  source: 'UB', setSource: vi.fn(), target: 'Darkhan', setTarget: vi.fn(),
  onHighlight: vi.fn(), onShowWorstPair: vi.fn(), notify: vi.fn(), onClose: vi.fn(),
};

describe('the inspector', () => {
  it('titles itself after the active scene', async () => {
    const view = await render(<Inspector {...baseProps} scene="resilience" onClose={() => {}}/>);
    expect(view.query('.inspector-head h2').textContent).toContain('Эрсдэл');
  });

  it('offers the failure controls in the resilience scene', async () => {
    const view = await render(<Inspector {...baseProps} scene="resilience" onClose={() => {}}/>);
    const cut = view.queryAll('button').find(node => node.className.includes('btn-danger'));
    expect(cut).toBeTruthy();
    expect(cut.disabled).toBe(false);
  });

  it('says plainly that the protected topology has no bridges', async () => {
    const view = await render(<Inspector {...baseProps} scene="resilience" onClose={() => {}}/>);
    expect(view.text).toContain('bridge байхгүй');
  });

  it('shows the cable facts in the atlas scene', async () => {
    const view = await render(<Inspector {...baseProps} scene="atlas" onClose={() => {}}/>);
    expect(view.text).toContain('Трассын урт');
    expect(view.text).toContain('120.5');
  });

  it('closes on request', async () => {
    const onClose = vi.fn();
    const view = await render(<Inspector {...baseProps} scene="atlas" onClose={onClose}/>);
    await click(view.query('button[aria-label*="хаах"]'));
    expect(onClose).toHaveBeenCalled();
  });
});
