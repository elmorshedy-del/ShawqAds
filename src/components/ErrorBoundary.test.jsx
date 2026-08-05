// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary, ErrorBoundary } from './ErrorBoundary.jsx';

function Boom({ shouldThrow = true }) {
  if (shouldThrow) throw new Error('order_lines is not iterable');
  return <p>recovered panel</p>;
}

beforeEach(() => {
  // React logs caught render errors; the boundary logs its own line too.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('replaces only the failing panel and keeps its siblings mounted', () => {
    render(
      <div>
        <ErrorBoundary label="Conversion funnel">
          <Boom />
        </ErrorBoundary>
        <p>sibling panel</p>
      </div>,
    );

    expect(screen.getByText('Conversion funnel could not render')).toBeTruthy();
    expect(screen.getByText('order_lines is not iterable')).toBeTruthy();
    expect(screen.getByText('sibling panel')).toBeTruthy();
  });

  it('retries the panel when the operator asks for it', () => {
    let shouldThrow = true;
    function Retryable() {
      return <Boom shouldThrow={shouldThrow} />;
    }

    const { rerender } = render(
      <ErrorBoundary label="Live sales monitor">
        <Retryable />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Live sales monitor could not render')).toBeTruthy();

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    rerender(
      <ErrorBoundary label="Live sales monitor">
        <Retryable />
      </ErrorBoundary>,
    );
    expect(screen.getByText('recovered panel')).toBeTruthy();
  });

  it('keeps the page from going blank when the whole app throws', () => {
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );

    expect(screen.getByText('The dashboard could not render')).toBeTruthy();
    expect(screen.getByText('order_lines is not iterable')).toBeTruthy();
  });
});
