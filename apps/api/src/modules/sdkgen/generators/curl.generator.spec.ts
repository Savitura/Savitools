import { CurlGenerator } from './curl.generator';
import { OpenApiSpec } from './types';

const baseSpec: OpenApiSpec = {
  servers: [{ url: 'https://api.example.com' }],
  paths: {
    '/items/{id}': {
      get: {
        summary: 'Read item',
        parameters: [
          { name: 'id', in: 'path', example: 'item-1' },
          {
            name: 'include',
            in: 'query',
            schema: { type: 'string', example: 'details' },
          },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id'],
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
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
              schema: { properties: { name: { type: 'string', example: 'widget' } } },
            },
          },
        },
      },
      put: {
        summary: 'Replace item',
        parameters: [{ name: 'id', in: 'path', example: 'item-1' }],
        requestBody: {
          content: {
            'application/json': {
              schema: { properties: { name: { type: 'string', example: 'widget' } } },
            },
          },
        },
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
      patch: { summary: 'Patch item' },
      delete: { summary: 'Delete item' },
    },
  },
};

const escapingSpec: OpenApiSpec = {
  servers: [{ url: 'https://api.example.com' }],
  paths: {
    '/items/{id}': {
      get: {
        summary: 'Read',
        parameters: [{ name: 'id', in: 'path', example: 'a"b' }],
      },
      post: {
        summary: 'Create',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                properties: { note: { type: 'string', example: "a'b\\c" } },
              },
            },
          },
        },
      },
      put: { summary: 'Replace' },
      patch: { summary: 'Patch' },
      delete: { summary: 'Delete' },
    },
  },
};

const noServerSpec: OpenApiSpec = {
  paths: {
    '/test': {
      get: {
        summary: 'Test',
        responses: { '200': { description: 'OK' } },
      },
    },
  },
};

describe('CurlGenerator', () => {
  const generator = new CurlGenerator();

  it('generates curl commands for all HTTP methods', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('curl -X GET');
    expect(output).toContain('curl -X POST');
    expect(output).toContain('curl -X PUT');
    expect(output).toContain('curl -X PATCH');
    expect(output).toContain('curl -X DELETE');
  });

  it('includes Authorization header with API_KEY', () => {
    const output = generator.generate({ spec: baseSpec });
    expect(output).toContain('-H "Authorization: Bearer $API_KEY"');
  });

  it('includes Content-Type header for methods with body', () => {
    const output = generator.generate({ spec: baseSpec });
    expect(output).toContain('-H "Content-Type: application/json"');
  });

  it('includes request body data for POST, PUT, PATCH', () => {
    const output = generator.generate({ spec: baseSpec });
    expect(output).toContain('-d');
    expect(output).toContain('"name": "widget"');
  });

  it('does not include request body for GET and DELETE', () => {
    const output = generator.generate({ spec: baseSpec });
    const getSection = output.split('curl -X GET')[1].split('curl -X POST')[0];
    const deleteSection = output.split('curl -X DELETE')[1];
    expect(getSection).not.toContain('-d');
    expect(deleteSection).not.toContain('-d');
  });

  it('replaces path parameters with examples', () => {
    const output = generator.generate({ spec: baseSpec });
    expect(output).toContain('/items/item-1');
  });

  it('appends query parameters to URL', () => {
    const output = generator.generate({ spec: baseSpec });
    expect(output).toContain('?include=details');
  });

  it('handles escaped characters in path parameters', () => {
    const output = generator.generate({ spec: escapingSpec });
    expect(output).toContain('a%22b');
  });

  it('handles escaped characters in request body', () => {
    const output = generator.generate({ spec: escapingSpec });
    expect(output).toContain("a'b\\c");
  });

  it('uses default base URL when no servers defined', () => {
    const output = generator.generate({ spec: noServerSpec });
    expect(output).toContain('https://api.example.com/test');
  });

  it('includes operation summary as comment', () => {
    const output = generator.generate({ spec: baseSpec });
    expect(output).toContain('Read item');
    expect(output).toContain('Create item');
    expect(output).toContain('Replace item');
    expect(output).toContain('Patch item');
    expect(output).toContain('Delete item');
  });

  it('generates valid curl command syntax with line continuations', () => {
    const output = generator.generate({ spec: baseSpec });
    const lines = output.split('\n');
    const continuationLines = lines.filter((line) => line.trim().endsWith('\\'));
    expect(continuationLines.length).toBeGreaterThan(0);
  });

  it('handles operations without responses', () => {
    const spec: OpenApiSpec = {
      servers: [{ url: 'https://api.example.com' }],
      paths: {
        '/test': {
          post: {
            summary: 'No response',
            requestBody: {
              content: {
                'application/json': {
                  schema: { properties: { data: { type: 'string' } } },
                },
              },
            },
          },
        },
      },
    };
    const output = generator.generate({ spec });
    expect(output).toContain('curl -X POST');
    expect(output).toContain('"data": ""');
  });

  it('handles empty path parameters', () => {
    const spec: OpenApiSpec = {
      servers: [{ url: 'https://api.example.com' }],
      paths: {
        '/items': {
          get: {
            summary: 'List items',
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };
    const output = generator.generate({ spec });
    expect(output).toContain('curl -X GET https://api.example.com/items');
    expect(output).not.toContain('?');
  });
});