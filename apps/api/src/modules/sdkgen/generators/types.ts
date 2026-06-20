export interface OpenApiSpec {
  servers: { url: string }[];
  paths: Record<string, Record<string, any>>;
}

export interface GeneratorContext {
  spec: OpenApiSpec;
  endpoint?: string;
}

export interface CodeGenerator {
  generate(context: GeneratorContext): string;
}
