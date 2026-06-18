'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Activity, Clock, Zap, Server } from 'lucide-react';

export default function NetworkStatusPage() {
  const [network, setNetwork] = useState<'mainnet' | 'testnet'>('mainnet');
  const [status, setStatus] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = async (net: string) => {
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      
      const [statusRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/network/status?network=${net}`),
        fetch(`${API_BASE}/network/status/history?network=${net}`)
      ]);
      
      if (!statusRes.ok || !historyRes.ok) throw new Error('Failed to fetch data');
      
      const statusData = await statusRes.json();
      const historyData = await historyRes.json();
      
      setStatus(statusData);
      setHistory(historyData);
    } catch (err) {
      console.error(err);
      setError('Could not connect to Horizon.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchData(network);
    
    const interval = setInterval(() => {
      fetchData(network);
    }, 60000);
    
    return () => clearInterval(interval);
  }, [network]);

  if (loading && !status) {
    return <div className="p-8 flex justify-center items-center h-[50vh]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  if (error || !status) {
    return <div className="p-8 text-red-500 flex justify-center h-[50vh] items-center">{error}</div>;
  }

  const { ledger, fees, latency } = status;

  const latencyColor = latency < 500 ? 'text-green-500 bg-green-500/10' : latency < 2000 ? 'text-yellow-500 bg-yellow-500/10' : 'text-red-500 bg-red-500/10';
  const latencyIndicatorColor = latency < 500 ? 'bg-green-500' : latency < 2000 ? 'bg-yellow-500' : 'bg-red-500';

  const chartData = history.map((item) => {
    const d = new Date(item.timestamp);
    return {
      time: `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`,
      fee: item.fees?.baseFee?.mode || 100
    };
  });

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      {/* Header & Toggle */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Network Status</h1>
          <p className="text-muted-foreground mt-1">Live health and fee metrics for the Stellar network.</p>
        </div>
        <div className="flex bg-secondary p-1 rounded-lg">
          <button 
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${network === 'mainnet' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setNetwork('mainnet')}
          >
            Mainnet
          </button>
          <button 
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${network === 'testnet' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setNetwork('testnet')}
          >
            Testnet
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border rounded-xl p-4 flex items-center space-x-4 bg-card shadow-sm">
          <div className="p-3 bg-primary/10 rounded-lg text-primary">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Network</p>
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-lg capitalize">{network}</span>
              <span className={`w-2 h-2 rounded-full ${latencyIndicatorColor}`} />
            </div>
          </div>
        </div>

        <div className="border rounded-xl p-4 flex items-center space-x-4 bg-card shadow-sm">
          <div className="p-3 bg-primary/10 rounded-lg text-primary">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Latest Ledger</p>
            <p className="font-semibold text-lg">{ledger.sequence.toLocaleString()}</p>
          </div>
        </div>

        <div className="border rounded-xl p-4 flex items-center space-x-4 bg-card shadow-sm">
          <div className="p-3 bg-primary/10 rounded-lg text-primary">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Last Close</p>
            <p className="font-semibold text-lg">{ledger.secondsSinceClose}s ago</p>
          </div>
        </div>

        <div className={`border rounded-xl p-4 flex items-center space-x-4 bg-card shadow-sm`}>
          <div className={`p-3 rounded-lg ${latencyColor}`}>
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground font-medium">Horizon Latency</p>
            <p className="font-semibold text-lg">{latency}ms</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Fees & Ledger Stats */}
        <div className="space-y-6">
          <div className="border rounded-xl p-6 bg-card shadow-sm">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Fee Metrics
            </h2>
            
            <div className="space-y-6">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Current Base Fee</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold">{fees.baseFee.mode}</span>
                  <span className="text-muted-foreground">stroops</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  ~{(fees.baseFee.mode / 10000000).toFixed(7)} XLM
                </p>
              </div>

              <div className="h-px bg-border" />

              <div>
                <div className="flex justify-between items-center mb-1">
                  <p className="text-sm text-muted-foreground">Recommended (Fast)</p>
                  <span className="text-xs font-medium bg-green-500/10 text-green-500 px-2 py-0.5 rounded">P90</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{fees.percentiles.p90}</span>
                  <span className="text-muted-foreground">stroops</span>
                </div>
              </div>
            </div>
          </div>

          <div className="border rounded-xl p-6 bg-card shadow-sm">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Ledger Stats
            </h2>
            
            <div>
              <p className="text-sm text-muted-foreground mb-1">Avg Close Time (Last 10)</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{ledger.avgCloseTime || 'N/A'}</span>
                <span className="text-muted-foreground font-medium">seconds</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Chart */}
        <div className="lg:col-span-2 border rounded-xl p-6 bg-card shadow-sm">
          <h2 className="text-xl font-semibold mb-6">Base Fee History (60m)</h2>
          <div className="h-[300px] w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                  <XAxis dataKey="time" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}
                  />
                  <Line 
                    type="stepAfter" 
                    dataKey="fee" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2} 
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground bg-muted/20 rounded-lg">
                Collecting history data...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
