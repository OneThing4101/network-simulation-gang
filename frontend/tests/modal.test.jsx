import {describe, expect, it, vi} from 'vitest';
import NodeModal from '../src/components/NodeModal';
import {click, render} from './harness';

const modal = {type: 'new'};

describe('the node dialog', () => {
  it('is announced as a dialog', async () => {
    const view = await render(<NodeModal modal={modal} busy="" error="" onClose={() => {}} onSubmit={() => {}} onPickOnMap={() => {}} onDelete={() => {}} onReset={() => {}}/>);
    const dialog = view.query('[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBeTruthy();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    await render(<NodeModal modal={modal} busy="" error="" onClose={onClose} onSubmit={() => {}} onPickOnMap={() => {}} onDelete={() => {}} onReset={() => {}}/>);
    document.dispatchEvent(new window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the focus inside the dialog', async () => {
    await render(<NodeModal modal={modal} busy="" error="" onClose={() => {}} onSubmit={() => {}} onPickOnMap={() => {}} onDelete={() => {}} onReset={() => {}}/>);
    const dialog = document.querySelector('[role="dialog"]');
    const focusable = [...dialog.querySelectorAll('button, input, select, textarea, a[href]')];
    expect(focusable.length).toBeGreaterThan(1);
    focusable[focusable.length - 1].focus();
    const event = new window.KeyboardEvent('keydown', {key: 'Tab', bubbles: true, cancelable: true});
    dialog.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('offers the map picker and hands the values on', async () => {
    const onPickOnMap = vi.fn();
    const view = await render(<NodeModal modal={modal} busy="" error="" onClose={() => {}} onSubmit={() => {}} onPickOnMap={onPickOnMap} onDelete={() => {}} onReset={() => {}}/>);
    const pick = view.queryAll('button').find(node => node.textContent.includes('Газрын зураг'));
    await click(pick);
    expect(onPickOnMap).toHaveBeenCalled();
    expect(onPickOnMap.mock.calls[0][0]).toHaveProperty('lat');
  });

  it('shows the error the server returned', async () => {
    const view = await render(<NodeModal modal={modal} busy="" error="Зангилаа олдсонгүй." onClose={() => {}} onSubmit={() => {}} onPickOnMap={() => {}} onDelete={() => {}} onReset={() => {}}/>);
    expect(view.text).toContain('Зангилаа олдсонгүй.');
  });

  it('renders nothing when no dialog is open', async () => {
    const view = await render(<NodeModal modal={null} busy="" error="" onClose={() => {}} onSubmit={() => {}} onPickOnMap={() => {}} onDelete={() => {}} onReset={() => {}}/>);
    expect(view.container.innerHTML).toBe('');
  });
});
