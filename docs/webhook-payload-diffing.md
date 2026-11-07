# Webhook Payload Diffing Between Retries

## Overview

The webhook delivery system now tracks payload changes between retry attempts. When a webhook is sent multiple times (using the `repeatCount` parameter), the system computes a diff between each retry and the previous attempt, making it easier to identify what changed in the payload during testing and debugging.

## Feature Description

### PayloadDiff Interface

Each webhook history entry can now include a `payloadDiff` field with the following structure:

```typescript
interface PayloadDiff {
  /** Newly added fields that weren't in the previous attempt */
  added?: Record<string, unknown>;
  
  /** Modified fields showing both old and new values */
  modified?: Record<string, { from: unknown; to: unknown }>;
  
  /** Removed fields that existed in the previous attempt */
  removed?: Record<string, unknown>;
  
  /** ID of the previous attempt this diff is relative to */
  previousAttemptId?: string;
}
```

### When Diffs Are Generated

- Payload diffs are **only** generated for retry attempts (when `repeatIndex > 1`)
- The first attempt (`repeatIndex: 1`) never has a diff since there's no previous attempt
- Diffs are only included when changes are detected; identical payloads result in no diff

### Diff Computation Logic

The system performs deep comparison of payloads:

1. **Added Fields**: Any field present in the current payload but not in the previous one
2. **Modified Fields**: Fields present in both payloads but with different values
3. **Removed Fields**: Fields present in the previous payload but not in the current one

The comparison handles:
- Nested objects (compared recursively)
- Arrays (treated as values, not element-by-element comparison)
- Primitives (strings, numbers, booleans)
- Null and undefined values

## API Response

### WebhookHistoryEntry Schema

```typescript
interface WebhookHistoryEntry {
  id: string;
  timestamp: number;
  endpointUrl: string;
  eventType: string;
  method: string;
  payload: Record<string, unknown>;
  // ... other fields
  repeatIndex?: number;  // 1-indexed attempt number
  payloadDiff?: PayloadDiff;  // Present only on retries with changes
}
```

## Usage Examples

### Example 1: Detecting Added Fields

**First Attempt:**
```json
{
  "id": 1,
  "status": "pending"
}
```

**Second Attempt:**
```json
{
  "id": 1,
  "status": "pending",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**Resulting Diff:**
```json
{
  "added": {
    "timestamp": "2024-01-01T00:00:00Z"
  },
  "previousAttemptId": "uuid-of-first-attempt"
}
```

### Example 2: Detecting Modified Fields

**First Attempt:**
```json
{
  "id": 1,
  "status": "pending",
  "count": 5
}
```

**Second Attempt:**
```json
{
  "id": 1,
  "status": "active",
  "count": 10
}
```

**Resulting Diff:**
```json
{
  "modified": {
    "status": { "from": "pending", "to": "active" },
    "count": { "from": 5, "to": 10 }
  },
  "previousAttemptId": "uuid-of-first-attempt"
}
```

### Example 3: Multiple Change Types

**First Attempt:**
```json
{
  "id": 1,
  "status": "pending",
  "tempData": "xyz"
}
```

**Second Attempt:**
```json
{
  "id": 1,
  "status": "active",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

**Resulting Diff:**
```json
{
  "added": {
    "createdAt": "2024-01-01T00:00:00Z"
  },
  "modified": {
    "status": { "from": "pending", "to": "active" }
  },
  "removed": {
    "tempData": "xyz"
  },
  "previousAttemptId": "uuid-of-first-attempt"
}
```

## Integration with Webhook Tester UI

The frontend can use the `payloadDiff` field to:

1. **Highlight Changes**: Show visual indicators for fields that changed between attempts
2. **Compare View**: Display side-by-side comparison of payloads
3. **Timeline**: Track how payloads evolved across multiple retries
4. **Debugging**: Quickly identify unintended payload mutations during testing

## Implementation Notes

### Performance Considerations

- Diff computation uses deep object comparison, which is O(n) where n is the total number of fields
- Diffs are computed in-memory during webhook sending
- No additional database storage is required (history is in-memory)

### Limitations

- Arrays are compared as whole values, not element-by-element
- Very large payloads (approaching the 64KB limit) will have correspondingly large diffs
- Diffs are relative only to the immediately previous attempt in the same batch

### Backward Compatibility

- Existing webhook history entries without `payloadDiff` continue to work
- The field is optional and only present when applicable
- Clients that don't check for `payloadDiff` are unaffected

## Testing

The feature includes comprehensive test coverage:

1. **Unit Tests** (`payload-diff.spec.ts`):
   - Added field detection
   - Modified field detection
   - Removed field detection
   - Multiple change types
   - Nested object handling
   - Edge cases (null, undefined, arrays)

2. **Integration Tests** (in `webhook.service.spec.ts`):
   - Identical payloads (no diff)
   - Real-world retry scenarios
   - Complex nested structures
   - previousAttemptId tracking

## Security & Privacy

- Payload diffs respect the same redaction rules as regular payloads
- Sensitive headers are redacted before diffing
- Diffs are stored in-memory only (same lifecycle as webhook history)
- No additional PII concerns beyond existing webhook storage

## Future Enhancements

Potential improvements for future iterations:

1. Element-by-element array diffing
2. Configurable diff depth limits for very large payloads
3. Diff visualization in the webhook tester UI
4. Export diffs as part of webhook history exports
5. Diff-based alerting for unexpected payload changes
