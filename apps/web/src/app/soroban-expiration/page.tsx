'use client';

import { useEffect, useRef, useState } from 'react';
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
import {
  apiErrorMessage,
  estimateExpiration,
  estimateTtlExtension,
  type ExpirationEstimate,
  type ExpirationStatus,
  type StorageType,
  type TtlExtensionEstimate,
} from '@/lib/api';

export default function SorobanExpirationPage() {
  const [currentLedger, setCurrentLedger] = useState('');
  const [currentLedgerError, setCurrentLedgerError] = useState<string | null>(null);
  const [liveUntilLedger, setLiveUntilLedger] = useState('');
  const [liveUntilLedgerError, setLiveUntilLedgerError] = useState<string | null>(null);
  const [storageType, setStorageType] = useState<StorageType>('persistent');
  const [estimate, setEstimate] = useState<ExpirationEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // TTL Extension form
  const [currentTtl, setCurrentTtl] = useState('');
  const [currentTtlError, setCurrentTtlError] = useState<string | null>(null);
  const [extendByLedgers, setExtendByLedgers] = useState('');
  const [extendByLedgersError, setExtendByLedgersError] = useState<string | null>(null);
  const [entrySizeBytes, setEntrySizeBytes] = useState('1024');
  const [entrySizeBytesError, setEntrySizeBytesError] = useState<string | null>(null);
  const [extensionType, setExtensionType] = useState<StorageType>('persistent');
  const [extensionEstimate, setExtensionEstimate] = useState<TtlExtensionEstimate | null>(null);
  const [extensionLoading, setExtensionLoading] = useState(false);

  // In-flight request controllers to abort on unmount or superseded calls
  const expirationAbortRef = useRef<AbortController | null>(null);
  const extensionAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      expirationAbortRef.current?.abort();
      extensionAbortRef.current?.abort();
    };
  }, []);

  const handleEstimate = async () => {
    setError(null);
    let hasValidationError = false;

    const trimmedCurrent = currentLedger.trim();
    const parsedCurrentLedger = Number.parseInt(trimmedCurrent, 10);
    if (!trimmedCurrent) {
      setCurrentLedgerError('Current ledger is required');
      hasValidationError = true;
    } else if (!Number.isFinite(parsedCurrentLedger) || !/^-?\d+$/.test(trimmedCurrent)) {
      setCurrentLedgerError('Current ledger must be a valid integer');
      hasValidationError = true;
    } else if (parsedCurrentLedger < 0) {
      setCurrentLedgerError('Current ledger must be non-negative');
      hasValidationError = true;
    } else {
      setCurrentLedgerError(null);
    }

    const trimmedLiveUntil = liveUntilLedger.trim();
    const parsedLiveUntilLedger = Number.parseInt(trimmedLiveUntil, 10);
    if (!trimmedLiveUntil) {
      setLiveUntilLedgerError('Live until ledger is required');
      hasValidationError = true;
    } else if (!Number.isFinite(parsedLiveUntilLedger) || !/^-?\d+$/.test(trimmedLiveUntil)) {
      setLiveUntilLedgerError('Live until ledger must be a valid integer');
      hasValidationError = true;
    } else if (parsedLiveUntilLedger < 0) {
      setLiveUntilLedgerError('Live until ledger must be non-negative');
      hasValidationError = true;
    } else {
      setLiveUntilLedgerError(null);
    }

    if (hasValidationError) {
      return;
    }

    expirationAbortRef.current?.abort();
    const controller = new AbortController();
    expirationAbortRef.current = controller;

    setLoading(true);

    try {
      const data = await estimateExpiration(
        {
          currentLedger: parsedCurrentLedger,
          liveUntilLedger: parsedLiveUntilLedger,
          storageType,
        },
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) {
        setEstimate(data);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(apiErrorMessage(err, 'Failed to estimate expiration'));
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  const handleExtensionEstimate = async () => {
    setError(null);
    let hasValidationError = false;

    const trimmedCurrentTtl = currentTtl.trim();
    const parsedCurrentTtl = Number.parseInt(trimmedCurrentTtl, 10);
    if (!trimmedCurrentTtl) {
      setCurrentTtlError('Current TTL is required');
      hasValidationError = true;
    } else if (!Number.isFinite(parsedCurrentTtl) || !/^-?\d+$/.test(trimmedCurrentTtl)) {
      setCurrentTtlError('Current TTL must be a valid integer');
      hasValidationError = true;
    } else if (parsedCurrentTtl < 0) {
      setCurrentTtlError('Current TTL must be non-negative');
      hasValidationError = true;
    } else {
      setCurrentTtlError(null);
    }

    const trimmedExtendBy = extendByLedgers.trim();
    const parsedExtendByLedgers = Number.parseInt(trimmedExtendBy, 10);
    if (!trimmedExtendBy) {
      setExtendByLedgersError('Extend by ledgers is required');
      hasValidationError = true;
    } else if (!Number.isFinite(parsedExtendByLedgers) || !/^-?\d+$/.test(trimmedExtendBy)) {
      setExtendByLedgersError('Extend by ledgers must be a valid integer');
      hasValidationError = true;
    } else if (parsedExtendByLedgers < 1) {
      setExtendByLedgersError('Extend by ledgers must be greater than 0');
      hasValidationError = true;
    } else {
      setExtendByLedgersError(null);
    }

    let parsedEntrySizeBytes: number | undefined;
    const trimmedEntrySize = entrySizeBytes.trim();
    if (trimmedEntrySize) {
      parsedEntrySizeBytes = Number.parseInt(trimmedEntrySize, 10);
      if (!Number.isFinite(parsedEntrySizeBytes) || !/^-?\d+$/.test(trimmedEntrySize)) {
        setEntrySizeBytesError('Entry size must be a valid integer');
        hasValidationError = true;
      } else if (parsedEntrySizeBytes < 1) {
        setEntrySizeBytesError('Entry size must be greater than 0');
        hasValidationError = true;
      } else {
        setEntrySizeBytesError(null);
      }
    } else {
      setEntrySizeBytesError(null);
    }

    if (hasValidationError) {
      return;
    }

    extensionAbortRef.current?.abort();
    const controller = new AbortController();
    extensionAbortRef.current = controller;

    setExtensionLoading(true);

    try {
      const data = await estimateTtlExtension(
        {
          currentTtl: parsedCurrentTtl,
          extendByLedgers: parsedExtendByLedgers,
          entrySizeBytes: parsedEntrySizeBytes,
          storageType: extensionType,
        },
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) {
        setExtensionEstimate(data);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(apiErrorMessage(err, 'Failed to estimate TTL extension'));
    } finally {
      if (!controller.signal.aborted) {
        setExtensionLoading(false);
      }
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
                    min="0"
                    step="1"
                    placeholder="e.g., 1000000"
                    value={currentLedger}
                    onChange={(e) => {
                      setCurrentLedger(e.target.value);
                      if (currentLedgerError) setCurrentLedgerError(null);
                    }}
                    aria-invalid={Boolean(currentLedgerError)}
                    aria-describedby={currentLedgerError ? 'currentLedger-error' : undefined}
                  />
                  {currentLedgerError && (
                    <p id="currentLedger-error" role="alert" className="text-xs text-destructive">
                      {currentLedgerError}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    The current ledger sequence number
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="liveUntilLedger">Live Until Ledger</Label>
                  <Input
                    id="liveUntilLedger"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g., 1500000"
                    value={liveUntilLedger}
                    onChange={(e) => {
                      setLiveUntilLedger(e.target.value);
                      if (liveUntilLedgerError) setLiveUntilLedgerError(null);
                    }}
                    aria-invalid={Boolean(liveUntilLedgerError)}
                    aria-describedby={liveUntilLedgerError ? 'liveUntilLedger-error' : undefined}
                  />
                  {liveUntilLedgerError && (
                    <p id="liveUntilLedger-error" role="alert" className="text-xs text-destructive">
                      {liveUntilLedgerError}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    The liveUntilLedger value from the entry
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="storageType">Storage Type</Label>
                  <Select
                    value={storageType}
                    onValueChange={(v) => setStorageType(v as StorageType)}
                  >
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

              <Button onClick={handleEstimate} disabled={loading}>
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
                    <div className="text-2xl font-bold">
                      {estimate.ttlRemaining.toLocaleString()}
                    </div>
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
                Calculate the cost and impact of extending a storage entry&apos;s TTL
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="currentTtl">Current TTL</Label>
                  <Input
                    id="currentTtl"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g., 100000"
                    value={currentTtl}
                    onChange={(e) => {
                      setCurrentTtl(e.target.value);
                      if (currentTtlError) setCurrentTtlError(null);
                    }}
                    aria-invalid={Boolean(currentTtlError)}
                    aria-describedby={currentTtlError ? 'currentTtl-error' : undefined}
                  />
                  {currentTtlError && (
                    <p id="currentTtl-error" role="alert" className="text-xs text-destructive">
                      {currentTtlError}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">Current TTL remaining in ledgers</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="extendByLedgers">Extend By (Ledgers)</Label>
                  <Input
                    id="extendByLedgers"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="e.g., 518400"
                    value={extendByLedgers}
                    onChange={(e) => {
                      setExtendByLedgers(e.target.value);
                      if (extendByLedgersError) setExtendByLedgersError(null);
                    }}
                    aria-invalid={Boolean(extendByLedgersError)}
                    aria-describedby={extendByLedgersError ? 'extendByLedgers-error' : undefined}
                  />
                  {extendByLedgersError && (
                    <p id="extendByLedgers-error" role="alert" className="text-xs text-destructive">
                      {extendByLedgersError}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Number of ledgers to extend (~518,400 = 30 days)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="entrySizeBytes">Entry Size (Bytes)</Label>
                  <Input
                    id="entrySizeBytes"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="1024"
                    value={entrySizeBytes}
                    onChange={(e) => {
                      setEntrySizeBytes(e.target.value);
                      if (entrySizeBytesError) setEntrySizeBytesError(null);
                    }}
                    aria-invalid={Boolean(entrySizeBytesError)}
                    aria-describedby={entrySizeBytesError ? 'entrySizeBytes-error' : undefined}
                  />
                  {entrySizeBytesError && (
                    <p id="entrySizeBytes-error" role="alert" className="text-xs text-destructive">
                      {entrySizeBytesError}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Size of the storage entry in bytes
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="extensionType">Storage Type</Label>
                  <Select
                    value={extensionType}
                    onValueChange={(v) => setExtensionType(v as StorageType)}
                  >
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

              <Button onClick={handleExtensionEstimate} disabled={extensionLoading}>
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
                    <div className="text-2xl font-bold">
                      {extensionEstimate.newTtl.toLocaleString()}
                    </div>
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
              TTL is measured in ledgers. On average, Stellar produces a new ledger every ~5
              seconds, which equals approximately 17,280 ledgers per day.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Cost Estimates</h3>
            <p className="text-muted-foreground">
              Extension costs are estimates based on entry size and storage type. Actual costs may
              vary based on network conditions and protocol parameters.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
