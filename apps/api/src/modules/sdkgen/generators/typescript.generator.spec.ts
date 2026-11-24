import { TypeScriptGenerator } from './typescript.generator';
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
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id'],
                  properties: {
                    id: { type: 'string' },
                    label: { type: 'string' },
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

describe('TypeScriptGenerator', () => {
  const generator = new TypeScriptGenerator();

  it('emits the runtime API key header and escapes the URL literal', () => {
    const output = generator.generate({ spec });

    expect(output).toContain("import axios from 'axios';");
    expect(output).toContain("const API_KEY = process.env.API_KEY ?? '';");
    expect(output).toContain('headers: { Authorization: `Bearer ${API_KEY}` }');
    expect(output).toContain(String.raw`axios.get("https://api.example.com/items/a\"b/c"`);
  });

  it('serializes query values without URL encoding and body values with TypeScript escaping', () => {
    const output = generator.generate({ spec });

    expect(output).toContain('params: { "q": "a b&c/d" }');
    expect(output).toContain(String.raw`{ "note": "a'b\\c\u003ctag>", "count": 0 }`);
  });

  it('emits interfaces with required and optional response fields', () => {
    const output = generator.generate({ spec });

    expect(output).toContain('interface GetItemsIdResponse {');
    expect(output).toContain('"id": string;');
    expect(output).toContain('"label"?: string;');
  });

  it('emits a body argument only for POST, PUT and PATCH', () => {
    const output = generator.generate({
      spec: {
        paths: {
          '/x': {
            get: { requestBody: { content: bodyContent } },
            delete: { requestBody: { content: bodyContent } },
            post: {},
            put: {},
            patch: {},
          },
        },
      },
    });

    expect(output).toContain(
      'axios.get("https://api.example.com/x", { headers: { Authorization: `Bearer ${API_KEY}` } });',
    );
    expect(output).toContain(
      'axios.delete("https://api.example.com/x", { headers: { Authorization: `Bearer ${API_KEY}` } });',
    );
    expect(output.match(/\{  \}/g)).toHaveLength(3);
  });
});
