import { Component } from 'react';

/**
 * React unmounts the entire tree when a render throws and nothing catches it —
 * the dashboard paints once and then goes blank, with the cause visible only in
 * the browser console. These boundaries keep a failure local and readable: the
 * panel that threw is replaced by a card naming it, and the rest of the page
 * keeps working.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the full stack in the console for anyone with devtools open; the card
    // below only shows the message so the layout stays readable.
    console.error(`[dashboard] ${this.props.label || 'render'} failed`, error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const label = this.props.label || 'This section';
    const card = (
      <div className="panel border border-destructive/40 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-destructive">
          {label} could not render
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {this.props.fullPage
            ? 'The dashboard stopped before it could draw. The message below identifies what broke it.'
            : 'The rest of the dashboard is unaffected. The message below identifies what broke this panel.'}
        </p>
        <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs text-muted-foreground">
          {String(error?.message || error)}
        </pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Reload page
          </button>
        </div>
      </div>
    );

    if (!this.props.fullPage) return card;
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        {card}
      </div>
    );
  }
}

/**
 * Top-level guard. A throw in App's data preparation happens before any section
 * renders, so a per-section boundary cannot catch it — this one keeps the page
 * from going blank in that case too.
 */
export function AppErrorBoundary({ children }) {
  return (
    <ErrorBoundary label="The dashboard" fullPage>
      {children}
    </ErrorBoundary>
  );
}
