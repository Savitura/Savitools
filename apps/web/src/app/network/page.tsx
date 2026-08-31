"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  BookOpen,
  Gauge,
  Server,
  ShieldCheck,
  Siren,
  Zap,
} from "lucide-react";
import Link from "next/link";
import {
  getNetworkHistory,
  getNetworkStatus,
  NetworkChoice,
  NetworkHistoryBucket,
  NetworkHistoryResult,
  NetworkStatusResult,
} from "@/lib/api";

const WINDOWS = [
  { label: "1h", minutes: 60 },
  { label: "6h", minutes: 360 },
  { label: "24h", minutes: 1440 },
];

export default function NetworkStatusPage() {
  const [network, setNetwork] = useState<NetworkChoice>("mainnet");
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [status, setStatus] = useState<NetworkStatusResult | null>(null);
  const [history, setHistory] = useState<NetworkHistoryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setError("");
        const [statusData, historyData] = await Promise.all([
          getNetworkStatus(network),
          getNetworkHistory(network, windowMinutes),
        ]);

        if (!cancelled) {
          setStatus(statusData);
          setHistory(historyData);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Could not load network status history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 60000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [network, windowMinutes]);

  const chartData = useMemo(
    () =>
      (history?.samples ?? []).map((item) => ({
        ...item,
        time: formatTime(item.sampledAt),
        upBand: item.ok ? 1 : 0,
        downBand: item.ok ? 0 : 1,
      })),
    [history],
  );

  if (loading && !status) {
    return (
      <div className="flex h-[50vh] items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !status || !history) {
    return (
      <div className="flex h-[50vh] items-center justify-center p-8 text-red-500">
        {error || "Network status is unavailable."}
      </div>
    );
  }

  const { ledger, fees, latency } = status;
  const summary = history.summary;
  const latencyState =
    latency < 500
      ? "text-emerald-600 bg-emerald-500/10"
      : latency < 2000
        ? "text-amber-600 bg-amber-500/10"
        : "text-red-600 bg-red-500/10";
  const networkUp = summary.uptimePercent > 0;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Network Status</h1>
          <p className="mt-1 text-muted-foreground">
            Live health, sampled Horizon latency, and recent availability.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/docs/network"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Usage docs
          </Link>
          <SegmentedControl
            options={[
              { label: "Mainnet", value: "mainnet" },
              { label: "Testnet", value: "testnet" },
            ]}
            value={network}
            onChange={(value) => setNetwork(value as NetworkChoice)}
          />
          <SegmentedControl
            options={WINDOWS.map((item) => ({
              label: item.label,
              value: String(item.minutes),
            }))}
            value={String(windowMinutes)}
            onChange={(value) => setWindowMinutes(Number(value))}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard
          icon={<Activity className="h-5 w-5" />}
          label="Network"
          value={network}
          detail={networkUp ? "Sampling active" : "No recent uptime"}
        />
        <MetricCard
          icon={<Server className="h-5 w-5" />}
          label="Latest Ledger"
          value={ledger.sequence.toLocaleString()}
          detail={`${ledger.secondsSinceClose}s since close`}
        />
        <MetricCard
          icon={<ShieldCheck className="h-5 w-5" />}
          label="Uptime"
          value={`${summary.uptimePercent.toFixed(2)}%`}
          detail={`${summary.sampleCount} samples`}
        />
        <MetricCard
          icon={<Zap className="h-5 w-5" />}
          label="Horizon Latency"
          value={`${latency}ms`}
          detail="Current request"
          tone={latencyState}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="mb-6 flex items-center gap-2 text-xl font-semibold">
              <Gauge className="h-5 w-5 text-primary" />
              Latency Metrics
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <SmallMetric
                label="p50"
                value={formatLatency(summary.p50LatencyMs)}
              />
              <SmallMetric
                label="p95"
                value={formatLatency(summary.p95LatencyMs)}
              />
              <SmallMetric
                label="Outages"
                value={String(summary.outageCount)}
              />
              <SmallMetric
                label="Avg close"
                value={`${ledger.avgCloseTime || "N/A"}s`}
              />
            </div>
          </div>

          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
              <Siren className="h-5 w-5 text-primary" />
              Fee Snapshot
            </h2>
            <div className="space-y-4">
              <SmallMetric
                label="Base fee"
                value={`${fees.baseFee.mode.toLocaleString()} stroops`}
              />
              <SmallMetric
                label="Recommended"
                value={`${fees.percentiles.p90.toLocaleString()} stroops`}
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm lg:col-span-2">
          <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Latency History</h2>
              <p className="text-sm text-muted-foreground">
                {formatRange(history.from, history.to)}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Up
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                Down
              </span>
            </div>
          </div>
          <div className="h-[340px] w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 10, right: 10, bottom: 5, left: -20 }}
                >
                  <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke="#888888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="latency"
                    stroke="#888888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}ms`}
                  />
                  <YAxis yAxisId="status" hide domain={[0, 1]} />
                  <RechartsTooltip content={<HistoryTooltip />} />
                  <Area
                    yAxisId="status"
                    type="stepAfter"
                    dataKey="upBand"
                    fill="rgba(16, 185, 129, 0.12)"
                    stroke="rgba(16, 185, 129, 0.35)"
                    isAnimationActive={false}
                  />
                  <Area
                    yAxisId="status"
                    type="stepAfter"
                    dataKey="downBand"
                    fill="rgba(239, 68, 68, 0.12)"
                    stroke="rgba(239, 68, 68, 0.35)"
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="latency"
                    type="monotone"
                    dataKey="latencyMs"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg bg-muted/20 text-muted-foreground">
                Collecting history data...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex rounded-lg bg-secondary p-1">
      {options.map((option) => (
        <button
          key={option.value}
          className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            value === option.value
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = "bg-primary/10 text-primary",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border bg-card p-4 shadow-sm">
      <div className={`rounded-lg p-3 ${tone}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="truncate text-lg font-semibold capitalize">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

function HistoryTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as NetworkHistoryBucket;

  return (
    <div className="rounded-lg border bg-background p-3 text-sm shadow-sm">
      <p className="font-medium">{label}</p>
      <p className={row.ok ? "text-emerald-600" : "text-red-600"}>
        {row.ok ? "Up" : "Down"}
      </p>
      <p className="text-muted-foreground">
        Latency: {formatLatency(row.latencyMs)}
      </p>
      <p className="text-muted-foreground">
        Samples: {row.sampleCount}, errors: {row.errorCount}
      </p>
    </div>
  );
}

function formatLatency(value: number | null) {
  return value === null ? "N/A" : `${value}ms`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRange(from: string, to: string) {
  const start = new Date(from).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const end = new Date(to).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${start} - ${end}`;
}
