# SaviTools Quickstart

From zero to a submitted Stellar transaction in 5 minutes.

This guide walks you through the entire workflow using the SaviTools API on testnet. We'll:
1. Generate a keypair
2. Fund the account
3. Check balances
4. Find a payment path
5. Build a transaction
6. Submit it

All commands use `curl`. For Windows PowerShell users, some escaping may differ.

---

## Prerequisites

- `curl` installed
- A running SaviTools API server (default: `http://localhost:3001`)
- Testnet environment (queries `testnet-api.savitools.com` or local dev)

---

## Step 1: Generate a Keypair

Generate a new Stellar keypair (public key + secret).

```bash
curl -X POST http://localhost:3001/api/v1/wallet/generate
```

**Expected Response:**
```json
{
  "publicKey": "GBZR7WLLV5OZVUQ4WAWCKVCOVWGZFZVHG5GMRFYVZJZ2AFSGHFKDQ4C",
  "secret": "SBUQ54DRQG5Q3QLQHJEZ5ODSLGEYZIJEDYAJBSJUKAUJL4MQAQKF3PZ"
}
```

**Save these values:**
```bash
export PUBLIC_KEY="GBZR7WLLV5OZVUQ4WAWCKVCOVWGZFZVHG5GMRFYVZJZ2AFSGHFKDQ4C"
export SECRET="SBUQ54DRQG5Q3QLQHJEZ5ODSLGEYZIJEDYAJBSJUKAUJL4MQAQKF3PZ"
```

**What could go wrong:**
- API server is not running → Start it with `npm run dev`
- Network timeout → Check your internet connection

---

## Step 2: Fund Your Testnet Account

Use the Friendbot service to fund your account with 10 XLM.

```bash
curl -X POST http://localhost:3001/api/v1/wallet/fund \
  -H "Content-Type: application/json" \
  -d "{\"publicKey\": \"$PUBLIC_KEY\"}"
```

**Expected Response:**
```json
{
  "success": true,
  "amount": "10.0000000",
  "currency": "XLM",
  "transactionHash": "6c1e1f6fe8c9b2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c"
}
```

**What could go wrong:**
- `400 Bad Request` with "Invalid public key" → Verify the `PUBLIC_KEY` export
- Friendbot rate-limited → Wait a few minutes and retry
- Account already exists → Safe to proceed to Step 3

---

## Step 3: Check Account Balances

Verify your account now has 10 XLM.

```bash
curl "http://localhost:3001/api/v1/wallet/balances?publicKey=$PUBLIC_KEY"
```

**Expected Response:**
```json
{
  "balances": [
    {
      "asset_type": "native",
      "balance": "9.9999800",
      "asset_code": "XLM"
    }
  ]
}
```

**What could go wrong:**
- `400 Bad Request` → Check that `$PUBLIC_KEY` is set and valid
- Empty balances array → Account may not exist yet; retry Step 2

**Note:** The balance is 9.99998 instead of 10 because the funding transaction fee (0.0001 XLM) was deducted.

---

## Step 4: Find a Payment Path

Let's say we want to send 5 XLM to a receiving address. First, find a payment path (there's only one for native XLM).

```bash
RECIPIENT="GBUQWPFZ2AEFL3YZWP7CLBX6FAUYGMJC52YTKF4KIWNDWVXMXWBP2C5"

curl "http://localhost:3001/api/v1/simulator/paths?direction=strict_send&source_asset_type=native&destination_asset_type=native&amount=5&network=testnet"
```

**Expected Response:**
```json
{
  "paths": [
    {
      "source_amount": "5.0000000",
      "destination_amount": "5.0000000",
      "path": []
    }
  ],
  "direction": "strict_send"
}
```

**What could go wrong:**
- `400 Bad Request` → Verify query parameters are correct
- Empty `paths` array → Asset pair has no available path (use different assets)

**Notes:**
- For native-to-native transfers, the path is empty (direct transfer)
- For cross-asset transfers, paths show intermediary hops

---

## Step 5: Estimate Fees

Get the current base fee for the network.

```bash
curl "http://localhost:3001/api/v1/simulator/fee?operations=1&network=testnet"
```

**Expected Response:**
```json
{
  "baseFee": 100,
  "totalFee": 100,
  "operations": 1,
  "network": "testnet"
}
```

**What to do with this:**
- Base fee per operation: **100 stroops** (0.00001 XLM)
- Total fee for 1 operation: **100 stroops**

---

## Step 6: Build the Transaction

Build an unsigned transaction to send 5 XLM.

```bash
curl -X POST http://localhost:3001/api/v1/composer/build \
  -H "Content-Type: application/json" \
  -d "{
    \"sourceAccount\": {
      \"publicKey\": \"$PUBLIC_KEY\",
      \"sequence\": \"1\"
    },
    \"fee\": \"100\",
    \"operations\": [
      {
        \"type\": \"payment\",
        \"destination\": \"$RECIPIENT\",
        \"asset\": \"native\",
        \"amount\": \"5.00\"
      }
    ],
    \"network\": \"testnet\"
  }"
```

**Expected Response:**
```json
{
  "xdr": "AAAAAgAAAAB+Ht3sW/xvHrHnXJ...",
  "hash": "5fa1f6d8a7c9b2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "envelope_type": "ENVELOPE_TYPE_TX"
}
```

**Save the XDR:**
```bash
export XDR="AAAAAgAAAAB+Ht3sW/xvHrHnXJ..."
```

**What could go wrong:**
- `400 Bad Request` with "Invalid source account" → Sequence number may be wrong
- Recipient public key invalid → Double-check the `$RECIPIENT` format (starts with `G`, 56 chars)

---

## Step 7: Simulate the Transaction

Dry-run the transaction to check for errors before submitting.

```bash
curl -X POST http://localhost:3001/api/v1/composer/simulate \
  -H "Content-Type: application/json" \
  -d "{
    \"xdr\": \"$XDR\",
    \"network\": \"testnet\"
  }"
```

**Expected Response:**
```json
{
  "resultXdr": "AAAAAAAAAGQ...",
  "fee": "100",
  "resultCode": "txSUCCESS",
  "operationResults": [
    {
      "code": "opSUCCESS"
    }
  ]
}
```

**What to look for:**
- `"resultCode": "txSUCCESS"` ✅ Transaction is valid
- `"operationResults": [{"code": "opSUCCESS"}]` ✅ All operations passed
- Any code starting with `tx_` or `op_` = error (see Error Reference)

**What could go wrong:**
- `txLATE_LEDGER_CLOSE` → Sequence number changed; rebuild the transaction
- `txFAILED` → Check `operationResults` for details

---

## Step 8: Sign and Submit (Via External Tool)

**Important:** SaviTools does NOT sign transactions with your secret key. You must sign externally for security.

Use the [Stellar CLI](https://developers.stellar.org/docs/tools-and-sdks#command-line-client) or a wallet SDK:

```bash
stellar tx sign --network testnet \
  --signer "$SECRET" \
  --input-xdr "$XDR" \
  --output-xdr signed-tx.xdr
```

Then submit to Horizon:

```bash
stellar tx submit --network testnet --input-xdr signed-tx.xdr
```

**Or use a wallet SDK** like [JS-Stellar-SDK](https://github.com/stellar/py-stellar-base):

```bash
npm install stellar-sdk
```

```javascript
const StellarSdk = require('stellar-sdk');

const keypair = StellarSdk.Keypair.fromSecret('SBUQ54...');
const tx = StellarSdk.TransactionBuilder.fromXDR('AAAAAgAAAAB...', StellarSdk.Networks.TESTNET_NETWORK_PASSPHRASE);
tx.sign(keypair);
const envelope = tx.toEnvelope();

// Submit to Horizon
const server = new StellarSdk.Server('https://horizon-testnet.stellar.org');
server.submitTransaction(envelope).then(result => {
  console.log('Transaction successful:', result.hash);
}).catch(error => {
  console.error('Submission failed:', error);
});
```

**What could go wrong:**
- Signature invalid → Verify the secret key matches the public key
- Bad envelope XDR → Rebuild the transaction with correct parameters

---

## Step 9: Inspect the Result

Once submitted, check the transaction status:

```bash
TX_HASH="5fa1f6d8a7c9b2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"

curl "http://localhost:3001/api/v1/transactions/$TX_HASH"
```

**Expected Response:**
```json
{
  "id": "5fa1f6d8a7c9b2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "source_account": "GBZR7WLLV5OZVUQ4WAWCKVCOVWGZFZVHG5GMRFYVZJZ2AFSGHFKDQ4C",
  "fee_charged": 100,
  "successful": true,
  "created_at": "2024-06-21T12:34:56Z",
  "operations": [
    {
      "type": "payment",
      "destination": "GBUQWPFZ2AEFL3YZWP7CLBX6FAUYGMJC52YTKF4KIWNDWVXMXWBP2C5",
      "amount": "5.0000000",
      "asset_type": "native"
    }
  ]
}
```

**Verify:**
- `"successful": true` ✅ Payment was confirmed
- `"fee_charged": 100` ✅ Correct fee deducted
- `"operations[0].amount": "5.0000000"` ✅ Correct amount sent

---

## Troubleshooting

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| `curl: (7) Failed to connect` | API not running | Start with `npm run dev` in `apps/api` |
| `401 Unauthorized` | Using an authenticated endpoint | Public endpoints don't require auth; check endpoint docs |
| `400 Invalid public key` | Malformed key | Use `/wallet/generate` or validate key format |
| `404 Not found` | Transaction doesn't exist yet | Wait a few seconds and retry; check hash spelling |
| `ENOVEL_TIME` result code | Ledger closed before submission | Increase `maxTime` or retry immediately |
| Signature invalid | Secret key doesn't match public key | Verify both are from the same `/wallet/generate` call |

---

## Next Steps

Now that you've submitted a transaction, explore:

1. **Multi-Operation Transactions**: Build transactions with multiple operations (e.g., payments + trades)
   - Check `GET /composer/operations` for all op types
   - See `/composer/build` docs for examples

2. **Cross-Asset Swaps**: Use `/simulator/paths` to trade between different assets
   - Use `path_payment_strict_send` or `path_payment_strict_receive` operation types

3. **Soroban Smart Contracts**: Deploy and invoke contracts
   - `/contracts/deploy` for WASM files
   - `/contracts/:id/invoke` for function calls

4. **Webhook Integration**: Listen for transaction events
   - Check `/webhooks/templates` for supported events
   - Use `/webhooks/send` for testing

5. **User Workspaces**: Persist UI state across sessions
   - `GET /workspaces/:tool` to read saved state
   - `PUT /workspaces/:tool` to save state

---

## API Documentation

For detailed endpoint docs, responses, and all parameters:
- 📖 **Full API Reference**: See `/api/docs` (Swagger UI) or `docs/api-reference.md`
- 🚀 **Stellar Docs**: https://developers.stellar.org/docs
- 💬 **Community Discord**: https://discord.gg/stellar

---

## Feedback

Found an issue with this guide? [Report it on GitHub](https://github.com/GrantFox/Savitools/issues)
