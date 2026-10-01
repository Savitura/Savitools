export interface JsonSchema {
  type?: string;
  format?: string;
  title?: string;
  description?: string;
  example?: unknown;
  default?: unknown;
  enum?: unknown[];
  const?: unknown;
  nullable?: boolean;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  allOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  $ref?: string;
}

export interface OpenApiParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  schema?: JsonSchema;
  example?: unknown;
}

export interface OpenApiMediaType {
  schema?: JsonSchema;
  example?: unknown;
}

export interface OpenApiResponse {
  description?: string;
  content?: Record<string, OpenApiMediaType>;
}

export interface OpenApiRequestBody {
  required?: boolean;
  content?: Record<string, OpenApiMediaType>;
}

export interface OpenApiOperation {
  summary?: string;
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses?: Record<string, OpenApiResponse>;
}

export interface OpenApiSpec {
  servers?: { url: string }[];
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, JsonSchema> };
}

export interface GeneratorContext {
  spec: OpenApiSpec;
  endpoint?: string;
}

export interface CodeGenerator {
  generate(context: GeneratorContext): string;
}

export interface OperationEntry {
  path: string;
  method: string;
  operation: OpenApiOperation;
}

/** Every HTTP method the generators understand. */
export const HTTP_METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
]);

/** Methods that conventionally carry a JSON request body. */
export const METHODS_WITH_BODY = new Set(['post', 'put', 'patch']);

const RESPONSE_PREFERENCE = [
  '200',
  '201',
  '202',
  '203',
  '204',
  '205',
  '206',
];

export function operationsFor(context: GeneratorContext): OperationEntry[] {
  const paths = context.endpoint
    ? { [context.endpoint]: context.spec.paths[context.endpoint] }
    : context.spec.paths;
  const operations: OperationEntry[] = [];
  for (const [path, pathItem] of Object.entries(paths || {})) {
    if (!pathItem) continue;
    for (const [method, operation] of Object.entries(pathItem)) {
      if (HTTP_METHODS.has(method) && operation) {
        operations.push({ path, method, operation });
      }
    }
  }
  return operations;
}

/** Inlines a local `$ref` (bounded) so generators can read the real schema. */
export function resolveSchema(
  schema: JsonSchema | undefined,
  spec?: OpenApiSpec,
  depth = 0,
): JsonSchema | undefined {
  if (!schema || depth > 6) return schema;
  if (schema.$ref && spec?.components?.schemas) {
    const name = schema.$ref.split('/').pop();
    const target = name ? spec.components.schemas?.[name] : undefined;
    if (target) return resolveSchema(target, spec, depth + 1);
  }
  return schema;
}

/** The schema name a `$ref` points at, for named type generation. */
export function refName(ref: string): string {
  const last = ref.split('/').pop() ?? 'Schema';
  return last.replace(/[^a-zA-Z0-9]+/g, '') || 'Schema';
}

export function schemaExample(schema: JsonSchema | undefined): unknown {
  if (!schema) return '';
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
  switch (schema.type) {
    case 'integer':
      return 0;
    case 'number':
      return 0.0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      return {};
    case 'string': {
      const fmt = schema.format;
      if (fmt === 'date-time') return new Date(0).toISOString();
      if (fmt === 'date') return '1970-01-01';
      if (fmt === 'time') return '00:00:00';
      if (fmt === 'uuid') return '00000000-0000-0000-0000-000000000000';
      if (fmt === 'email') return 'user@example.com';
      if (fmt === 'uri' || fmt === 'url') return 'https://example.com';
      if (fmt === 'hostname') return 'example.com';
      if (fmt === 'ipv4') return '127.0.0.1';
      if (fmt === 'ipv6') return '::1';
      if (fmt === 'password') return '********';
      if (fmt === 'byte' || fmt === 'binary') return '';
      if (schema.title) return schema.title.toLowerCase().replace(/\s+/g, '_');
      return '';
    }
    default:
      return '';
  }
}

export function parameterExample(parameter: OpenApiParameter): unknown {
  return parameter.example ?? schemaExample(parameter.schema);
}

export function queryParameters(
  operation: OpenApiOperation,
): OpenApiParameter[] {
  return (operation.parameters ?? []).filter(
    (parameter) => parameter.in === 'query',
  );
}

export function requestProperties(
  operation: OpenApiOperation,
  spec?: OpenApiSpec,
): Record<string, JsonSchema> {
  const schema = resolveSchema(
    operation.requestBody?.content?.['application/json']?.schema,
    spec,
  );
  return schema?.properties ?? {};
}

/** The `application/json` schema of the operation's primary success response. */
export function responseSchema(
  operation: OpenApiOperation,
  spec?: OpenApiSpec,
): JsonSchema | undefined {
  const responses = operation.responses ?? {};
  const keys = Object.keys(responses);
  const preferred =
    RESPONSE_PREFERENCE.find((key) => responses[key]) ??
    keys.find((key) => /^2\d\d$/.test(key)) ??
    (responses.default ? 'default' : keys[0]);
  const response = preferred ? responses[preferred] : undefined;
  if (!response?.content) return undefined;
  const media =
    response.content['application/json'] ??
    Object.values(response.content)[0];
  return media?.schema ? resolveSchema(media.schema, spec) : undefined;
}

function pascalCase(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part) =>
      part.length === 0
        ? ''
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('');
}

/** A stable, language-agnostic name for an operation's response type. */
export function responseTypeName(method: string, path: string): string {
  const name = `${pascalCase(method)}${pascalCase(path)}Response`;
  return /^[A-Za-z]/.test(name) ? name : `Response${name}`;
}

function needsParentheses(type: string): boolean {
  return type.includes(' | ') || type.includes(' & ');
}

/** Maps a schema to a TypeScript type expression. */
export function schemaToTypeScript(
  schema: JsonSchema | undefined,
  spec?: OpenApiSpec,
  depth = 0,
): string {
  const resolved = resolveSchema(schema, spec, depth);
  if (!resolved || depth > 6) return 'unknown';
  if (resolved.$ref) return refName(resolved.$ref);
  if (resolved.enum?.length) {
    const union = resolved.enum
      .map((value) => JSON.stringify(value))
      .join(' | ');
    return resolved.nullable ? `${union} | null` : union;
  }

  let type: string;
  switch (resolved.type) {
    case 'integer':
    case 'number':
      type = 'number';
      break;
    case 'boolean':
      type = 'boolean';
      break;
    case 'string':
      type = 'string';
      break;
    case 'array': {
      const item = schemaToTypeScript(resolved.items, spec, depth + 1);
      type = `${needsParentheses(item) ? `(${item})` : item}[]`;
      break;
    }
    case 'object': {
      const entries = Object.entries(resolved.properties ?? {});
      const required = new Set(resolved.required ?? []);
      type = entries.length
        ? `{ ${entries
            .map(
              ([key, value]) =>
                `${JSON.stringify(key)}${required.has(key) ? '' : '?'}: ${schemaToTypeScript(
                  value,
                  spec,
                  depth + 1,
                )}`,
            )
            .join('; ')} }`
        : 'Record<string, unknown>';
      break;
    }
    default:
      if (resolved.oneOf?.length) {
        type = resolved.oneOf
          .map((entry) => schemaToTypeScript(entry, spec, depth + 1))
          .join(' | ');
      } else if (resolved.anyOf?.length) {
        type = resolved.anyOf
          .map((entry) => schemaToTypeScript(entry, spec, depth + 1))
          .join(' | ');
      } else if (resolved.allOf?.length) {
        type = resolved.allOf
          .map((entry) => schemaToTypeScript(entry, spec, depth + 1))
          .join(' & ');
      } else {
        type = 'unknown';
      }
  }
  return resolved.nullable ? `${type} | null` : type;
}

/** Maps a schema to a Python type expression. */
export function schemaToPython(
  schema: JsonSchema | undefined,
  spec?: OpenApiSpec,
  depth = 0,
): string {
  const resolved = resolveSchema(schema, spec, depth);
  if (!resolved || depth > 6) return 'Any';
  if (resolved.$ref) return refName(resolved.$ref);
  if (resolved.enum?.length) return 'str';

  let type: string;
  switch (resolved.type) {
    case 'integer':
      type = 'int';
      break;
    case 'number':
      type = 'float';
      break;
    case 'boolean':
      type = 'bool';
      break;
    case 'string':
      type = 'str';
      break;
    case 'array':
      type = `List[${schemaToPython(resolved.items, spec, depth + 1)}]`;
      break;
    case 'object':
      type = 'Dict[str, Any]';
      break;
    default:
      type = 'Any';
  }
  return resolved.nullable ? `Optional[${type}]` : type;
}

/** Maps a schema to a Go type expression. */
export function schemaToGo(
  schema: JsonSchema | undefined,
  spec?: OpenApiSpec,
  depth = 0,
): string {
  const resolved = resolveSchema(schema, spec, depth);
  if (!resolved || depth > 6) return 'interface{}';
  if (resolved.$ref) return refName(resolved.$ref);
  switch (resolved.type) {
    case 'integer':
      return 'int';
    case 'number':
      return 'float64';
    case 'boolean':
      return 'bool';
    case 'string':
      return 'string';
    case 'array':
      return `[]${schemaToGo(resolved.items, spec, depth + 1)}`;
    case 'object':
      return 'map[string]interface{}';
    default:
      return 'interface{}';
  }
}

/** True when a response schema should be emitted as a named object type. */
export function isObjectSchema(
  schema: JsonSchema | undefined,
  spec?: OpenApiSpec,
): boolean {
  const resolved = resolveSchema(schema, spec);
  return (
    !resolved?.$ref &&
    resolved?.type === 'object' &&
    Object.keys(resolved.properties ?? {}).length > 0
  );
}
