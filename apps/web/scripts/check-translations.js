#!/usr/bin/env node

/**
 * Translation validation script.
 *
 * Every locale must define the same keys as the source locale (en). Because
 * equal key sets can still render broken messages, the ICU structure is also
 * compared: interpolation parameters, argument types, offsets, and
 * plural/select branches must match.
 */

const fs = require('fs');
const path = require('path');
const { flattenMessages, validateCatalog } = require('./lib/message-structure');

const MESSAGES_DIR = process.env.TRANSLATIONS_DIR || path.join(__dirname, '../messages');
const SOURCE_LOCALE = 'en';

function loadMessages(locale) {
  const filePath = path.join(MESSAGES_DIR, `${locale}.json`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Messages file not found for locale: ${locale}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function checkTranslations() {
  const sourceMessages = loadMessages(SOURCE_LOCALE);
  const sourceKeys = [...flattenMessages(sourceMessages).keys()].sort();

  console.log(`🔍 Checking translations against source locale: ${SOURCE_LOCALE}`);
  console.log(`📊 Source locale has ${sourceKeys.length} keys`);

  const localeFiles = fs
    .readdirSync(MESSAGES_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.basename(file, '.json'))
    .filter((locale) => locale !== SOURCE_LOCALE);

  let hasErrors = false;

  for (const locale of localeFiles) {
    console.log(`\n📝 Checking ${locale}...`);

    try {
      const messages = loadMessages(locale);
      const issues = validateCatalog(sourceMessages, messages);

      if (issues.length === 0) {
        const keyCount = flattenMessages(messages).size;
        console.log(`✅ ${locale}: Keys and message structure match (${keyCount} keys)`);
        continue;
      }

      hasErrors = true;
      console.log(`❌ ${locale}: Found ${issues.length} issue(s)`);

      const maxIssues = 25;
      for (const issue of issues.slice(0, maxIssues)) {
        console.log(`   - ${issue.key}: ${issue.reason}`);
      }
      if (issues.length > maxIssues) {
        console.log(`   ... and ${issues.length - maxIssues} more`);
      }
    } catch (error) {
      hasErrors = true;
      console.log(`❌ ${locale}: Error loading messages - ${error.message}`);
    }
  }

  if (hasErrors) {
    console.log(
      '\n❌ Translation check failed. Some locales have missing/extra keys or mismatched message structure.',
    );
    process.exit(1);
  }

  console.log('\n✅ All translations are in sync!');
}

checkTranslations();
