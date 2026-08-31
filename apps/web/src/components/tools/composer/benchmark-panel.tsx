'use client';

import { useState } from 'react';
import { Zap, Play, Loader2, AlertTriangle, CheckCircle2, History, BarChart3, ArrowUpDown } from 'lucide-react';

interface BenchmarkPanelProps {
  xdr: string;
  network: 'testnet' | 'mainnet';
}

export function BenchmarkPanel({ xdr, network }: BenchmarkPanelProps) {
  const [transactionCount, setTransactionCount] = useState(10);
  const [concurrency, setConcurrency] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  const runBenchmark = async () => {
    if (!xdr) {
      setError('Please build and sign a transaction first.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${API_BASE}/composer/benchmark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          xdr,
          network,
          transactionCount,
          concurrency,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Benchmark execution failed');
      }

      const data = await res.json();
      setResult(data);
      setHistory((prev) => [data, ...prev].slice(0, 5));
    } catch (err: any) {
      setError(err.message || 'Failed to run benchmark');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Transaction Submission Benchmark</h2>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 bg-primary/10 text-primary rounded-full uppercase">
            {network}
          </span>
        </div>

        <p className="text-sm text-muted-foreground">
          Measure throughput (tx/s), latency distributions (p50/p95/p99), and detect sequence number conflicts under concurrent submissions.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Transaction Count ({transactionCount})
            </label>
            <input
              type="range"
              min="1"
              max="50"
              value={transactionCount}
              onChange={(e) => setTransactionCount(parseInt(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>1 tx</span>
              <span>25 tx</span>
              <span>50 tx (Safe Limit)</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Concurrency Level ({concurrency})
            </label>
            <input
              type="range"
              min="1"
              max="20"
              value={concurrency}
              onChange={(e) => setConcurrency(parseInt(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>1</span>
              <span>10</span>
              <span>20 concurrent</span>
            </div>
          </div>
        </div>

        <div className="pt-3">
          <button
            onClick={runBenchmark}
            disabled={loading || !xdr}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running Benchmark...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-current" />
                Run Benchmark Suite
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-6">
          <div className="border rounded-xl bg-card p-6 shadow-sm space-y-4">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Sequential vs Concurrent Comparison
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-3 px-4 font-medium">Metric</th>
                    <th className="py-3 px-4 font-medium">Sequential Mode</th>
                    <th className="py-3 px-4 font-medium">Concurrent Mode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  <tr>
                    <td className="py-3 px-4 font-medium text-muted-foreground">Total Throughput</td>
                    <td className="py-3 px-4 font-mono font-semibold text-foreground">
                      {result.sequential.throughputTxPerSec} tx/s
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-emerald-400">
                      {result.concurrent.throughputTxPerSec} tx/s
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-muted-foreground">Success / Failures</td>
                    <td className="py-3 px-4 font-mono">
                      <span className="text-emerald-400">{result.sequential.successCount} ok</span> /{' '}
                      <span className="text-rose-400">{result.sequential.failureCount} fail</span>
                    </td>
                    <td className="py-3 px-4 font-mono">
                      <span className="text-emerald-400">{result.concurrent.successCount} ok</span> /{' '}
                      <span className="text-rose-400">{result.concurrent.failureCount} fail</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-muted-foreground">Sequence Conflicts</td>
                    <td className="py-3 px-4 font-mono text-muted-foreground">
                      {result.sequential.sequenceConflicts || 0}
                    </td>
                    <td className="py-3 px-4 font-mono text-amber-400 font-semibold">
                      {result.concurrent.sequenceConflicts || 0} detected
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-muted-foreground">Average Latency</td>
                    <td className="py-3 px-4 font-mono">{result.sequential.latencies.average} ms</td>
                    <td className="py-3 px-4 font-mono">{result.concurrent.latencies.average} ms</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-muted-foreground">P50 Latency</td>
                    <td className="py-3 px-4 font-mono">{result.sequential.latencies.p50} ms</td>
                    <td className="py-3 px-4 font-mono">{result.concurrent.latencies.p50} ms</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-muted-foreground">P95 / P99 Latency</td>
                    <td className="py-3 px-4 font-mono">
                      {result.sequential.latencies.p95}ms / {result.sequential.latencies.p99}ms
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {result.concurrent.latencies.p95}ms / {result.concurrent.latencies.p99}ms
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="border rounded-xl bg-card p-6 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
            <History className="h-4 w-4" />
            Saved Benchmark History ({history.length})
          </h3>
          <div className="space-y-2">
            {history.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-background text-xs font-mono">
                <div className="flex items-center gap-3">
                  <span className="text-primary font-semibold">{new Date(item.timestamp).toLocaleTimeString()}</span>
                  <span>Count: {item.sequential.transactionCount}</span>
                  <span>Concurrency: {item.sequential.concurrency}</span>
                </div>
                <div className="flex items-center gap-4 text-muted-foreground">
                  <span>Seq: {item.sequential.throughputTxPerSec} tx/s</span>
                  <span className="text-emerald-400">Con: {item.concurrent.throughputTxPerSec} tx/s</span>
                  <span className="text-amber-400">Conflicts: {item.concurrent.sequenceConflicts}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
