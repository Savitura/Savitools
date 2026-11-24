import { PythonGenerator } from './python.generator';
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

describe('PythonGenerator', () => {
  const generator = new PythonGenerator();

  it('emits the authentication header and escapes the URL as a Python literal', () => {
    const output = generator.generate({ spec });

    expect(output).toContain('import requests');
    expect(output).toContain('API_KEY = os.environ.get("API_KEY", "")');
    expect(output).toContain('headers = {"Authorization": f"Bearer {API_KEY}"}');
    expect(output).toContain(
      String.raw`requests.get("https://api.example.com/items/a\\"b/c", headers=headers, params={"q": "a b&c/d"})`,
    );
  });

  it('serializes JSON body values with Python escaping for quotes and backslashes', () => {
    const output = generator.generate({ spec });

    expect(output).toContain(String.raw`json={"note": "a\'b\\\\c<tag>", "count": 0}`);
  });

  it('emits typed dicts with sanitized Python field names', () => {
    const output = generator.generate({ spec });

    expect(output).toContain('class GetItemsIdResponse(TypedDict, total=False):');
    expect(output).toContain('id: str');
    expect(output).toContain('user_id: str');
    expect(output).toContain('field_2fa: bool');
  });

  it('emits JSON bodies only for POST, PUT and PATCH', () => {
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

    expect(output.match(/json=/g)).toHaveLength(3);
    expect(output).toContain('json={}');
  });
});
