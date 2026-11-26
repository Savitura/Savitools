import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

/**
 * Maximum number of operations allowed in a single Stellar transaction,
 * matching the Stellar consensus protocol limit (100 operations).
 */
export const MAX_OPERATIONS_PER_TRANSACTION = 100;

/**
 * Maximum number of steps allowed in a transaction sequence run.
 */
export const MAX_SEQUENCE_STEPS = 100;

/**
 * Default maximum nesting depth for arbitrary JSON structures in operation payloads.
 * Set to 6 to safely accommodate complex Soroban ScVal vectors/maps and path payments,
 * while preventing deeply nested call stacks or DoS vectors.
 */
export const DEFAULT_MAX_JSON_DEPTH = 6;

/**
 * Default maximum byte size for an individual operation or payload (64 KB).
 */
export const DEFAULT_MAX_JSON_BYTES = 65_536; // 64 KB

export interface BoundedJsonOptions {
  maxDepth?: number;
  maxBytes?: number;
}

/**
 * Measures the maximum nesting depth of an arbitrary JSON value.
 * Primitives have depth 0. Empty objects/arrays have depth 1.
 * Circular references return Number.POSITIVE_INFINITY.
 */
export function calculateJsonDepth(
  value: unknown,
  currentDepth = 0,
  seen = new Set<unknown>(),
): number {
  if (value === null || typeof value !== 'object') {
    return currentDepth;
  }

  if (seen.has(value)) {
    return Number.POSITIVE_INFINITY;
  }

  seen.add(value);
  let maxChildDepth = currentDepth + 1;

  if (Array.isArray(value)) {
    for (const item of value) {
      maxChildDepth = Math.max(maxChildDepth, calculateJsonDepth(item, currentDepth + 1, seen));
    }
  } else {
    for (const val of Object.values(value)) {
      maxChildDepth = Math.max(maxChildDepth, calculateJsonDepth(val, currentDepth + 1, seen));
    }
  }

  seen.delete(value);
  return maxChildDepth;
}

/**
 * Measures the UTF-8 byte length of a JSON-serializable value.
 * Returns Number.POSITIVE_INFINITY if serialization fails.
 */
export function calculateJsonByteSize(value: unknown): number {
  if (value === undefined) {
    return 0;
  }
  if (typeof value === 'string') {
    return Buffer.byteLength(value, 'utf8');
  }
  try {
    const json = JSON.stringify(value);
    return Buffer.byteLength(json, 'utf8');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Validator decorator that enforces upper bounds on JSON nesting depth and serialized byte size.
 * Handles both individual objects/values and arrays (validating each item in the array).
 */
export function IsBoundedJson(
  options: BoundedJsonOptions = {},
  validationOptions?: ValidationOptions,
) {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_JSON_DEPTH;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_JSON_BYTES;

  return function (object: object, propertyName: string) {
    let lastError = '';

    registerDecorator({
      name: 'isBoundedJson',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [maxDepth, maxBytes],
      options: validationOptions,
      validator: {
        validate(value: unknown, _args: ValidationArguments) {
          lastError = '';

          const checkNode = (item: unknown, itemIndex?: number): boolean => {
            if (item === undefined || item === null) {
              return true;
            }

            const depth = calculateJsonDepth(item);
            if (depth > maxDepth) {
              const prefix = itemIndex !== undefined ? `item [${itemIndex}] ` : '';
              lastError = `${prefix}nesting depth of ${depth} exceeds maximum allowed depth of ${maxDepth}`;
              return false;
            }

            const byteSize = calculateJsonByteSize(item);
            if (byteSize > maxBytes) {
              const prefix = itemIndex !== undefined ? `item [${itemIndex}] ` : '';
              lastError = `${prefix}payload size of ${byteSize} bytes exceeds maximum allowed limit of ${maxBytes} bytes`;
              return false;
            }

            return true;
          };

          if (value === undefined || value === null) {
            return true;
          }

          if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
              if (!checkNode(value[i], i)) {
                return false;
              }
            }
            return true;
          }

          return checkNode(value);
        },
        defaultMessage(args: ValidationArguments) {
          if (lastError) {
            return `${args.property} ${lastError}`;
          }
          return `${args.property} exceeds JSON depth (max ${maxDepth}) or byte size (max ${maxBytes}) limits`;
        },
      },
    });
  };
}
