#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const productRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { processRoot } = JSON.parse(readFileSync(join(productRoot, '.dori-build.json'), 'utf8'))
const root = resolve(productRoot, processRoot)

// Artifact filenames per docs/feature-spec.md; required ones are flagged
// so status output can tell "missing" from "optional, not yet written".
const ARTIFACTS = [
  ['requirements.yaml', true],
  ['tech-constraints.yaml', false],
  ['verification-record.yaml', true],
  ['tasks.yaml', false],
  ['observe.yaml', false],
]

function runCheck() {
  const env = { ...process.env, DORI_PRODUCT_ROOT: productRoot }
  for (const script of ['check-feature-contracts.mjs', 'check-verification-evidence.mjs', 'check-verification-freshness.mjs']) {
    const result = spawnSync(process.execPath, [join(root, 'scripts', script)], {
      cwd: productRoot,
      env,
      stdio: 'inherit',
    })
    if (result.status) process.exit(result.status ?? 1)
  }
}

function runStart(feature) {
  if (!feature) {
    console.error('Usage: dori-build-check.mjs start <feature>')
    process.exit(2)
  }
  mkdirSync(join(productRoot, 'docs', 'features', feature), { recursive: true })
  console.log('dori-build: scaffolded docs/features/' + feature + '/')
  console.log('dori-build: next, run the Problem Statement interview (' + join(root, 'docs', 'problem-statement.md') + '), then Requirements Gathering (' + join(root, 'docs', 'requirements-gathering.md') + ')')
}

// Top-level 'status: <value>' scalar only (requirements.yaml / verification-record.yaml
// each carry one). A plain regex, not js-yaml: this file runs inside the product repo,
// which may not have js-yaml installed, so it stays dependency-free on purpose.
function topLevelStatus(path) {
  if (!existsSync(path)) return null
  const match = readFileSync(path, 'utf8').match(/^status:\s*(\S+)/m)
  return match ? match[1] : 'unknown'
}

function reportFeature(name) {
  console.log(name)
  const dir = join(productRoot, 'docs', 'features', name)
  for (const [file, required] of ARTIFACTS) {
    const status = topLevelStatus(join(dir, file))
    if (status === null) console.log('  ' + file + ': ' + (required ? 'MISSING' : 'not present'))
    else console.log('  ' + file + ': ' + status)
  }
}

function runStatus(feature) {
  const featuresDir = join(productRoot, 'docs', 'features')
  const names = feature
    ? [feature]
    : existsSync(featuresDir)
      ? readdirSync(featuresDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
      : []
  if (!names.length) {
    console.log('dori-build: no features found under docs/features/')
    return
  }
  names.forEach((name, i) => {
    if (i > 0) console.log('')
    reportFeature(name)
  })
}

const [cmd, arg] = process.argv.slice(2)
if (cmd === 'start') runStart(arg)
else if (cmd === 'status') runStatus(arg)
else runCheck()
