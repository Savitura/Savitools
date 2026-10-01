import {
  CodeGenerator,
  GeneratorContext,
  JsonSchema,
  OpenApiOperation,
  OpenApiSpec,
  isObjectSchema,
  operationsFor,
  parameterExample,
  queryParameters,
  requestProperties,
  responseSchema,
  responseTypeName,
  schemaExample,
  schemaToGo,
} from './types';

function goString(value: unknown): string {
  return JSON.stringify(String(value)).replace(/[\u2028\u2029]/g, '');
}

function goFieldName(value: string): string {
  const identifier = value.replace(/[^a-zA-Z0-9_]/g, ' ').trim();
  const pascal = identifier
    .split(/\s+/)
    .map((part) =>
      part.length === 0 ? '' : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('');
  if (pascal.length === 0) return 'Field';
  return /^[0-9]/.test(pascal) ? `Field${pascal}` : pascal;
}

export class GoGenerator implements CodeGenerator {
  generate(context: GeneratorContext): string {
    const { spec } = context;
    const baseUrl = spec.servers?.[0]?.url || 'https://api.example.com';
    const operations = operationsFor(context);
    const hasQuery = operations.some(
      (entry) => queryParameters(entry.operation).length > 0,
    );
    const hasBody = operations.some((entry) =>
      hasRequestBody(entry.operation),
    );
    const hasResponse = operations.some((entry) =>
      Boolean(responseSchema(entry.operation, spec)),
    );

    const imports = ['fmt', 'net/http', 'os'];
    if (hasBody) imports.push('bytes');
    if (hasResponse) imports.push('encoding/json');
    if (hasQuery) imports.push('net/url');
    imports.sort();

    let code = `package main\n\nimport (\n${imports
      .map((name) => `\t"${name}"`)
      .join('\n')}\n)\n\n`;

    const emittedTypes = new Set<string>();
    for (const { path, method, operation } of operations) {
      const response = responseSchema(operation, spec);
      const typeName = responseTypeName(method, path);
      if (response && !emittedTypes.has(typeName)) {
        emittedTypes.add(typeName);
        code += isObjectSchema(response, spec)
          ? this.struct(typeName, response, spec)
          : `type ${typeName} ${schemaToGo(response, spec)}\n\n`;
      }
    }

    code += `func main() {\n\tapiKey := os.Getenv("API_KEY")\n\tclient := &http.Client{}\n`;

    for (const { path, method, operation } of operations) {
      const values = new Map(
        (operation.parameters ?? []).map((parameter) => [
          parameter.name,
          parameterExample(parameter),
        ]),
      );
      const resolvedPath = path.replace(
        /\{([^}]+)\}/g,
        (_, name: string) => String(values.get(name) ?? `{${name}}`),
      );
      const query = queryParameters(operation);
      const response = responseSchema(operation, spec);
      const typeName = responseTypeName(method, path);

      code += `\t{\n`;
      code += `\t\t// ${operation.summary || `${method.toUpperCase()} ${path}`}\n`;
      if (query.length > 0) {
        code += `\t\treqURL := ${goString(`${baseUrl}${resolvedPath}`)}\n`;
        code += `\t\tparams := url.Values{}\n`;
        for (const parameter of query) {
          code += `\t\tparams.Set(${goString(parameter.name)}, ${goString(values.get(parameter.name))})\n`;
        }
        code += `\t\treqURL += "?" + params.Encode()\n`;
        code += `\t\treq, err := http.NewRequest(${goString(method.toUpperCase())}, reqURL, ${this.goBody(operation, spec)})\n`;
      } else {
        code += `\t\treq, err := http.NewRequest(${goString(method.toUpperCase())}, ${goString(`${baseUrl}${resolvedPath}`)}, ${this.goBody(operation, spec)})\n`;
      }
      code += `\t\tif err != nil { panic(err) }\n`;
      code += `\t\treq.Header.Set("Authorization", "Bearer "+apiKey)\n`;
      code += `\t\treq.Header.Set("Content-Type", "application/json")\n`;
      code += `\t\tresp, err := client.Do(req)\n`;
      code += `\t\tif err != nil { panic(err) }\n`;
      if (response) {
        code += `\t\tvar data ${typeName}\n`;
        code += `\t\tjson.NewDecoder(resp.Body).Decode(&data)\n`;
        code += `\t\tresp.Body.Close()\n`;
        code += `\t\tfmt.Println(data)\n`;
      } else {
        code += `\t\tfmt.Println(resp.Status)\n`;
        code += `\t\tresp.Body.Close()\n`;
      }
      code += `\t}\n`;
    }

    code += `}\n`;
    return code.trim();
  }

  private goBody(operation: OpenApiOperation, spec: OpenApiSpec): string {
    if (!hasRequestBody(operation)) return 'nil';
    return `bytes.NewBufferString(${goString(JSON.stringify(this.bodyObject(operation, spec)))})`;
  }

  private bodyObject(
    operation: OpenApiOperation,
    spec: OpenApiSpec,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, schema] of Object.entries(
      requestProperties(operation, spec),
    )) {
      result[key] = schemaExample(schema);
    }
    return result;
  }

  private struct(
    name: string,
    schema: JsonSchema,
    spec: OpenApiSpec,
  ): string {
    const fields = Object.entries(schema.properties ?? {}).map(
      ([key, value]) =>
        `\t${goFieldName(key)} ${schemaToGo(value, spec)} \`json:"${key}"\``,
    );
    return `type ${name} struct {\n${fields.join('\n')}\n}\n\n`;
  }
}

/** The operation declares a request body. */
function hasRequestBody(operation: OpenApiOperation): boolean {
  return operation.requestBody?.content !== undefined;
}
