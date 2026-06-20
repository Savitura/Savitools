import { CodeGenerator, GeneratorContext } from './types';

export class CurlGenerator implements CodeGenerator {
  generate(context: GeneratorContext): string {
    const { spec, endpoint } = context;
    const baseUrl = spec.servers?.[0]?.url || 'https://api.example.com';
    let code = ``;

    const paths = endpoint ? { [endpoint]: spec.paths[endpoint] } : spec.paths;

    for (const [path, pathItem] of Object.entries(paths || {})) {
      if (!pathItem) continue;
      for (const [method, operation] of Object.entries(pathItem)) {
        if (method === 'post') {
          code += `curl -X POST ${baseUrl}${path} \\\n`;
          code += `  -H "Authorization: Bearer $API_KEY" \\\n`;
          code += `  -H "Content-Type: application/json" \\\n`;
          
          let jsonPayload = `{`;
          const props = operation.requestBody?.content?.['application/json']?.schema?.properties || {};
          const keys = Object.keys(props);
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const prop = props[key] as any;
            jsonPayload += `"${key}": "${prop.example || 'TODO'}"`;
            if (i < keys.length - 1) jsonPayload += `, `;
          }
          jsonPayload += `}`;
          
          code += `  -d '${jsonPayload}'\n\n`;
        }
      }
    }
    return code.trim();
  }
}
