import { CodeGenerator, GeneratorContext } from './types';

export class TypeScriptGenerator implements CodeGenerator {
  generate(context: GeneratorContext): string {
    const { spec, endpoint } = context;
    const baseUrl = spec.servers?.[0]?.url || 'https://api.example.com';
    let code = `import axios from 'axios';\n\n`;

    const paths = endpoint ? { [endpoint]: spec.paths[endpoint] } : spec.paths;

    for (const [path, pathItem] of Object.entries(paths || {})) {
      if (!pathItem) continue;
      for (const [method, operation] of Object.entries(pathItem)) {
        if (method === 'post') {
          code += `// ${operation.summary || 'Operation'}\n`;
          code += `const res = await axios.post('${baseUrl}${path}', {\n`;
          const props = operation.requestBody?.content?.['application/json']?.schema?.properties || {};
          for (const [key, prop] of Object.entries(props)) {
            const example = (prop as any).example || 'TODO';
            code += `  ${key}: '${example}',\n`;
          }
          code += `}, { headers: { Authorization: \`Bearer \${API_KEY}\` } });\n\n`;
        }
      }
    }
    return code.trim();
  }
}
