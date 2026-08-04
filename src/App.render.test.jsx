// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

const offlineResponse = {
  ok: false,
  status: 503,
  json: async () => ({}),
  text: async () => JSON.stringify({ error: 'fixture offline' }),
};

beforeEach(() => {
  global.fetch = vi.fn(async () => offlineResponse);
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  global.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia = vi.fn(() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 100, height: 20 });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('dashboard tab rendering', () => {
  it('mounts and renders every top-level tab without throwing', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sales & Ads Performance' })).toBeTruthy();
    });
    expect(screen.getAllByRole('tab')).toHaveLength(4);

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Overview' }), { key: 'ArrowRight' });
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Media' }).getAttribute('aria-selected')).toBe('true');
    });

    const tabs = [
      ['Overview', 'Key findings'],
      ['Media', 'Media actions'],
      ['Conversion', 'Conversion signals'],
      ['Demand', 'Demand signals'],
    ];

    for (const [tab, evidence] of tabs) {
      fireEvent.click(screen.getByRole('tab', { name: tab }));
      await waitFor(() => {
        expect(screen.getAllByText(evidence, { exact: false }).length).toBeGreaterThan(0);
      });
    }
  });
});
