import { CurlGenerator } from './curl.generator';
import { OpenApiSpec } from './types';

const spec: OpenApiSpec = {
  servers: [{ url: 'https://api.example.com' }],
  paths: {
    '/items/{id}': {
      get: {
        summary: 'Read item',
        parameters: [
          { name: 'id', in: 'path', example: 'a"b/c' },
          { name: 'q', in: 'query', example: 'a b&c/d' },
        ],
      },
      post: {
        summary: 'Create item',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  note: { type: 'string', example: "a'b\\c<tag>" },
                  count: { type: 'integer', example: 0 },
                },
              },
            },
          },
        },
      },
    },
  },
};

const bodyContent = {
  'application/json': {
    schema: { type: 'object', properties: { name: { type: 'string' } } },
  },
};

describe('CurlGenerator', () => {
  const generator = new CurlGenerator();

  it('substitutes path parameters and URL-encodes query parameters', () => {
    const output = generator.generate({ spec });

    expect(output).toContain('curl -X GET https://api.example.com/items/a"b/c?q=a%20b%26c%2Fd \\');
    expect(output).toContain('  -H "Authorization: Bearer $API_KEY"');
    expect(output).not.toContain('Bearer undefined');
  });

  it('serializes JSON request bodies with escaping for JSON string values', () => {
    const output = generator.generate({ spec });

    expect(output).toContain('curl -X POST https://api.example.com/items/{id} \\');
    expect(output).toContain('  -H "Content-Type: application/json"');
    expect(output).toContain(String.raw`-d '{ "note": "a'b\\c<tag>", "count": 0 }'`);
  });

  it('emits body headers only for POST, PUT and PATCH', () => {
    const output = generator.generate({
      spec: {
        paths: {
          '/x': {
            get: { requestBody: { content: bodyContent } },
            delete: { requestBody: { content: bodyContent } },
            head: { requestBody: { content: bodyContent } },
            options: { requestBody: { content: bodyContent } },
            post: {},
            put: {},
            patch: {},
          },
        },
      },
    });

    expect(output.match(/Content-Type: application\/json/g)).toHaveLength(3);
    expect(output).not.toContain('-d ');
  });

  it('filters by endpoint and falls back to the default server URL', () => {
    expect(generator.generate({ spec, endpoint: '/missing' })).toBe('');

    const output = generator.generate({
      spec: { ...spec, servers: undefined },
      endpoint: '/items/{id}',
    });
    expect(output).toContain('https://api.example.com/items/{id}');
    expect(output).not.toContain('TODO');
  });
});
