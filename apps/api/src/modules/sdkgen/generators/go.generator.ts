import { CodeGenerator, GeneratorContext } from './types';

export class GoGenerator implements CodeGenerator {
  generate(context: GeneratorContext): string {
    const { spec, endpoint } = context;
    const baseUrl = spec.servers?.[0]?.url || 'https://api.example.com';
    let code = `package main\n\nimport (\n\t"bytes"\n\t"fmt"\n\t"net/http"\n)\n\nfunc main() {\n`;

    const paths = endpoint ? { [endpoint]: spec.paths[endpoint] } : spec.paths;

    for (const [path, pathItem] of Object.entries(paths || {})) {
      if (!pathItem) continue;
      for (const [method, operation] of Object.entries(pathItem)) {
        if (method === 'post') {
          code += `\t// ${operation.summary || 'Operation'}\n`;
          code += `\turl := "${baseUrl}${path}"\n`;
          
          let jsonPayload = `{`;
          const props = operation.requestBody?.content?.['application/json']?.schema?.properties || {};
          const keys = Object.keys(props);
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const prop = props[key] as any;
            jsonPayload += `\\"${key}\\": \\"${prop.example || 'TODO'}\\"`;
            if (i < keys.length - 1) jsonPayload += `, `;
          }
          jsonPayload += `}`;
          
          code += `\tvar jsonStr = []byte(\`${jsonPayload}\`)\n`;
          code += `\treq, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonStr))\n`;
          code += `\treq.Header.Set("Authorization", "Bearer "+API_KEY)\n`;
          code += `\treq.Header.Set("Content-Type", "application/json")\n`;
          code += `\n\tclient := &http.Client{}\n`;
          code += `\tresp, err := client.Do(req)\n`;
          code += `\tif err != nil {\n\t\tpanic(err)\n\t}\n`;
          code += `\tdefer resp.Body.Close()\n`;
          code += `\tfmt.Println("response Status:", resp.Status)\n`;
        }
      }
    }
    code += `}\n`;
    return code.trim();
  }
}
