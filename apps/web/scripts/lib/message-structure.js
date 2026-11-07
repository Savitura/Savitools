'use strict';

/**
 * ICU message structure validation.
 *
 * Key parity alone is not enough: two locales can define the same keys while
 * using different interpolation parameters or plural/select branches. Those
 * messages render at runtime with missing values or a fallback branch, so this
 * module compares the structure of ICU messages as well as their keys.
 */

const COMPLEX_ARGUMENT_TYPES = new Set(['plural', 'select', 'selectordinal']);
const QUOTE_TRIGGER_CHARS = new Set(['{', '}', '#', '|']);

/**
 * ICU only treats an apostrophe as the start of quoted literal text when it is
 * followed by a syntax character. A plain apostrophe (for example in "l'item")
 * must stay literal and must not hide an interpolation later in the message.
 */
function findQuotedEnd(input, start) {
  if (!QUOTE_TRIGGER_CHARS.has(input[start + 1])) {
    return -1;
  }

  return input.indexOf("'", start + 1);
}

function findClosingBrace(input, start) {
  let depth = 0;

  for (let i = start; i < input.length; i += 1) {
    const char = input[i];

    if (char === "'") {
      if (input[i + 1] === "'") {
        i += 1;
        continue;
      }

      const quoteEnd = findQuotedEnd(input, i);
      if (quoteEnd !== -1) {
        i = quoteEnd;
      }
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function splitTopLevel(input, delimiter) {
  const parts = [];
  let current = '';
  let depth = 0;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (char === "'") {
      if (input[i + 1] === "'") {
        current += "''";
        i += 1;
        continue;
      }

      const quoteEnd = findQuotedEnd(input, i);
      if (quoteEnd !== -1) {
        current += input.slice(i, quoteEnd + 1);
        i = quoteEnd;
        continue;
      }
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
    }

    if (char === delimiter && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  parts.push(current);
  return parts;
}

function parseBranches(style, errors) {
  const branches = new Map();
  let offset = 0;
  let cursor = 0;

  while (cursor < style.length) {
    while (cursor < style.length && /[\s,]/.test(style[cursor])) {
      cursor += 1;
    }

    if (cursor >= style.length) {
      break;
    }

    if (style.startsWith('offset', cursor)) {
      const offsetMatch = /^offset\s*:\s*(\d+)/.exec(style.slice(cursor));
      if (offsetMatch) {
        offset = Number(offsetMatch[1]);
        cursor += offsetMatch[0].length;
        continue;
      }
    }

    const braceStart = style.indexOf('{', cursor);
    if (braceStart === -1) {
      errors.push('missing "{" for a plural/select branch');
      break;
    }

    const label = style.slice(cursor, braceStart).trim().replace(/,$/, '').trim();
    const braceEnd = findClosingBrace(style, braceStart);

    if (braceEnd === -1) {
      errors.push(`unclosed branch "${label || '?'}"`);
      break;
    }

    if (!label) {
      errors.push('missing plural/select branch label');
      cursor = braceStart + 1;
      continue;
    }

    const branch = parseMessage(style.slice(braceStart + 1, braceEnd));
    errors.push(...branch.errors);
    branches.set(label, branch.nodes);
    cursor = braceEnd + 1;
  }

  if (branches.size === 0) {
    errors.push('expected at least one plural/select branch');
  }

  return { offset, branches };
}

function parseArgument(inner, errors) {
  const parts = splitTopLevel(inner, ',');
  const name = parts[0].trim();

  if (!name) {
    errors.push('interpolation argument has no name');
    return null;
  }

  const argumentType = parts[1] ? parts[1].trim() || 'simple' : 'simple';

  if (!COMPLEX_ARGUMENT_TYPES.has(argumentType)) {
    return { type: 'argument', name, argumentType };
  }

  const style = parts.slice(2).join(',').trim();
  const { offset, branches } = parseBranches(style, errors);

  return { type: 'argument', name, argumentType, offset, branches };
}

function parseMessage(message) {
  const errors = [];
  const nodes = [];
  let text = '';
  let cursor = 0;

  const flushText = () => {
    if (text) {
      nodes.push({ type: 'text', value: text });
      text = '';
    }
  };

  while (cursor < message.length) {
    const char = message[cursor];

    if (char === "'") {
      if (message[cursor + 1] === "'") {
        text += "'";
        cursor += 2;
        continue;
      }

      const quoteEnd = findQuotedEnd(message, cursor);
      if (quoteEnd !== -1) {
        text += message.slice(cursor + 1, quoteEnd);
        cursor = quoteEnd + 1;
        continue;
      }

      text += char;
      cursor += 1;
      continue;
    }

    if (char === '{') {
      const braceEnd = findClosingBrace(message, cursor);
      if (braceEnd === -1) {
        flushText();
        errors.push('unclosed "{" in message');
        break;
      }

      flushText();
      const argument = parseArgument(message.slice(cursor + 1, braceEnd), errors);
      if (argument) {
        nodes.push(argument);
      }
      cursor = braceEnd + 1;
      continue;
    }

    if (char === '}') {
      errors.push('unmatched "}" in message');
    }

    text += char;
    cursor += 1;
  }

  flushText();
  return { nodes, errors };
}

function collectArguments(nodes) {
  const argumentsByName = new Map();

  for (const node of nodes) {
    if (node.type !== 'argument') {
      continue;
    }

    let argument = argumentsByName.get(node.name);
    if (!argument) {
      argument = {
        name: node.name,
        argumentType: node.argumentType,
        offset: node.offset ?? null,
        branches: null,
      };
      argumentsByName.set(node.name, argument);
    }

    if (node.branches) {
      if (!argument.branches) {
        argument.branches = new Map();
      }

      for (const [label, branchNodes] of node.branches) {
        argument.branches.set(label, collectArguments(branchNodes));
      }
    }
  }

  return argumentsByName;
}

function formatArgumentType(argumentType) {
  return argumentType === 'simple' ? 'interpolation' : argumentType;
}

function compareArgumentMaps(sourceArguments, targetArguments, key, context) {
  const issues = [];
  const contextSuffix = context ? ` (inside ${context})` : '';

  for (const [name, sourceArgument] of sourceArguments) {
    const targetArgument = targetArguments.get(name);

    if (!targetArgument) {
      issues.push({
        kind: 'structure',
        key,
        reason: `missing interpolation variable "{${name}}"${contextSuffix}`,
      });
      continue;
    }

    if (sourceArgument.argumentType !== targetArgument.argumentType) {
      issues.push({
        kind: 'structure',
        key,
        reason:
          `"{${name}}" is ${formatArgumentType(sourceArgument.argumentType)} in ` +
          `the source locale but ${formatArgumentType(targetArgument.argumentType)} in this locale`,
      });
      continue;
    }

    if (!COMPLEX_ARGUMENT_TYPES.has(sourceArgument.argumentType)) {
      continue;
    }

    if (sourceArgument.offset !== targetArgument.offset) {
      issues.push({
        kind: 'structure',
        key,
        reason:
          `${sourceArgument.argumentType} offset for "{${name}}" is ` +
          `${sourceArgument.offset} in the source locale but ` +
          `${targetArgument.offset} in this locale`,
      });
    }

    for (const [label, branchArguments] of sourceArgument.branches) {
      const targetBranch = targetArgument.branches.get(label);

      if (!targetBranch) {
        issues.push({
          kind: 'structure',
          key,
          reason: `missing ${sourceArgument.argumentType} branch "${label}" ` + `for "{${name}}"`,
        });
        continue;
      }

      issues.push(
        ...compareArgumentMaps(
          branchArguments,
          targetBranch,
          key,
          context ? `${context}.${label}` : `${name}.${label}`,
        ),
      );
    }

    for (const label of targetArgument.branches.keys()) {
      if (!sourceArgument.branches.has(label)) {
        issues.push({
          kind: 'structure',
          key,
          reason: `extra ${sourceArgument.argumentType} branch "${label}" ` + `for "{${name}}"`,
        });
      }
    }
  }

  for (const name of targetArguments.keys()) {
    if (!sourceArguments.has(name)) {
      issues.push({
        kind: 'structure',
        key,
        reason: `extra interpolation variable "{${name}}"${contextSuffix}`,
      });
    }
  }

  return issues;
}

function compareMessageStructure(sourceMessage, targetMessage, key = '') {
  const source = parseMessage(sourceMessage);
  const target = parseMessage(targetMessage);
  const issues = [];

  for (const error of source.errors) {
    issues.push({
      kind: 'structure',
      key,
      reason: `source locale has malformed ICU message: ${error}`,
    });
  }

  for (const error of target.errors) {
    issues.push({
      kind: 'structure',
      key,
      reason: `malformed ICU message: ${error}`,
    });
  }

  if (source.errors.length > 0 || target.errors.length > 0) {
    return issues;
  }

  return compareArgumentMaps(
    collectArguments(source.nodes),
    collectArguments(target.nodes),
    key,
    '',
  );
}

function flattenMessages(value, prefix = '', into = new Map()) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [childKey, child] of Object.entries(value)) {
      flattenMessages(child, prefix ? `${prefix}.${childKey}` : childKey, into);
    }
  } else {
    into.set(prefix, value);
  }

  return into;
}

function validateCatalog(sourceCatalog, targetCatalog) {
  const sourceMessages = flattenMessages(sourceCatalog);
  const targetMessages = flattenMessages(targetCatalog);
  const issues = [];

  for (const key of sourceMessages.keys()) {
    if (!targetMessages.has(key)) {
      issues.push({ kind: 'key', key, reason: 'missing key' });
    }
  }

  for (const key of targetMessages.keys()) {
    if (!sourceMessages.has(key)) {
      issues.push({ kind: 'key', key, reason: 'extra key' });
    }
  }

  for (const [key, sourceMessage] of sourceMessages) {
    if (!targetMessages.has(key)) {
      continue;
    }

    const targetMessage = targetMessages.get(key);

    if (typeof sourceMessage !== 'string' || typeof targetMessage !== 'string') {
      if (typeof sourceMessage !== typeof targetMessage) {
        issues.push({
          kind: 'structure',
          key,
          reason:
            `expected ${typeof sourceMessage} in the source locale but found ` +
            `${typeof targetMessage} in this locale`,
        });
      }
      continue;
    }

    issues.push(...compareMessageStructure(sourceMessage, targetMessage, key));
  }

  return issues;
}

module.exports = {
  compareMessageStructure,
  flattenMessages,
  parseMessage,
  validateCatalog,
};
