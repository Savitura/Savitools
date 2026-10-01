import {
  CodeGenerator,
  GeneratorContext,
  JsonSchema,
  METHODS_WITH_BODY,
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
  schemaToTypeScript,
} from './types';

function tsLiteral(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export class TypeScriptGenerator implements CodeGenerator {
  generate(context: GeneratorContext): string {
    const { spec } = context;
    const baseUrl = spec.servers?.[0]?.url || 'https://api.example.com';
    let code = `import axios from 'axios';\n\nconst API_KEY = process.env.API_KEY ?? '';\n\n`;
    const emittedTypes = new Set<string>();

    for (const { path, method, operation } of operationsFor(context)) {
      const params = operation.parameters ?? [];
      const values = new Map(
        params.map((parameter) => [parameter.name, parameterExample(parameter)]),
      );
      const resolvedPath = path.replace(
        /\{([^}]+)\}/g,
        (_, name: string) => String(values.get(name) ?? `{${name}}`),
      );
      const url = `${baseUrl}${resolvedPath}`;

      const query = queryParameters(operation);
      const queryOptions = query.length
        ? `, params: { ${query
            .map(
              (parameter) =>
                `${JSON.stringify(parameter.name)}: ${tsLiteral(values.get(parameter.name))}`,
            )
            .join(', ')} }`
        : '';
      const options = `{ headers: { Authorization: \`Bearer \${API_KEY}\` }${queryOptions} }`;

      const response = responseSchema(operation, spec);
      const typeName = responseTypeName(method, path);
      if (response && !emittedTypes.has(typeName)) {
        emittedTypes.add(typeName);
        code += isObjectSchema(response, spec)
          ? this.interface(typeName, response, spec)
          : `type ${typeName} = ${schemaToTypeScript(response, spec)};\n\n`;
      }

      const annotation = response ? `: ${typeName}` : '';
      code += `// ${operation.summary || `${method.toUpperCase()} ${path}`}\n`;
      code += METHODS_WITH_BODY.has(method)
        ? `const response${annotation} = await axios.${method}(${tsLiteral(url)}, ${this.body(operation, spec)}, ${options});\n`
        : `const response${annotation} = await axios.${method}(${tsLiteral(url)}, ${options});\n`;
      code += `console.log(response.data);\n\n`;
    }

    return code.trim();
  }

  private interface(
    name: string,
    schema: JsonSchema,
    spec: OpenApiSpec,
  ): string {
    const required = new Set(schema.required ?? []);
    const lines = Object.entries(schema.properties ?? {}).map(
      ([key, value]) =>
        `  ${JSON.stringify(key)}${required.has(key) ? '' : '?'}: ${schemaToTypeScript(value, spec)};`,
    );
    return `interface ${name} {\n${lines.join('\n')}\n}\n\n`;
  }

  private body(operation: OpenApiOperation, spec: OpenApiSpec): string {
    const props = requestProperties(operation, spec);
    return `{ ${Object.entries(props)
      .map(
        ([key, schema]) =>
          `${JSON.stringify(key)}: ${tsLiteral(schemaExample(schema))}`,
      )
      .join(', ')} }`;
  }
}
