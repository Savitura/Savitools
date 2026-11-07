'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Clock, AlertTriangle, CheckCircle2, XCircle, Info, TrendingUp } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type StorageType = 'persistent' | 'temporary' | 'instance';

type ExpirationStatus = 'healthy' | 'warning' | 'critical' | 'expired';

interface ExpirationEstimate {
  currentLedger: number;
  liveUntilLedger: number;
  ttlRemaining: number;
  storageType: StorageType;
  isExpired: boolean;
  expiresIn: {
    ledgers: number;
    seconds: number;
    minutes: number;
    hours: number;
    days: number;
  };
  estimatedExpirationDate: string;
  status: ExpirationStatus;
  recommendation: string;
}

interface TtlExtensionEstimate {
  currentTtl: number;
  extendByLedgers: number;
  newTtl: number;
  newLiveUntilLedger?: number;
  extendedLifetime: {
    ledgers: number;
    days: number;
  };
  estimatedCost: {
    stroops: number;
    xlm: string;
  };
  recommendation: string;
}

export default function SorobanExpirationPage() {
  const [currentLedger, setCurrentLedger] = useState('');
  const [liveUntilLedger, setLiveUntilLedger] = useState('');
  const [storageType, setStorageType] = useState<StorageType>('persistent');
  const [estimate, setEstimate] = useState<ExpirationEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // TTL Extension form
  const [currentTtl, setCurrentTtl] = useState('');
  const [extendByLedgers, setExtendByLedgers] = useState('');
  const [entrySizeBytes, setEntrySizeBytes] = useState('1024');
  const [extensionType, setExtensionType] = useState<StorageType>('persistent');
  const [extensionEstimate, setExtensionEstimate] = useState<TtlExtensionEstimate | null>(null);
  const [extensionLoading, setExtensionLoading] = useState(false);

  const handleEstimate = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/soroban/estimate-expiration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentLedger: parseInt(currentLedger),
          liveUntilLedger: parseInt(liveUntilLedger),
          storageType,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to estimate expiration');
      }

      const data = await response.json();
      setEstimate(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleExtensionEstimate = async () => {
    setExtensionLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/soroban/estimate-ttl-extension', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentTtl: parseInt(currentTtl),
          extendByLedgers: parseInt(extendByLedgers),
          entrySizeBytes: parseInt(entrySizeBytes),
          storageType: extensionType,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to estimate TTL extension');
      }

      const data = await response.json();
      setExtensionEstimate(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setExtensionLoading(false);
    }
  };

  const getStatusIcon = (status: ExpirationStatus) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'critical':
        return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case 'expired':
        return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getStatusColor = (status: ExpirationStatus) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-50 border-green-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'critical':
        return 'bg-orange-50 border-orange-200';
      case 'expired':
        return 'bg-red-50 border-red-200';
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Soroban Storage Expiration Estimator</h1>
        <p className="text-muted-foreground">
          Estimate when storage entries will expire and calculate TTL extension costs
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="expiration" className="space-y-4">
        <TabsList>
          <TabsTrigger value="expiration">Expiration Estimator</TabsTrigger>
          <TabsTrigger value="extension">TTL Extension Cost</TabsTrigger>
        </TabsList>

        <TabsContent value="expiration" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Estimate Storage Entry Expiration</CardTitle>
              <CardDescription>
                Calculate when a storage entry will expire based on current and target ledger
                numbers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="currentLedger">Current Ledger</Label>
                  <Input
                    id="currentLedger"
                    type="number"
                    placeholder="e.g., 1000000"
                    value={currentLedger}
                    onChange={(e) => setCurrentLedger(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    The current ledger sequence number
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="liveUntilLedger">Live Until Ledger</Label>
                  <Input
                    id="liveUntilLedger"
                    type="number"
                    placeholder="e.g., 1500000"
                    value={liveUntilLedger}
                    onChange={(e) => setLiveUntilLedger(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    The liveUntilLedger value from the entry
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="storageType">Storage Type</Label>
                  <Select value={storageType} onValueChange={(v) => setStorageType(v as StorageType)}>
                    <SelectTrigger id="storageType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="persistent">Persistent</SelectItem>
                      <SelectItem value="temporary">Temporary</SelectItem>
                      <SelectItem value="instance">Instance</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Type of storage (affects expiration behavior)
                  </p>
                </div>
              </div>

              <Button onClick={handleEstimate} disabled={loading || !currentLedger || !liveUntilLedger}>
                {loading ? 'Calculating...' : 'Estimate Expiration'}
              </Button>
            </CardContent>
          </Card>

          {estimate && (
            <Card className={`border-2 ${getStatusColor(estimate.status)}`}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  {getStatusIcon(estimate.status)}
                  <CardTitle className="capitalize">{estimate.status} Status</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">TTL Remaining</div>
                    <div className="text-2xl font-bold">{estimate.ttlRemaining.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">ledgers</div>
                  </div>

                  <div>
                    <div className="text-sm text-muted-foreground">Days Remaining</div>
                    <div className="text-2xl font-bold">{estimate.expiresIn.days.toFixed(1)}</div>
                    <div className="text-xs text-muted-foreground">days</div>
                  </div>

                  <div>
                    <div className="text-sm text-muted-foreground">Hours Remaining</div>
                    <div className="text-2xl font-bold">{estimate.expiresIn.hours.toFixed(1)}</div>
                    <div className="text-xs text-muted-foreground">hours</div>
                  </div>

                  <div>
                    <div className="text-sm text-muted-foreground">Storage Type</div>
                    <div className="text-2xl font-bold capitalize">{estimate.storageType}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Estimated Expiration Date</span>
                  </div>
                  <div className="text-lg font-semibold">
                    {new Date(estimate.estimatedExpirationDate).toLocaleString()}
                  </div>
                </div>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Recommendation</AlertTitle>
                  <AlertDescription>{estimate.recommendation}</AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="extension" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Estimate TTL Extension Cost</CardTitle>
              <CardDescription>
                Calculate the cost and impact of extending a storage entry's TTL
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="currentTtl">Current TTL</Label>
                  <Input
                    id="currentTtl"
                    type="number"
                    placeholder="e.g., 100000"
                    value={currentTtl}
                    onChange={(e) => setCurrentTtl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Current TTL remaining in ledgers
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="extendByLedgers">Extend By (Ledgers)</Label>
                  <Input
                    id="extendByLedgers"
                    type="number"
                    placeholder="e.g., 518400"
                    value={extendByLedgers}
                    onChange={(e) => setExtendByLedgers(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Number of ledgers to extend (~518,400 = 30 days)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="entrySizeBytes">Entry Size (Bytes)</Label>
                  <Input
                    id="entrySizeBytes"
                    type="number"
                    placeholder="1024"
                    value={entrySizeBytes}
                    onChange={(e) => setEntrySizeBytes(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Size of the storage entry in bytes
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="extensionType">Storage Type</Label>
                  <Select value={extensionType} onValueChange={(v) => setExtensionType(v as StorageType)}>
                    <SelectTrigger id="extensionType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="persistent">Persistent</SelectItem>
                      <SelectItem value="temporary">Temporary</SelectItem>
                      <SelectItem value="instance">Instance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                onClick={handleExtensionEstimate}
                disabled={extensionLoading || !currentTtl || !extendByLedgers}
              >
                {extensionLoading ? 'Calculating...' : 'Estimate Extension Cost'}
              </Button>
            </CardContent>
          </Card>

          {extensionEstimate && (
            <Card className="border-2 border-blue-200 bg-blue-50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                  <CardTitle>Extension Estimate</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">New TTL</div>
                    <div className="text-2xl font-bold">{extensionEstimate.newTtl.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">ledgers</div>
                  </div>

                  <div>
                    <div className="text-sm text-muted-foreground">Extended By</div>
                    <div className="text-2xl font-bold">
                      {extensionEstimate.extendedLifetime.days.toFixed(1)}
                    </div>
                    <div className="text-xs text-muted-foreground">days</div>
                  </div>

                  <div>
                    <div className="text-sm text-muted-foreground">Cost (Stroops)</div>
                    <div className="text-2xl font-bold">
                      {extensionEstimate.estimatedCost.stroops.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">stroops</div>
                  </div>

                  <div>
                    <div className="text-sm text-muted-foreground">Cost (XLM)</div>
                    <div className="text-2xl font-bold">{extensionEstimate.estimatedCost.xlm}</div>
                    <div className="text-xs text-muted-foreground">XLM</div>
                  </div>
                </div>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Recommendation</AlertTitle>
                  <AlertDescription>{extensionEstimate.recommendation}</AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>About Soroban Storage Expiration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <h3 className="font-semibold mb-2">Storage Types</h3>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>
                <strong>Persistent:</strong> Data is archived when TTL expires and can be restored
              </li>
              <li>
                <strong>Temporary:</strong> Data is permanently deleted when TTL expires
              </li>
              <li>
                <strong>Instance:</strong> Shares TTL with contract instance, archived when expired
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Time Calculations</h3>
            <p className="text-muted-foreground">
              TTL is measured in ledgers. On average, Stellar produces a new ledger every ~5 seconds,
              which equals approximately 17,280 ledgers per day.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Cost Estimates</h3>
            <p className="text-muted-foreground">
              Extension costs are estimates based on entry size and storage type. Actual costs may vary
              based on network conditions and protocol parameters.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
