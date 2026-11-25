import { PythonGenerator } from './python.generator';
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

describe('PythonGenerator', () => {
  const generator = new PythonGenerator();

  it('generates correct imports and setup', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('import os');
    expect(output).toContain('import requests');
    expect(output).toContain('from typing import Any, Dict, List, Optional, TypedDict');
    expect(output).toContain('API_KEY = os.environ.get("API_KEY", "")');
    expect(output).toContain('headers = {"Authorization": f"Bearer {API_KEY}"}');
  });

  it('generates TypedDict for object responses', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('class GetItemsIdResponse(TypedDict, total=False):');
    expect(output).toContain('id: str');
    expect(output).toContain('name: str');
  });

  it('generates type alias for array responses', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('PutItemsIdResponse = List[str]');
  });

  it('generates requests for all HTTP methods', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('requests.get(');
    expect(output).toContain('requests.post(');
    expect(output).toContain('requests.put(');
    expect(output).toContain('requests.patch(');
    expect(output).toContain('requests.delete(');
  });

  it('includes query parameters in params dict', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('params={"include": "details"}');
  });

  it('replaces path parameters with examples', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('/items/item-1');
  });

  it('includes JSON body for POST, PUT, PATCH', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('json={');
    expect(output).toContain('"name": "widget"');
  });

  it('omits JSON body for GET and DELETE', () => {
    const output = generator.generate({ spec: baseSpec });

    const getSection = output.split('requests.get(')[1].split('requests.post(')[0];
    const deleteSection = output.split('requests.delete(')[1];
    expect(getSection).not.toContain('json=');
    expect(deleteSection).not.toContain('json=');
  });

  it('handles escaped characters in path parameters', () => {
    const output = generator.generate({ spec: escapingSpec });

    expect(output).toContain('a"b');
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

    expect(output).toContain('# Read item');
    expect(output).toContain('# Create item');
    expect(output).toContain('# Replace item');
    expect(output).toContain('# Patch item');
    expect(output).toContain('# Delete item');
  });

  it('parses response as JSON for typed responses', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('data: GetItemsIdResponse = response.json()');
    expect(output).toContain('print(data)');
  });

  it('handles array response types', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('data: PutItemsIdResponse = response.json()');
  });

  it('handles responses without explicit schema', () => {
    const output = generator.generate({ spec: baseSpec });

    const patchSection = output.split('requests.patch(')[1].split('requests.delete(')[0];
    expect(patchSection).toContain('print(response.json())');
  });

  it('generates complex TypedDict with nested types', () => {
    const output = generator.generate({ spec: complexResponseSpec });

    expect(output).toContain('class GetUsersIdResponse(TypedDict, total=False):');
    expect(output).toContain('id: str');
    expect(output).toContain('email: str');
    expect(output).toContain('age: int');
    expect(output).toContain('active: bool');
    expect(output).toContain('tags: List[str]');
    expect(output).toContain('profile: Dict[str, Any]');
  });

  it('converts field names to Python conventions (snake_case)', () => {
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
                      properties: {
                        firstName: { type: 'string' },
                        last_name: { type: 'string' },
                        '123field': { type: 'string' },
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

    expect(output).toContain('first_name: str');
    expect(output).toContain('last_name: str');
    expect(output).toContain('field_123field: str');
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

    expect(output).toContain('print(response.json())');
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

    expect(output).toContain('requests.get("https://api.example.com/items"');
    expect(output).not.toContain('params=');
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

    expect(output).toContain('params={"q": "test", "limit": "10", "offset": "0"}');
  });
});