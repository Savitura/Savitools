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
  schemaToPython,
} from './types';

function pyLiteral(value: unknown): string {
  return JSON.stringify(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function pyIdentifier(value: string): string {
  const identifier = value.replace(/[^a-zA-Z0-9_]/g, '_');
  return /^[a-zA-Z_]/.test(identifier) ? identifier : `field_${identifier}`;
}

export class PythonGenerator implements CodeGenerator {
  generate(context: GeneratorContext): string {
    const { spec } = context;
    const baseUrl = spec.servers?.[0]?.url || 'https://api.example.com';
    let code = `import os\nimport requests\nfrom typing import Any, Dict, List, Optional, TypedDict\n\nAPI_KEY = os.environ.get("API_KEY", "")\nheaders = {"Authorization": f"Bearer {API_KEY}"}\n\n`;
    const emittedTypes = new Set<string>();

    for (const { path, method, operation } of operationsFor(context)) {
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
      const url = `${baseUrl}${resolvedPath}`;

      const query = queryParameters(operation);
      const queryText = query.length
        ? `, params={${query
            .map(
              (parameter) =>
                `${pyLiteral(parameter.name)}: ${pyLiteral(values.get(parameter.name))}`,
            )
            .join(', ')}}`
        : '';
      const bodyText = METHODS_WITH_BODY.has(method)
        ? `, json=${this.body(operation, spec)}`
        : '';

      const response = responseSchema(operation, spec);
      const typeName = responseTypeName(method, path);
      if (response && !emittedTypes.has(typeName)) {
        emittedTypes.add(typeName);
        code += isObjectSchema(response, spec)
          ? this.typedDict(typeName, response, spec)
          : `${typeName} = ${schemaToPython(response, spec)}\n\n`;
      }

      code += `# ${operation.summary || `${method.toUpperCase()} ${path}`}\n`;
      code += `response = requests.${method}(${pyLiteral(url)}, headers=headers${queryText}${bodyText})\n`;
      code += response
        ? `data: ${typeName} = response.json()\nprint(data)\n\n`
        : `print(response.json())\n\n`;
    }

    return code.trim();
  }

  private typedDict(
    name: string,
    schema: JsonSchema,
    spec: OpenApiSpec,
  ): string {
    const lines = Object.entries(schema.properties ?? {}).map(
      ([key, value]) =>
        `    ${pyIdentifier(key)}: ${schemaToPython(value, spec)}`,
    );
    return `class ${name}(TypedDict, total=False):\n${lines.join('\n')}\n\n`;
  }

  private body(operation: OpenApiOperation, spec: OpenApiSpec): string {
    return `{${Object.entries(requestProperties(operation, spec))
      .map(
        ([key, schema]) =>
          `${pyLiteral(key)}: ${pyLiteral(schemaExample(schema))}`,
      )
      .join(', ')}}`;
  }
}
