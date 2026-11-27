'use client';

import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Component, ErrorInfo, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  logToolExecutionFailure,
  type ToolExecutionFailureLog,
} from '@/lib/tool-execution-logger';

export type { ToolExecutionFailureLog };

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  toolName?: string;
  className?: string;
  /** Optional callback receiving the raw Error and structured failure log payload. */
  onError?: (error: Error, log: ToolExecutionFailureLog) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const structuredLog = logToolExecutionFailure({
      toolName: this.props.toolName ?? 'UnknownTool',
      action: 'render',
      error,
      componentStack: errorInfo.componentStack ?? undefined,
    });
    console.error(`[ErrorBoundary${this.props.toolName ? `:${this.props.toolName}` : ''}]`, error, errorInfo);
    this.props.onError?.(error, structuredLog);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const toolLabel = this.props.toolName ? ` in ${this.props.toolName}` : '';
      const errorMessage =
        this.state.error?.message || 'An unexpected error occurred while rendering this component.';

      return (
        <div
          className={cn(
            'rounded-xl border border-destructive/30 bg-destructive/5 p-6 flex flex-col items-center justify-center text-center',
            this.props.className,
          )}
          role="alert"
          aria-live="assertive"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mb-4">
            <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-foreground mb-1">
            Something went wrong{toolLabel}
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mb-4 break-words">
            {errorMessage}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted transition-colors"
            >
              <Home className="h-3.5 w-3.5" aria-hidden="true" />
              Go home
            </button>
          </div>
          {process.env.NODE_ENV === 'development' && this.state.error?.stack && (
            <details className="mt-4 w-full text-left">
              <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground">
                Developer stack trace
              </summary>
              <pre className="mt-2 p-3 rounded-lg bg-muted/50 text-[10px] font-mono overflow-x-auto max-h-60 overflow-y-auto text-muted-foreground">
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
