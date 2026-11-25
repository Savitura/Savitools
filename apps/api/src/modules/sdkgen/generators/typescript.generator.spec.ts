import { TypeScriptGenerator } from './typescript.generator';
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
        parameters: [{ name: 'id', in: 'path', example: 'a<b' }],
      },
      post: {
        summary: 'Create',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                properties: { note: { type: 'string', example: "a'b<c" } },
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

const complexResponseSpec: OpenApiSpec = {
  servers: [{ url: 'https://api.example.com' }],
  paths: {
    '/users/{id}': {
      get: {
        summary: 'Get user',
        parameters: [{ name: 'id', in: 'path', example: 'user-1' }],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id', 'email', 'profile'],
                  properties: {
                    id: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    age: { type: 'integer' },
                    active: { type: 'boolean' },
                    tags: { type: 'array', items: { type: 'string' } },
                    profile: {
                      type: 'object',
                      properties: {
                        bio: { type: 'string' },
                        avatar: { type: 'string', format: 'uri' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

describe('TypeScriptGenerator', () => {
  const generator = new TypeScriptGenerator();

  it('generates correct imports and setup', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain("import axios from 'axios';");
    expect(output).toContain("const API_KEY = process.env.API_KEY ?? '';");
  });

  it('generates interface for object responses', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('interface GetItemsIdResponse {');
    expect(output).toContain('"id": string;');
    expect(output).toContain('"name": string;');
  });

  it('generates type alias for array responses', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('type PutItemsIdResponse = string[];');
  });

  it('generates axios calls for all HTTP methods', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('axios.get(');
    expect(output).toContain('axios.post(');
    expect(output).toContain('axios.put(');
    expect(output).toContain('axios.patch(');
    expect(output).toContain('axios.delete(');
  });

  it('includes query parameters in params option', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('params: { "include": "details" }');
  });

  it('replaces path parameters with examples', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('/items/item-1');
  });

  it('includes request body for POST, PUT, PATCH', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('{ "name": "widget" }');
  });

  it('omits request body for GET and DELETE', () => {
    const output = generator.generate({ spec: baseSpec });

    const getSection = output.split('axios.get(')[1].split('axios.post(')[0];
    const deleteSection = output.split('axios.delete(')[1];
    expect(getSection).not.toContain('{ "name"');
    expect(deleteSection).not.toContain('{ "name"');
  });

  it('handles escaped characters in path parameters', () => {
    const output = generator.generate({ spec: escapingSpec });

    expect(output).toContain('a\\u003cb');
  });

  it('handles escaped characters in request body', () => {
    const output = generator.generate({ spec: escapingSpec });

    expect(output).toContain("a'b\\u003cc");
  });

  it('uses default base URL when no servers defined', () => {
    const output = generator.generate({ spec: noServerSpec });

    expect(output).toContain('https://api.example.com/test');
  });

  it('includes operation summary as comment', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('// Read item');
    expect(output).toContain('// Create item');
    expect(output).toContain('// Replace item');
    expect(output).toContain('// Patch item');
    expect(output).toContain('// Delete item');
  });

  it('includes type annotation for typed responses', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('const response: GetItemsIdResponse');
    expect(output).toContain('const response: PutItemsIdResponse');
  });

  it('omits type annotation for responses without schema', () => {
    const output = generator.generate({ spec: baseSpec });

    const patchSection = output.split('axios.patch(')[1].split('axios.delete(')[0];
    expect(patchSection).not.toContain(': ');
    expect(patchSection).toContain('const response = await');
  });

  it('logs response data', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('console.log(response.data);');
  });

  it('generates complex interface with nested types', () => {
    const output = generator.generate({ spec: complexResponseSpec });

    expect(output).toContain('interface GetUsersIdResponse {');
    expect(output).toContain('"id": string;');
    expect(output).toContain('"email": string;');
    expect(output).toContain('"age": number;');
    expect(output).toContain('"active": boolean;');
    expect(output).toContain('"tags": string[];');
    expect(output).toContain('"profile": {');
    expect(output).toContain('"bio": string;');
    expect(output).toContain('"avatar": string;');
  });

  it('marks optional properties with ?', () => {
    const spec: OpenApiSpec = {
      servers: [{ url: 'https://api.example.com' }],
      paths: {
        '/test': {
          get: {
            summary: 'Test',
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['requiredField'],
                      properties: {
                        requiredField: { type: 'string' },
                        optionalField: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const output = generator.generate({ spec });

    expect(output).toContain('"requiredField": string;');
    expect(output).toContain('"optionalField"?: string;');
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

    expect(output).toContain('const response = await axios.post(');
    expect(output).toContain('console.log(response.data);');
  });

  it('handles empty path (no path parameters)', () => {
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

    expect(output).toContain('axios.get("https://api.example.com/items"');
    expect(output).not.toContain('params:');
  });

  it('handles multiple query parameters', () => {
    const spec: OpenApiSpec = {
      servers: [{ url: 'https://api.example.com' }],
      paths: {
        '/search': {
          get: {
            summary: 'Search',
            parameters: [
              { name: 'q', in: 'query', schema: { type: 'string', example: 'test' } },
              { name: 'limit', in: 'query', schema: { type: 'integer', example: '10' } },
              { name: 'offset', in: 'query', schema: { type: 'integer', example: '0' } },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };
    const output = generator.generate({ spec });

    expect(output).toContain('params: { "q": "test", "limit": "10", "offset": "0" }');
  });

  it('escapes < characters in string literals', () => {
    const spec: OpenApiSpec = {
      servers: [{ url: 'https://api.example.com' }],
      paths: {
        '/test': {
          post: {
            summary: 'Test',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    properties: { html: { type: 'string', example: '<script>alert(1)</script>' } },
                  },
                },
              },
            },
          },
        },
      },
    };
    const output = generator.generate({ spec });

    expect(output).toContain('\\u003cscript\\u003ealert(1)\\u003c/script\\u003e');
  });

  it('uses template literal for Authorization header', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('Authorization: `Bearer ${API_KEY}`');
  });

  it('includes headers in axios options object', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('headers: { Authorization: `Bearer ${API_KEY}` }');
  });
});