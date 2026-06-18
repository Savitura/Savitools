import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { GenerateSdkDto } from './dto/generate-sdk.dto';
import {
  CodeGenerator,
  CurlGenerator,
  GoGenerator,
  PythonGenerator,
  TypeScriptGenerator,
  OpenApiSpec,
} from './generators';

@Injectable()
export class SdkgenService {
  private specsCache: Record<string, OpenApiSpec> = {};
  private generators: Record<string, CodeGenerator> = {
    javascript: new TypeScriptGenerator(),
    typescript: new TypeScriptGenerator(),
    python: new PythonGenerator(),
    go: new GoGenerator(),
    curl: new CurlGenerator(),
  };

  constructor() {
    this.loadSpec('fluxa');
    this.loadSpec('crowdpay');
  }

  private loadSpec(specName: string) {
    try {
      const specPath = path.join(__dirname, 'specs', `${specName}.json`);
      const fileContent = fs.readFileSync(specPath, 'utf8');
      this.specsCache[specName] = JSON.parse(fileContent);
    } catch (error) {
      console.error(`Failed to load spec ${specName}: `, error);
    }
  }

  generate(dto: GenerateSdkDto): string {
    const spec = this.specsCache[dto.spec];
    if (!spec) {
      throw new NotFoundException(`Spec ${dto.spec} not found`);
    }

    const generator = this.generators[dto.language.toLowerCase()];
    if (!generator) {
      throw new NotFoundException(`Language ${dto.language} is not supported`);
    }

    return generator.generate({ spec, endpoint: dto.endpoint });
  }
}
