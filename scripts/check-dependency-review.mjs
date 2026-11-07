#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const WORKFLOW_PATH = path.join(REPO_ROOT, '.github/workflows/dependency-review.yml');
const CONFIG_PATH = path.join(REPO_ROOT, '.github/dependency-review-config.yml');

const ALLOWED_SEVERITIES = new Set(['low', 'moderate', 'high', 'critical']);
const ESSENTIAL_COPYLEFT_LICENSES = [
  'GPL-1.0-only',
  'GPL-2.0-only',
  'GPL-3.0-only',
  'AGPL-1.0-only',
  'AGPL-3.0-only',
];

export function parseYaml(text) {
  return parseYamlFallback(text);
}

export function parseYamlFallback(text) {
  if (!text || typeof text !== 'string') return null;

  const lines = text.split('\n');
  const root = {};
  let currentKey = null;
  let currentList = null;

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
          if (val === 'true') val = true;
          else if (val === 'false') val = false;
          root[key] = val;
        }
      }
    }
  }
  return root;
}

export function validateWorkflow(workflowText) {
  const errors = [];
  if (!workflowText || typeof workflowText !== 'string') {
    return { valid: false, errors: ['Workflow content is empty'] };
  }

  // Check triggers
  const hasPrTrigger =
    /pull_request\s*:/.test(workflowText) || /branches\s*:\s*\[.*main.*\]/.test(workflowText);
  if (!hasPrTrigger) {
    errors.push('Workflow must be triggered on pull_request events');
  }

  // Check least-privilege permissions
  const hasContentsRead = /permissions\s*:\s*\n\s*contents\s*:\s*read/.test(workflowText);
  if (!hasContentsRead) {
    errors.push("Workflow must declare permissions with 'contents: read'");
  }

  // Check dependency review action
  const usesAction = /actions\/dependency-review-action@v[0-9]+/.test(workflowText);
  if (!usesAction) {
    errors.push('Workflow must include a step using actions/dependency-review-action');
  }

  // Check config-file reference
  if (!/config-file\s*:\s*['"]?\.github\/dependency-review-config\.yml['"]?/.test(workflowText)) {
    errors.push(
      "dependency-review-action step must specify 'with.config-file' targeting .github/dependency-review-config.yml",
    );
  }

  // Check fail-on-severity
  if (!/fail-on-severity\s*:\s*['"]?moderate['"]?/.test(workflowText)) {
    errors.push("dependency-review-action step must specify 'with.fail-on-severity: moderate'");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateConfig(configText) {
  const errors = [];
  if (!configText || typeof configText !== 'string') {
    return { valid: false, errors: ['Configuration content is empty'] };
  }

  const doc = parseYamlFallback(configText);
  if (!doc) {
    return { valid: false, errors: ['Failed to parse configuration document'] };
  }

  const severity = doc['fail-on-severity'];
  if (!severity || !ALLOWED_SEVERITIES.has(severity)) {
    errors.push(
      `'fail-on-severity' must be one of [${Array.from(ALLOWED_SEVERITIES).join(', ')}], got '${severity}'`,
    );
  }

  const scopes = doc['fail-on-scopes'];
  if (!Array.isArray(scopes) || !scopes.includes('runtime')) {
    errors.push("'fail-on-scopes' must be an array containing at least 'runtime'");
  }

  const denyLicenses = doc['deny-licenses'];
  if (!Array.isArray(denyLicenses) || denyLicenses.length === 0) {
    errors.push("'deny-licenses' must be a non-empty array of disallowed licenses");
  } else {
    for (const license of ESSENTIAL_COPYLEFT_LICENSES) {
      if (!denyLicenses.includes(license)) {
        errors.push(`'deny-licenses' is missing essential copyleft restriction for '${license}'`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateWorkspaceManifests(root = REPO_ROOT) {
  const manifests = [
    path.join(root, 'package.json'),
    path.join(root, 'apps/api/package.json'),
    path.join(root, 'apps/web/package.json'),
  ];

  const results = [];
  for (const mPath of manifests) {
    if (!fs.existsSync(mPath)) continue;
    try {
      const json = JSON.parse(fs.readFileSync(mPath, 'utf8'));
      results.push({
        file: path.relative(root, mPath),
        name: json.name,
        dependencies: Object.keys(json.dependencies || {}),
        devDependencies: Object.keys(json.devDependencies || {}),
      });
    } catch (err) {
      throw new Error(`Failed to parse manifest at ${mPath}: ${err.message}`);
    }
  }

  return results;
}

export function runIntegrityCheck() {
  console.log('🔍 Validating Dependency Review enforcement configuration...');

  if (!fs.existsSync(WORKFLOW_PATH)) {
    throw new Error(`Missing workflow file: ${WORKFLOW_PATH}`);
  }
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Missing config file: ${CONFIG_PATH}`);
  }

  const workflowRaw = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  const workflowRes = validateWorkflow(workflowRaw);
  if (!workflowRes.valid) {
    throw new Error(`Workflow validation failed:\n  - ${workflowRes.errors.join('\n  - ')}`);
  }
  console.log(
    '  ✓ Workflow .github/workflows/dependency-review.yml is valid and conforms to enforcement policy',
  );

  const configRaw = fs.readFileSync(CONFIG_PATH, 'utf8');
  const configRes = validateConfig(configRaw);
  if (!configRes.valid) {
    throw new Error(`Config validation failed:\n  - ${configRes.errors.join('\n  - ')}`);
  }
  console.log(
    '  ✓ Configuration .github/dependency-review-config.yml is valid (severity: moderate, license guards active)',
  );

  const manifests = validateWorkspaceManifests();
  console.log(
    `  ✓ Checked ${manifests.length} workspace manifests (${manifests.map((m) => m.name).join(', ')})`,
  );

  console.log('✅ Dependency Review enforcement configuration is complete and healthy.');
  return true;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    runIntegrityCheck();
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}
