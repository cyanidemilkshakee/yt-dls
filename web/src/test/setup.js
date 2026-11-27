import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { randomUUID } from 'node:crypto';

window.matchMedia = query => ({ matches: query.includes('reduced-motion'), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
window.scrollTo = () => {};
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
if (!crypto.randomUUID) crypto.randomUUID = randomUUID;
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); });
