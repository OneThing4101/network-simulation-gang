import {describe, expect, it} from 'vitest';
import {COLORS, LAYER_GROUPS, SCENES, TOPOLOGIES, fmt, fmtKm, fmtMs} from '../src/constants';

describe('the assignment topology colours', () => {
  it('keeps MST red, 2-edge blue and full mesh green', () => {
    expect(COLORS.mst).toBe('#D64545');
    expect(COLORS.protected).toBe('#2F6FD0');
    expect(COLORS.full).toBe('#2E8B5B');
  });

  it('names exactly the three topologies the assignment asks for', () => {
    expect(TOPOLOGIES.map(t => t.key)).toEqual(['mst', 'protected', 'full']);
  });
});

describe('the scene list', () => {
  it('covers the six scenes of the studio', () => {
    expect(SCENES.map(s => s.key)).toEqual(['atlas', 'evolution', 'resilience', 'cost', 'data', 'method']);
  });

  it('gives every scene a label and a hint', () => {
    for (const scene of SCENES) {
      expect(scene.label.length).toBeGreaterThan(0);
      expect(scene.hint.length).toBeGreaterThan(0);
    }
  });
});

describe('the layer control', () => {
  it('groups the layers instead of listing nine equal buttons', () => {
    expect(LAYER_GROUPS.length).toBeGreaterThan(1);
    const keys = LAYER_GROUPS.flatMap(group => group.layers.map(([key]) => key));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('the number formatters', () => {
  it('shows a dash instead of an invented zero', () => {
    expect(fmt(null)).toBe('—');
    expect(fmtKm(null)).toBe('—');
    expect(fmtMs(null)).toBe('—');
  });

  it('keeps thousands separated and rounds to the requested precision', () => {
    expect(fmt(9087.74)).toBe('9,088');
    expect(fmt(28.291, 1)).toBe('28.3');
    expect(fmt(9087.7, 1)).toBe('9,087.7');
  });

  it('keeps the unit attached to the number', () => {
    expect(fmtKm(120.5, 1)).toBe('120.5 км');
    expect(fmtMs(28.29, 2)).toBe('28.29 мс');
  });
});
