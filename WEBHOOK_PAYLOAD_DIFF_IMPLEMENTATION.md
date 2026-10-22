# Webhook Payload Diffing Implementation Summary

## Overview
Implemented webhook delivery payload diffing between retries to track and visualize payload changes across multiple delivery attempts.

## Changes Made

### 1. Backend (API) - `apps/api/src/modules/webhook/webhook.service.ts`

#### Added Interfaces:
- **`PayloadDiff`**: Tracks added, modified, and removed fields between retry attempts
  - `added?: Record<string, unknown>` - New fields in current attempt
  - `modified?: Record<string, { from: unknown; to: unknown }>` - Changed fields with before/after values
  - `removed?: Record<string, unknown>` - Fields removed in current attempt
  - `previousAttemptId?: string` - Links to the previous attempt

#### Updated Interface:
- **`WebhookHistoryEntry`**: Added optional `payloadDiff?: PayloadDiff` field

#### New Methods:
- **`computePayloadDiff(previous, current)`**: Computes differences between two payloads
  - Detects added, modified, and removed fields
  - Returns `undefined` if payloads are identical
  - Handles nested objects through deep comparison

- **`deepEqual(a, b)`**: Deep equality checker for comparing payload values
  - Recursively compares objects
  - Handles primitives, nulls, and arrays

#### Updated Method:
- **`sendWebhook()`**: Enhanced to track payload changes across retries
  - Maintains `previousPayload` and `previousEntryId` during retry loop
  - Computes diff for each retry (i > 0)
  - Attaches diff to history entry when changes detected

### 2. Frontend (Web) - `apps/web/src/lib/api.ts`

#### Added Interface:
- **`PayloadDiff`**: Mirror of backend interface for type safety

#### Updated Interface:
- **`WebhookHistoryEntry`**: Added optional `payloadDiff?: PayloadDiff` field

### 3. Tests

#### Created `apps/api/src/modules/webhook/payload-diff.spec.ts`:
- Unit tests for `computePayloadDiff()` method
- Unit tests for `deepEqual()` method
- Coverage for:
  - Added fields detection
  - Modified fields detection
  - Removed fields detection
  - Multiple change types simultaneously
  - Identical payloads (no diff)
  - Nested objects
  - Arrays as values
  - Null and undefined handling

#### Updated `apps/api/src/modules/webhook/webhook.service.spec.ts`:
- Added integration tests for payload diffing in retry scenarios
- Tests for identical payloads across retries
- Tests for various diff computation scenarios

### 4. Documentation - `docs/webhook-payload-diffing.md`

Complete feature documentation including:
- Feature overview and interface definitions
- When diffs are generated
- Diff computation logic
- API response schema
- Usage examples with real-world scenarios
- Integration guidance for UI
- Performance considerations
- Limitations and backward compatibility
- Security and privacy notes
- Future enhancement ideas

## Key Features

1. **Automatic Tracking**: Diffs are automatically computed during webhook retries
2. **Deep Comparison**: Handles nested objects and complex payloads
3. **Efficient**: Only computes diffs when needed (retries only)
4. **Backward Compatible**: Optional field, existing code unaffected
5. **Well Tested**: Comprehensive unit and integration test coverage

## Behavior

- **First Attempt (repeatIndex: 1)**: No diff (no previous attempt to compare)
- **Subsequent Attempts (repeatIndex > 1)**: Diff computed against previous attempt
- **No Changes**: `payloadDiff` is `undefined` when payloads are identical
- **With Changes**: `payloadDiff` contains only the relevant sections (added/modified/removed)

## Example Usage

### Sending webhook with retries:
```typescript
const result = await sendWebhook({
  endpointUrl: 'https://example.com/hook',
  eventType: 'order.created',
  payload: { id: 1, status: 'pending' },
  repeatCount: 3,
  repeatIntervalMs: 1000
});

// Result is an array of WebhookHistoryEntry
// result[0].payloadDiff is undefined (first attempt)
// result[1].payloadDiff may contain diff if payload changed
// result[2].payloadDiff may contain diff if payload changed
```

### Accessing diff information:
```typescript
if (entry.payloadDiff) {
  console.log('Added fields:', entry.payloadDiff.added);
  console.log('Modified fields:', entry.payloadDiff.modified);
  console.log('Removed fields:', entry.payloadDiff.removed);
  console.log('Previous attempt ID:', entry.payloadDiff.previousAttemptId);
}
```

## Files Modified

1. `apps/api/src/modules/webhook/webhook.service.ts` - Core implementation
2. `apps/web/src/lib/api.ts` - Frontend types
3. `apps/api/src/modules/webhook/payload-diff.spec.ts` - New unit tests
4. `apps/api/src/modules/webhook/webhook.service.spec.ts` - Integration tests
5. `docs/webhook-payload-diffing.md` - Feature documentation

## Acceptance Criteria Met

✅ **Implemented**: Payload diffing functionality is fully implemented and working
✅ **Documented**: Comprehensive documentation in `docs/webhook-payload-diffing.md`
✅ **Tested**: Unit and integration tests cover primary path and edge cases
✅ **Compatible**: Existing API compatibility is preserved (optional field)
✅ **Impacts Considered**: Security, privacy, performance, and operational impacts documented

## Next Steps (Optional)

1. Add UI visualization in the webhook tester interface
2. Display diff indicators for changed fields
3. Add side-by-side payload comparison view
4. Export diffs as part of history export functionality
