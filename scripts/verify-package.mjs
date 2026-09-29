#!/usr/bin/env node
// Checks the tarball `npm pack` produced before it can be published: every
// entry point package.json points at is inside it, the native sources are
// there, and nothing that only belongs to the repo (tests, the example app,
// build output) leaked in.
//
//   node scripts/verify-package.mjs <tarball> [--version <expected>]

import { execFileSync } from 'node:child_process';
import { appendFileSync, statSync } from 'node:fs';

const args = process.argv.slice(2);
const tarball = args[0];
const versionFlag = args.indexOf('--version');
const expectedVersion = versionFlag === -1 ? null : args[versionFlag + 1];

if (!tarball) {
  console.error('usage: verify-package.mjs <tarball> [--version <expected>]');
  process.exit(2);
}

const MAX_TARBALL_BYTES = 1024 * 1024;

const REQUIRED = [
  'package.json',
  'README.md',
  'LICENSE',
  'NextImage.podspec',
  'scripts/next_image_pods.rb',
  'src/index.tsx',
  'src/NextImageNativeComponent.ts',
  'src/NativeNextImageModule.ts',
  'lib/module/index.js',
  'lib/typescript/src/index.d.ts',
  'android/build.gradle',
  'android/src/main/AndroidManifest.xml',
  'android/src/main/java/com/nextimage/NextImagePackage.kt',
  'ios/NextImageModule.mm',
  'ios/NextImageViewComponentView.mm',
];

const FORBIDDEN = [
  [/(^|\/)__tests__\//, 'JS tests'],
  [/^android\/src\/test\//, 'Kotlin tests'],
  [/^tests\//, 'Swift tests'],
  [/^example\//, 'the example app'],
  [/^docs\//, 'README assets'],
  [/^(android|ios)\/build\//, 'native build output'],
  [/^android\/(gradle\/|gradlew)/, 'the Gradle wrapper'],
  [/(^|\/)\.[^/]+$/, 'a dotfile'],
  [/\.(tgz|log)$/, 'a tarball or log'],
];

const entries = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .map((entry) => entry.replace(/^package\//, ''))
  .filter((entry) => !entry.endsWith('/'));
const files = new Set(entries);
const manifest = JSON.parse(
  execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], {
    encoding: 'utf8',
  })
);

const errors = [];

for (const file of REQUIRED) {
  if (!files.has(file)) errors.push(`missing ${file}`);
}

for (const file of entries) {
  for (const [pattern, what] of FORBIDDEN) {
    if (pattern.test(file)) errors.push(`${file} is ${what}`);
  }
}

// Every path package.json points at has to resolve inside the tarball.
const targets = new Set([manifest.main, manifest.types]);
const collect = (value) => {
  if (typeof value === 'string') targets.add(value);
  else if (value && typeof value === 'object')
    Object.values(value).forEach(collect);
};
collect(manifest.exports);
for (const target of targets) {
  if (!target || target.includes('*')) continue;
  const file = target.replace(/^\.\//, '');
  if (!files.has(file)) errors.push(`package.json points at ${file}, which is not packed`);
}

if (expectedVersion && manifest.version !== expectedVersion) {
  errors.push(`version is ${manifest.version}, expected ${expectedVersion}`);
}

const size = statSync(tarball).size;
if (size > MAX_TARBALL_BYTES) {
  errors.push(`tarball is ${size} bytes, over the ${MAX_TARBALL_BYTES} byte budget`);
}

const summary = [
  `### Package check: ${manifest.name}@${manifest.version}`,
  '',
  '| | |',
  '| :--- | :--- |',
  `| Files | ${entries.length} |`,
  `| Tarball | ${(size / 1024).toFixed(1)} KB |`,
  `| Result | ${errors.length === 0 ? 'passed' : `${errors.length} problem(s)`} |`,
  '',
  ...errors.map((error) => `- ${error}`),
  '',
].join('\n');

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`error: ${error}`);
  process.exit(1);
}

console.log(
  `ok - ${manifest.name}@${manifest.version}: ${entries.length} files, ${(size / 1024).toFixed(1)} KB`
);
