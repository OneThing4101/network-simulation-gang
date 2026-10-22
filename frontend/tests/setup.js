// A DOM for the component tests. Leaflet is not exercised here; the map is
// covered by the browser tests, which run against the real engine.
import {afterEach} from 'vitest';
import {cleanup} from './harness';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => cleanup());
