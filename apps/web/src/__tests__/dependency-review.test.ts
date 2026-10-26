import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const WORKFLOW_PATH = path.join(REPO_ROOT, '.github/workflows/dependency-review.yml');
const CONFIG_PATH = path.join(REPO_ROOT, '.github/dependency-review-config.yml');
const DOCS_PATH = path.join(REPO_ROOT, 'docs/dependency-review.md');

function parseSimpleYaml(text: string): Record<string, any> {
  const lines = text.split('\n');
  const root: Record<string, any> = {};
  let currentList: string[] | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('- ')) {
      const item = trimmed
        .slice(2)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      if (currentList) {
        currentList.push(item);
      }
      continue;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx !== -1) {
      const key = trimmed
        .slice(0, colonIdx)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      let val = trimmed.slice(colonIdx + 1).trim();

      if (val === '' || val === '[]') {
        if (val === '[]') {
          root[key] = [];
        } else {
          root[key] = [];
          currentList = root[key];
        }
      } else {
        currentList = null;
        if (val.startsWith('[') && val.endsWith(']')) {
          root[key] = val
            .slice(1, -1)
            .split(',')
            .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean);
        } else {
          val = val.replace(/^['"]|['"]$/g, '');
          if (val === 'true') (val as any) = true;
          else if (val === 'false') (val as any) = false;
          root[key] = val;
        }
      }
    }
  }
  return root;
}

function validateWorkflowText(text: string) {
  const errors: string[] = [];
  if (!text || typeof text !== 'string') {
    return { valid: false, errors: ['Workflow content is empty'] };
  }

  const hasPrTrigger = /pull_request\s*:/.test(text) && /branches\s*:\s*\[.*main.*\]/.test(text);
  if (!hasPrTrigger) {
    errors.push('Missing pull_request trigger on main branch');
  }

  const hasContentsRead = /permissions\s*:\s*\n\s*contents\s*:\s*read/.test(text);
  if (!hasContentsRead) {
    errors.push('Missing least-privilege permissions (contents: read)');
  }

  const usesAction = /actions\/dependency-review-action@v[0-9]+/.test(text);
  if (!usesAction) {
    errors.push('Missing step using actions/dependency-review-action');
  }

  const hasConfigFile = /config-file\s*:\s*['"]?\.github\/dependency-review-config\.yml['"]?/.test(
    text,
  );
  if (!hasConfigFile) {
    errors.push('Missing config-file pointing to .github/dependency-review-config.yml');
  }

  const hasSeverity = /fail-on-severity\s*:\s*['"]?moderate['"]?/.test(text);
  if (!hasSeverity) {
    errors.push('Missing fail-on-severity: moderate');
  }

  return { valid: errors.length === 0, errors };
}

function validatePolicyDoc(doc: Record<string, any>) {
  const errors: string[] = [];
  const allowed = ['low', 'moderate', 'high', 'critical'];

  if (!doc || typeof doc !== 'object') {
    return { valid: false, errors: ['Invalid configuration document'] };
  }

  if (!doc['fail-on-severity'] || !allowed.includes(doc['fail-on-severity'])) {
    errors.push(`Invalid fail-on-severity: ${doc['fail-on-severity']}`);
  }

  if (!Array.isArray(doc['fail-on-scopes']) || !doc['fail-on-scopes'].includes('runtime')) {
    errors.push("Missing 'runtime' in fail-on-scopes");
  }

  if (!Array.isArray(doc['deny-licenses']) || doc['deny-licenses'].length === 0) {
    errors.push('Invalid or empty deny-licenses');
  } else {
    for (const lic of ['AGPL-3.0-only', 'GPL-3.0-only', 'LGPL-3.0-only']) {
      if (!doc['deny-licenses'].includes(lic)) {
        errors.push(`Missing license restriction for ${lic}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

describe('Dependency Review Enforcement (Savitura/Savitools#522)', () => {
  describe('Primary Path: Live Configuration and Workflow Files', () => {
    it('has a valid .github/workflows/dependency-review.yml file', () => {
      expect(fs.existsSync(WORKFLOW_PATH)).toBe(true);

      const content = fs.readFileSync(WORKFLOW_PATH, 'utf8');
      const validation = validateWorkflowText(content);

      expect(validation.errors).toEqual([]);
      expect(validation.valid).toBe(true);
    });

    it('has a valid .github/dependency-review-config.yml configuration', () => {
      expect(fs.existsSync(CONFIG_PATH)).toBe(true);

      const content = fs.readFileSync(CONFIG_PATH, 'utf8');
      const config = parseSimpleYaml(content);

      expect(config).toBeDefined();
      expect(config['fail-on-severity']).toBe('moderate');
      expect(config['fail-on-scopes']).toEqual(expect.arrayContaining(['runtime', 'development']));

      // License restrictions
      expect(config['deny-licenses']).toBeDefined();
      expect(Array.isArray(config['deny-licenses'])).toBe(true);
      expect(config['deny-licenses']).toEqual(
        expect.arrayContaining([
          'AGPL-1.0-only',
          'AGPL-3.0-only',
          'GPL-2.0-only',
          'GPL-3.0-only',
          'LGPL-2.1-only',
          'LGPL-3.0-only',
        ]),
      );

      const policyValidation = validatePolicyDoc(config);
      expect(policyValidation.errors).toEqual([]);
      expect(policyValidation.valid).toBe(true);
    });

    it('has comprehensive documentation in docs/dependency-review.md', () => {
      expect(fs.existsSync(DOCS_PATH)).toBe(true);
      const docs = fs.readFileSync(DOCS_PATH, 'utf8');

      expect(docs).toContain('# Dependency Review Enforcement');
      expect(docs).toContain('fail-on-severity: moderate');
      expect(docs).toContain('License Compliance');
      expect(docs).toContain('Triage & Remediation');
    });

    it('declares review:deps script in package.json', () => {
      const rootPkgPath = path.join(REPO_ROOT, 'package.json');
      const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));

      expect(rootPkg.scripts['review:deps']).toBe('node scripts/check-dependency-review.mjs');
    });
  });

  describe('Failure and Edge Cases', () => {
    it('rejects workflows missing pull_request triggers', () => {
      const invalidWorkflow = `
name: 'Invalid'
on:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  test:
    steps:
      - uses: actions/dependency-review-action@v4
        with:
          config-file: '.github/dependency-review-config.yml'
          fail-on-severity: moderate
`;
      const result = validateWorkflowText(invalidWorkflow);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing pull_request trigger on main branch');
    });

    it('rejects workflows without least-privilege permissions', () => {
      const invalidWorkflow = `
name: 'Invalid'
on:
  pull_request:
    branches: [main]
permissions:
  contents: write
jobs:
  test:
    steps:
      - uses: actions/dependency-review-action@v4
        with:
          config-file: '.github/dependency-review-config.yml'
          fail-on-severity: moderate
`;
      const result = validateWorkflowText(invalidWorkflow);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing least-privilege permissions (contents: read)');
    });

    it('rejects configurations with missing or invalid severity threshold', () => {
      const invalidConfig = {
        'fail-on-severity': 'ultra-critical',
        'fail-on-scopes': ['runtime'],
        'deny-licenses': ['GPL-3.0-only', 'AGPL-3.0-only', 'LGPL-3.0-only'],
      };

      const result = validatePolicyDoc(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid fail-on-severity: ultra-critical');
    });

    it('rejects configurations without license deny lists', () => {
      const invalidConfig = {
        'fail-on-severity': 'moderate',
        'fail-on-scopes': ['runtime'],
        'deny-licenses': [],
      };

      const result = validatePolicyDoc(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid or empty deny-licenses');
    });

    it('rejects configurations missing essential copyleft restrictions', () => {
      const incompleteConfig = {
        'fail-on-severity': 'moderate',
        'fail-on-scopes': ['runtime'],
        'deny-licenses': ['MIT'],
      };

      const result = validatePolicyDoc(incompleteConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing license restriction for GPL-3.0-only');
    });

    it('handles empty strings and null gracefully without throwing', () => {
      expect(validateWorkflowText('').valid).toBe(false);
      expect(validateWorkflowText(null as any).valid).toBe(false);
      expect(validatePolicyDoc(null as any).valid).toBe(false);
      expect(validatePolicyDoc({} as any).valid).toBe(false);
    });
  });
});
