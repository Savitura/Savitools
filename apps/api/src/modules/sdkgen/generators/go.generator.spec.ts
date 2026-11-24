import { GoGenerator } from './go.generator';
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
                    'user-id': { type: 'string' },
                    '2fa': { type: 'boolean' },
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

describe('GoGenerator', () => {
  const generator = new GoGenerator();

  it('imports only the packages required by the operations', () => {
    const output = generator.generate({ spec });

    expect(output).toContain(
      'import (\n\t"bytes"\n\t"encoding/json"\n\t"fmt"\n\t"net/http"\n\t"net/url"\n\t"os"\n)',
    );
  });

  it('escapes path values for Go strings and passes query values unescaped to url.Values', () => {
    const output = generator.generate({ spec });

    expect(output).toContain('reqURL := "https://api.example.com/items/a\\"b/c"');
    expect(output).toContain('params.Set("q", "a b&c/d")');
    expect(output).toContain('reqURL += "?" + params.Encode()');
    expect(output).toContain('req.Header.Set("Authorization", "Bearer "+apiKey)');
    expect(output).toContain('req.Header.Set("Content-Type", "application/json")');
  });

  it('serializes JSON request bodies as escaped Go string literals', () => {
    const output = generator.generate({ spec });

    expect(output).toContain(
      String.raw`bytes.NewBufferString("{\"note\":\"a'b\\\\c<tag>\",\"count\":0}")`,
    );
  });

  it('emits response structs with sanitized Go field names', () => {
    const output = generator.generate({ spec });

    expect(output).toContain('type GetItemsIdResponse struct');
    expect(output).toContain('Id string `json:"id"`');
    expect(output).toContain('UserId string `json:"user-id"`');
    expect(output).toContain('Field2fa bool `json:"2fa"`');
  });

  it('emits a body for any operation that declares requestBody content', () => {
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

    expect(output.match(/bytes\.NewBufferString/g)).toHaveLength(2);
    expect(output).not.toContain('bytes.NewBufferString("{}")');
  });
});
