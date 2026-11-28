import {
  operationsFor,
  resolveSchema,
  refName,
  schemaExample,
  parameterExample,
  queryParameters,
  requestProperties,
  responseSchema,
  responseTypeName,
  schemaToTypeScript,
  schemaToPython,
  schemaToGo,
  isObjectSchema,
  HTTP_METHODS,
  METHODS_WITH_BODY,
} from './types';
import { OpenApiSpec, OpenApiOperation, OpenApiParameter, JsonSchema } from './types';

describe('SDK generator types utilities', () => {
  const spec: OpenApiSpec = {
    servers: [{ url: 'https://api.example.com' }],
    paths: {
      '/items/{id}': {
        get: {
          summary: 'Read item',
          parameters: [
            { name: 'id', in: 'path', required: true, example: 'item-1' },
            { name: 'include', in: 'query', schema: { type: 'string', example: 'details' } },
            { name: 'header', in: 'header', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['id', 'name'],
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      tags: { type: 'array', items: { type: 'string' } },
                      profile: {
                        type: 'object',
                        properties: { bio: { type: 'string' } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: 'Create item',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { name: { type: 'string', example: 'widget' } },
                },
              },
            },
          },
        },
      },
      '/search': {
        get: {
          summary: 'Search',
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string', example: 'test' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', example: '10' } },
          ],
          responses: { '200': { description: 'OK' } },
        },
      },
    },
    components: {
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
          },
        },
      },
    },
  };

  describe('operationsFor', () => {
    it('returns all operations for all paths', () => {
      const ops = operationsFor({ spec });
      expect(ops.length).toBe(3);
      expect(ops.map((o) => `${o.method} ${o.path}`)).toEqual([
        'get /items/{id}',
        'post /items/{id}',
        'get /search',
      ]);
    });

    it('filters by endpoint when provided', () => {
      const ops = operationsFor({ spec, endpoint: '/items/{id}' });
      expect(ops.length).toBe(2);
      expect(ops.map((o) => `${o.method} ${o.path}`)).toEqual([
        'get /items/{id}',
        'post /items/{id}',
      ]);
    });

    it('ignores non-HTTP methods', () => {
      const specWithInvalid: OpenApiSpec = {
        paths: {
          '/test': {
            get: { summary: 'Valid' },
            invalid: { summary: 'Invalid' } as any,
          },
        },
      };
      const ops = operationsFor({ spec: specWithInvalid });
      expect(ops.length).toBe(1);
    });

    it('returns empty array for empty spec', () => {
      const ops = operationsFor({ spec: { paths: {} } });
      expect(ops).toEqual([]);
    });
  });

  describe('resolveSchema', () => {
    it('returns schema as-is when no ref', () => {
      const schema: JsonSchema = { type: 'string' };
      expect(resolveSchema(schema, spec)).toEqual(schema);
    });

    it('resolves local $ref to components.schemas', () => {
      const schema: JsonSchema = { $ref: '#/components/schemas/User' };
      const resolved = resolveSchema(schema, spec);
      expect(resolved).toEqual(spec.components!.schemas!.User);
    });

    it('returns original schema when ref not found', () => {
      const schema: JsonSchema = { $ref: '#/components/schemas/NonExistent' };
      const resolved = resolveSchema(schema, spec);
      expect(resolved).toEqual(schema);
    });

    it('handles nested refs', () => {
      const nestedSpec: OpenApiSpec = {
        paths: {},
        components: {
          schemas: {
            A: { $ref: '#/components/schemas/B' },
            B: { type: 'string' },
          },
        },
      };
      const resolved = resolveSchema({ $ref: '#/components/schemas/A' }, nestedSpec);
      expect(resolved).toEqual({ type: 'string' });
    });

    it('prevents infinite recursion with depth limit', () => {
      const circularSpec: OpenApiSpec = {
        paths: {},
        components: {
          schemas: {
            A: { $ref: '#/components/schemas/B' },
            B: { $ref: '#/components/schemas/A' },
          },
        },
      };
      const resolved = resolveSchema({ $ref: '#/components/schemas/A' }, circularSpec);
      expect(resolved).toEqual({ $ref: '#/components/schemas/A' });
    });
  });

  describe('refName', () => {
    it('extracts name from ref path', () => {
      expect(refName('#/components/schemas/User')).toBe('User');
      expect(refName('User')).toBe('User');
    });

    it('sanitizes non-alphanumeric characters', () => {
      expect(refName('#/components/schemas/User-Profile')).toBe('UserProfile');
      expect(refName('#/components/schemas/User.Profile')).toBe('UserProfile');
    });

    it('returns Schema for empty name', () => {
      expect(refName('#/components/schemas/')).toBe('Schema');
    });
  });

  describe('schemaExample', () => {
    it('returns explicit example', () => {
      expect(schemaExample({ type: 'string', example: 'custom' })).toBe('custom');
    });

    it('returns default when no example', () => {
      expect(schemaExample({ type: 'string', default: 'default' })).toBe('default');
    });

    it('returns first enum value', () => {
      expect(schemaExample({ type: 'string', enum: ['a', 'b'] })).toBe('a');
    });

    it('returns type-specific defaults', () => {
      expect(schemaExample({ type: 'integer' })).toBe(0);
      expect(schemaExample({ type: 'number' })).toBe(0.0);
      expect(schemaExample({ type: 'boolean' })).toBe(false);
      expect(schemaExample({ type: 'array' })).toEqual([]);
      expect(schemaExample({ type: 'object' })).toEqual({});
    });

    it('handles string formats', () => {
      expect(schemaExample({ type: 'string', format: 'date-time' })).toBe('1970-01-01T00:00:00.000Z');
      expect(schemaExample({ type: 'string', format: 'date' })).toBe('1970-01-01');
      expect(schemaExample({ type: 'string', format: 'uuid' })).toBe('00000000-0000-0000-0000-000000000000');
      expect(schemaExample({ type: 'string', format: 'email' })).toBe('user@example.com');
      expect(schemaExample({ type: 'string', format: 'uri' })).toBe('https://example.com');
    });

    it('uses title for string default', () => {
      expect(schemaExample({ type: 'string', title: 'User Name' })).toBe('user_name');
    });

    it('returns empty string for unknown types', () => {
      expect(schemaExample({ type: 'unknown' })).toBe('');
      expect(schemaExample(undefined)).toBe('');
    });
  });

  describe('parameterExample', () => {
    it('uses parameter example over schema example', () => {
      const param: OpenApiParameter = {
        name: 'test',
        in: 'query',
        example: 'param-example',
        schema: { type: 'string', example: 'schema-example' },
      };
      expect(parameterExample(param)).toBe('param-example');
    });

    it('falls back to schema example', () => {
      const param: OpenApiParameter = {
        name: 'test',
        in: 'query',
        schema: { type: 'string', example: 'schema-example' },
      };
      expect(parameterExample(param)).toBe('schema-example');
    });
  });

  describe('queryParameters', () => {
    it('filters only query parameters', () => {
      const op: OpenApiOperation = {
        parameters: [
          { name: 'path', in: 'path' },
          { name: 'query', in: 'query' },
          { name: 'header', in: 'header' },
        ],
      };
      const queries = queryParameters(op);
      expect(queries.length).toBe(1);
      expect(queries[0].name).toBe('query');
    });

    it('returns empty array when no parameters', () => {
      expect(queryParameters({})).toEqual([]);
      expect(queryParameters({ parameters: [] })).toEqual([]);
    });
  });

  describe('requestProperties', () => {
    it('extracts properties from requestBody', () => {
      const op: OpenApiOperation = {
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { name: { type: 'string' }, age: { type: 'integer' } },
              },
            },
          },
        },
      };
      const props = requestProperties(op, spec);
      expect(props).toEqual({
        name: { type: 'string' },
        age: { type: 'integer' },
      });
    });

    it('resolves $ref in request body', () => {
      const op: OpenApiOperation = {
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/User' },
            },
          },
        },
      };
      const props = requestProperties(op, spec);
      expect(props).toEqual({
        id: { type: 'string' },
        email: { type: 'string' },
      });
    });

    it('returns empty object when no request body', () => {
      expect(requestProperties({}, spec)).toEqual({});
      expect(requestProperties({ requestBody: {} }, spec)).toEqual({});
    });
  });

  describe('responseSchema', () => {
    it('prefers 200 response', () => {
      const op: OpenApiOperation = {
        responses: {
          '200': {
            content: { 'application/json': { schema: { type: 'string' } } },
          },
          '201': {
            content: { 'application/json': { schema: { type: 'integer' } } },
          },
        },
      };
      const schema = responseSchema(op, spec);
      expect(schema).toEqual({ type: 'string' });
    });

    it('falls back to other 2xx codes', () => {
      const op: OpenApiOperation = {
        responses: {
          '201': {
            content: { 'application/json': { schema: { type: 'integer' } } },
          },
        },
      };
      const schema = responseSchema(op, spec);
      expect(schema).toEqual({ type: 'integer' });
    });

    it('falls back to default response', () => {
      const op: OpenApiOperation = {
        responses: {
          default: {
            content: { 'application/json': { schema: { type: 'boolean' } } },
          },
        },
      };
      const schema = responseSchema(op, spec);
      expect(schema).toEqual({ type: 'boolean' });
    });

    it('returns undefined when no content', () => {
      const op: OpenApiOperation = {
        responses: {
          '200': { description: 'OK' },
        },
      };
      expect(responseSchema(op, spec)).toBeUndefined();
    });

    it('resolves $ref in response', () => {
      const op: OpenApiOperation = {
        responses: {
          '200': {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
          },
        },
      };
      const schema = responseSchema(op, spec);
      expect(schema).toEqual({ type: 'object', properties: { id: { type: 'string' }, email: { type: 'string' } } });
    });
  });

  describe('responseTypeName', () => {
    it('generates PascalCase name from method and path', () => {
      expect(responseTypeName('get', '/items/{id}')).toBe('GetItemsIdResponse');
      expect(responseTypeName('post', '/users/{id}/posts')).toBe('PostUsersIdPostsResponse');
    });

    it('handles paths without parameters', () => {
      expect(responseTypeName('get', '/search')).toBe('GetSearchResponse');
    });

    it('prefixes with Response when starting with number', () => {
      expect(responseTypeName('get', '/123/test')).toBe('ResponseGet123TestResponse');
    });
  });

  describe('schemaToTypeScript', () => {
    it('maps primitive types', () => {
      expect(schemaToTypeScript({ type: 'integer' })).toBe('number');
      expect(schemaToTypeScript({ type: 'number' })).toBe('number');
      expect(schemaToTypeScript({ type: 'boolean' })).toBe('boolean');
      expect(schemaToTypeScript({ type: 'string' })).toBe('string');
    });

    it('maps array types', () => {
      expect(schemaToTypeScript({ type: 'array', items: { type: 'string' } })).toBe('string[]');
      expect(schemaToTypeScript({ type: 'array', items: { type: 'integer' } })).toBe('number[]');
    });

    it('maps object types with required/optional', () => {
      const schema: JsonSchema = {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' }, name: { type: 'string' } },
      };
      expect(schemaToTypeScript(schema)).toBe('{ "id": string; "name"?: string; }');
    });

    it('handles empty object', () => {
      expect(schemaToTypeScript({ type: 'object' })).toBe('Record<string, unknown>');
    });

    it('handles enums as union types', () => {
      expect(schemaToTypeScript({ type: 'string', enum: ['a', 'b'] })).toBe('"a" | "b"');
      expect(schemaToTypeScript({ type: 'string', enum: ['a', 'b'], nullable: true })).toBe('"a" | "b" | null');
    });

    it('resolves $ref', () => {
      expect(schemaToTypeScript({ $ref: '#/components/schemas/User' }, spec)).toBe('User');
    });

    it('handles nullable', () => {
      expect(schemaToTypeScript({ type: 'string', nullable: true })).toBe('string | null');
    });

    it('handles oneOf as union', () => {
      expect(schemaToTypeScript({ oneOf: [{ type: 'string' }, { type: 'number' }] })).toBe('string | number');
    });

    it('handles anyOf as union', () => {
      expect(schemaToTypeScript({ anyOf: [{ type: 'string' }, { type: 'number' }] })).toBe('string | number');
    });

    it('handles allOf as intersection', () => {
      expect(schemaToTypeScript({ allOf: [{ type: 'string' }, { type: 'number' }] })).toBe('string & number');
    });

    it('returns unknown for unrecognized types', () => {
      expect(schemaToTypeScript({ type: 'custom' })).toBe('unknown');
    });
  });

  describe('schemaToPython', () => {
    it('maps primitive types', () => {
      expect(schemaToPython({ type: 'integer' })).toBe('int');
      expect(schemaToPython({ type: 'number' })).toBe('float');
      expect(schemaToPython({ type: 'boolean' })).toBe('bool');
      expect(schemaToPython({ type: 'string' })).toBe('str');
    });

    it('maps array types', () => {
      expect(schemaToPython({ type: 'array', items: { type: 'string' } })).toBe('List[str]');
    });

    it('maps object types', () => {
      expect(schemaToPython({ type: 'object' })).toBe('Dict[str, Any]');
    });

    it('handles enums as str', () => {
      expect(schemaToPython({ type: 'string', enum: ['a', 'b'] })).toBe('str');
    });

    it('resolves $ref', () => {
      expect(schemaToPython({ $ref: '#/components/schemas/User' }, spec)).toBe('User');
    });

    it('handles nullable as Optional', () => {
      expect(schemaToPython({ type: 'string', nullable: true })).toBe('Optional[str]');
    });

    it('returns Any for unrecognized types', () => {
      expect(schemaToPython({ type: 'custom' })).toBe('Any');
    });
  });

  describe('schemaToGo', () => {
    it('maps primitive types', () => {
      expect(schemaToGo({ type: 'integer' })).toBe('int');
      expect(schemaToGo({ type: 'number' })).toBe('float64');
      expect(schemaToGo({ type: 'boolean' })).toBe('bool');
      expect(schemaToGo({ type: 'string' })).toBe('string');
    });

    it('maps array types', () => {
      expect(schemaToGo({ type: 'array', items: { type: 'string' } })).toBe('[]string');
    });

    it('maps object types', () => {
      expect(schemaToGo({ type: 'object' })).toBe('map[string]interface{}');
    });

    it('resolves $ref', () => {
      expect(schemaToGo({ $ref: '#/components/schemas/User' }, spec)).toBe('User');
    });

    it('returns interface{} for unrecognized types', () => {
      expect(schemaToGo({ type: 'custom' })).toBe('interface{}');
    });
  });

  describe('isObjectSchema', () => {
    it('returns true for object with properties', () => {
      expect(isObjectSchema({ type: 'object', properties: { a: { type: 'string' } } })).toBe(true);
    });

    it('returns false for $ref', () => {
      expect(isObjectSchema({ $ref: '#/components/schemas/User' }, spec)).toBe(false);
    });

    it('returns false for object without properties', () => {
      expect(isObjectSchema({ type: 'object' })).toBe(false);
      expect(isObjectSchema({ type: 'object', properties: {} })).toBe(false);
    });

    it('returns false for non-object types', () => {
      expect(isObjectSchema({ type: 'string' })).toBe(false);
      expect(isObjectSchema({ type: 'array' })).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isObjectSchema(undefined)).toBe(false);
    });
  });

  describe('HTTP_METHODS and METHODS_WITH_BODY constants', () => {
    it('contains all standard HTTP methods', () => {
      expect(HTTP_METHODS.has('get')).toBe(true);
      expect(HTTP_METHODS.has('post')).toBe(true);
      expect(HTTP_METHODS.has('put')).toBe(true);
      expect(HTTP_METHODS.has('patch')).toBe(true);
      expect(HTTP_METHODS.has('delete')).toBe(true);
      expect(HTTP_METHODS.has('head')).toBe(true);
      expect(HTTP_METHODS.has('options')).toBe(true);
    });

    it('identifies methods with body', () => {
      expect(METHODS_WITH_BODY.has('post')).toBe(true);
      expect(METHODS_WITH_BODY.has('put')).toBe(true);
      expect(METHODS_WITH_BODY.has('patch')).toBe(true);
      expect(METHODS_WITH_BODY.has('get')).toBe(false);
      expect(METHODS_WITH_BODY.has('delete')).toBe(false);
    });
  });
});