import { GoGenerator } from './go.generator';
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

describe('GoGenerator', () => {
  const generator = new GoGenerator();

  it('generates package main with correct imports', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('package main');
    expect(output).toContain('import (');
    expect(output).toContain('"fmt"');
    expect(output).toContain('"net/http"');
    expect(output).toContain('"os"');
    expect(output).toContain('"bytes"');
    expect(output).toContain('"encoding/json"');
    expect(output).toContain('"net/url"');
  });

  it('generates struct types for object responses', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('type GetItemsIdResponse struct {');
    expect(output).toContain('Id string `json:"id"`');
    expect(output).toContain('Name string `json:"name"`');
  });

  it('generates type alias for array responses', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('type PutItemsIdResponse []string');
  });

  it('includes main function with API key from env', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('func main() {');
    expect(output).toContain('apiKey := os.Getenv("API_KEY")');
    expect(output).toContain('client := &http.Client{}');
  });

  it('generates HTTP requests for all methods', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('http.NewRequest("GET"');
    expect(output).toContain('http.NewRequest("POST"');
    expect(output).toContain('http.NewRequest("PUT"');
    expect(output).toContain('http.NewRequest("PATCH"');
    expect(output).toContain('http.NewRequest("DELETE"');
  });

  it('handles query parameters with url.Values', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('params := url.Values{}');
    expect(output).toContain('params.Set("include", "details")');
    expect(output).toContain('params.Encode()');
  });

  it('replaces path parameters with examples', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('/items/item-1');
  });

  it('sets Authorization and Content-Type headers', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('req.Header.Set("Authorization", "Bearer "+apiKey)');
    expect(output).toContain('req.Header.Set("Content-Type", "application/json")');
  });

  it('includes request body for POST, PUT, PATCH', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('bytes.NewBufferString');
    expect(output).toContain('"name": "widget"');
  });

  it('uses nil body for GET and DELETE', () => {
    const output = generator.generate({ spec: baseSpec });

    const getSection = output.split('http.NewRequest("GET"')[1].split('http.NewRequest("POST"')[0];
    expect(getSection).toContain('nil');
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

    expect(output).toContain('// Read item');
    expect(output).toContain('// Create item');
    expect(output).toContain('// Replace item');
    expect(output).toContain('// Patch item');
    expect(output).toContain('// Delete item');
  });

  it('parses JSON response for object types', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('var data GetItemsIdResponse');
    expect(output).toContain('json.NewDecoder(resp.Body).Decode(&data)');
    expect(output).toContain('fmt.Println(data)');
  });

  it('handles array response types', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('var data PutItemsIdResponse');
    expect(output).toContain('json.NewDecoder(resp.Body).Decode(&data)');
  });

  it('handles responses without body', () => {
    const output = generator.generate({ spec: baseSpec });

    expect(output).toContain('fmt.Println(resp.Status)');
    expect(output).toContain('resp.Body.Close()');
  });

  it('generates complex nested struct with proper field names', () => {
    const output = generator.generate({ spec: complexResponseSpec });

    expect(output).toContain('type GetUsersIdResponse struct {');
    expect(output).toContain('Id string `json:"id"`');
    expect(output).toContain('Email string `json:"email"`');
    expect(output).toContain('Age int `json:"age"`');
    expect(output).toContain('Active bool `json:"active"`');
    expect(output).toContain('Tags []string `json:"tags"`');
    expect(output).toContain('Profile struct {');
    expect(output).toContain('Bio string `json:"bio"`');
    expect(output).toContain('Avatar string `json:"avatar"`');
  });

  it('converts field names to Go conventions (PascalCase)', () => {
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
                        first_name: { type: 'string' },
                        lastName: { type: 'string' },
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

    expect(output).toContain('FirstName string `json:"first_name"`');
    expect(output).toContain('LastName string `json:"lastName"`');
    expect(output).toContain('Field123field string `json:"123field"`');
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

    expect(output).toContain('fmt.Println(resp.Status)');
  });

  it('sorts imports alphabetically', () => {
    const output = generator.generate({ spec: baseSpec });

    const importSection = output.split('import (')[1].split(')')[0];
    const imports = importSection
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('"'));
    const sorted = [...imports].sort();
    expect(imports).toEqual(sorted);
  });
});