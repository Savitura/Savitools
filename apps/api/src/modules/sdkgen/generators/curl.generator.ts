import {
  CodeGenerator,
  GeneratorContext,
  METHODS_WITH_BODY,
  operationsFor,
  parameterExample,
  queryParameters,
  requestProperties,
  schemaExample,
} from './types';

export class CurlGenerator implements CodeGenerator {
  generate(context: GeneratorContext): string {
    const baseUrl = context.spec.servers?.[0]?.url || 'https://api.example.com';
    let code = ``;

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
      const query = queryParameters(operation);
      const queryString = query.length
        ? `?${query
            .map(
              (parameter) =>
                `${encodeURIComponent(parameter.name)}=${encodeURIComponent(
                  String(values.get(parameter.name) ?? ''),
                )}`,
            )
            .join('&')}`
        : '';

      code += `curl -X ${method.toUpperCase()} ${baseUrl}${resolvedPath}${queryString} \\\n`;
      code += `  -H "Authorization: Bearer $API_KEY"`;

      if (METHODS_WITH_BODY.has(method)) {
        code += ` \\\n  -H "Content-Type: application/json"`;
        const props = requestProperties(operation, context.spec);
        const entries = Object.entries(props);
        if (entries.length > 0) {
          const pairs = entries
            .map(
              ([key, schema]) =>
                `"${key}": ${JSON.stringify(schemaExample(schema))}`,
            )
            .join(', ');
          code += ` \\\n  -d '{ ${pairs} }'`;
        }
      }

      code += `\n\n`;
    }

    return code.trim();
  }
}
