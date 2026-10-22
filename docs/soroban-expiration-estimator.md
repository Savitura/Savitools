# Soroban Storage Expiration Estimator

## Overview

The Soroban Storage Expiration Estimator is a tool for calculating when storage entries will expire and estimating the cost of extending their Time-To-Live (TTL).

## Features

### 1. Expiration Estimation
Calculate when a storage entry will expire based on:
- Current ledger sequence number
- Entry's `liveUntilLedger` value
- Storage type (persistent, temporary, or instance)

**Output:**
- TTL remaining (in ledgers)
- Time until expiration (days, hours, minutes, seconds)
- Estimated expiration date
- Status indicator (healthy, warning, critical, expired)
- Actionable recommendations

### 2. TTL Extension Cost Estimation
Estimate the cost and impact of extending an entry's TTL:
- Calculate new TTL after extension
- Estimate cost in stroops and XLM
- Provide recommendations based on extension duration

### 3. Bulk Contract Estimation (API only)
Check expiration status for multiple contracts in a single request.

## API Endpoints

### POST /api/soroban/estimate-expiration

Estimate when a storage entry will expire.

**Request Body:**
```json
{
  "currentLedger": 1000000,
  "liveUntilLedger": 1500000,
  "storageType": "persistent",
  "ledgerCloseTime": 5
}
```

**Response:**
```json
{
  "currentLedger": 1000000,
  "liveUntilLedger": 1500000,
  "ttlRemaining": 500000,
  "storageType": "persistent",
  "isExpired": false,
  "expiresIn": {
    "ledgers": 500000,
    "seconds": 2500000,
    "minutes": 41666.67,
    "hours": 694.44,
    "days": 28.94
  },
  "estimatedExpirationDate": "2025-02-15T10:30:00.000Z",
  "status": "warning",
  "recommendation": "Entry expires in 28.9 days. Consider extending TTL by 1555200 ledgers (≈90 days) to avoid near-term expiration."
}
```

### POST /api/soroban/estimate-ttl-extension

Estimate the cost and impact of extending TTL.

**Request Body:**
```json
{
  "currentTtl": 100000,
  "extendByLedgers": 518400,
  "entrySizeBytes": 1024,
  "storageType": "persistent"
}
```

**Response:**
```json
{
  "currentTtl": 100000,
  "extendByLedgers": 518400,
  "newTtl": 618400,
  "extendedLifetime": {
    "ledgers": 518400,
    "days": 30.0
  },
  "estimatedCost": {
    "stroops": 531200,
    "xlm": "0.0531200"
  },
  "recommendation": "Extension of 30.0 days costs approximately 0.0531200 XLM. This provides a good balance between cost and protection."
}
```

### POST /api/soroban/bulk-estimate

Estimate expiration for multiple contracts.

**Request Body:**
```json
{
  "contractAddresses": [
    "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
    "CDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCDCD"
  ],
  "network": "testnet"
}
```

## Storage Types

### Persistent Storage
- **Use Case:** Long-term data that must remain accessible
- **Expiration Behavior:** Archived when TTL expires, can be restored
- **Examples:** User balances, token metadata, governance decisions

### Temporary Storage
- **Use Case:** Short-term data with well-defined lifetime
- **Expiration Behavior:** Permanently deleted when TTL expires
- **Examples:** Price feeds, limited-time authorizations, session tokens
- **Warning:** Data cannot be recovered after expiration

### Instance Storage
- **Use Case:** Small data tied to contract lifecycle
- **Expiration Behavior:** Shares TTL with contract instance, archived when expired
- **Examples:** Contract admin addresses, configuration data
- **Limit:** Total size limited by ledger entry size limit

## TTL Thresholds

The estimator uses the following thresholds for status classification:

- **Healthy:** > 30 days remaining
- **Warning:** 7-30 days remaining
- **Critical:** < 7 days remaining  
- **Expired:** 0 days (TTL expired)

## Time Calculations

### Ledger Close Time
- **Average:** ~5 seconds per ledger
- **Ledgers per day:** ~17,280 (86,400 seconds ÷ 5)
- **Ledgers per 30 days:** ~518,400
- **Ledgers per 90 days:** ~1,555,200
- **Ledgers per year:** ~6,307,200

### Formula
```
Days Remaining = (liveUntilLedger - currentLedger) × ledgerCloseTime ÷ 86400
```

## Cost Estimation

### Rent Calculation
Storage rent is charged based on:
1. Entry size in bytes
2. Number of ledgers to extend
3. Storage type (temporary storage costs ~50% less)

### Formula (Simplified)
```
Cost (stroops) = entrySizeBytes × extendByLedgers × rentFeePerByte × typeMultiplier + baseFee
```

Where:
- `rentFeePerByte` ≈ 0.001 stroops/byte/ledger
- `typeMultiplier` = 0.5 for temporary, 1.0 for persistent/instance
- `baseFee` = 10,000 stroops (write operation)

**Note:** Actual costs may vary based on network protocol parameters.

## Best Practices

### For Persistent Storage
1. **Extend by 90+ days** for cost efficiency
2. **Monitor entries regularly** before reaching warning threshold
3. **Automate TTL extension** for critical data
4. **Budget for restoration costs** if entry expires

### For Temporary Storage
1. **Use only for truly temporary data**
2. **Never rely on extensions** to preserve data
3. **Set initial TTL generously** to avoid premature expiration
4. **Have fallback data sources**

### For Instance Storage
1. **Keep data small** (limited by entry size)
2. **Extend contract instance TTL** to extend instance storage
3. **Store critical shared data** here (e.g., admin address)

## Usage Examples

### Check if Entry Needs Extension
```javascript
const response = await fetch('/api/soroban/estimate-expiration', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    currentLedger: 1000000,
    liveUntilLedger: 1100000,
    storageType: 'persistent'
  })
});

const estimate = await response.json();

if (estimate.status === 'critical' || estimate.status === 'warning') {
  console.log('Extension recommended:', estimate.recommendation);
  // Proceed with TTL extension
}
```

### Calculate Extension Cost
```javascript
const response = await fetch('/api/soroban/estimate-ttl-extension', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    currentTtl: estimate.ttlRemaining,
    extendByLedgers: 1555200, // 90 days
    entrySizeBytes: 2048,
    storageType: 'persistent'
  })
});

const extension = await response.json();
console.log(`Cost to extend: ${extension.estimatedCost.xlm} XLM`);
```

## Limitations

1. **Cost estimates are approximate** - Actual protocol parameters may differ
2. **Bulk estimation requires RPC** - Currently returns mock data
3. **No automatic extension** - Tool only estimates; manual extension required
4. **Network delays** - Ledger close time may vary slightly

## Related Resources

- [Stellar State Archival Documentation](https://developers.stellar.org/docs/build/guides/archival)
- [Soroban Storage Guide](https://developers.stellar.org/docs/build/guides/storage)
- [TTL Extension Examples](https://developers.stellar.org/docs/build/guides/archival/extend-persistent-entry-js)

## Support

For issues or feature requests, please file an issue on the GitHub repository.
