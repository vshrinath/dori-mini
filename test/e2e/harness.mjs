#!/usr/bin/env node
/**
 * Master E2E Test Harness for Dori Mini
 * Provides isolated sandbox environments, vault seeding, API client bridging,
 * and test runner utilities for Tiers 1-4.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { actions, getAction } from '../../actions.mjs';
import { api } from '../../electron-app/src/lib/api.js';

export const ROOT = resolve(process.cwd());

/**
 * Creates an isolated sandbox test environment with dedicated VAULT_ROOT and DORI_CONFIG_DIR.
 * @param {string} name
 */
export function createSandbox(name = 'test') {
  const nonce = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const vaultDir = join(ROOT, `.test-vault-e2e-${name}-${nonce}`);
  const configDir = join(ROOT, `.test-config-e2e-${name}-${nonce}`);
  const clarDir = join(configDir, 'clarifications');

  // Create clean directories
  if (existsSync(vaultDir)) rmSync(vaultDir, { recursive: true, force: true });
  if (existsSync(configDir)) rmSync(configDir, { recursive: true, force: true });

  mkdirSync(vaultDir, { recursive: true });
  mkdirSync(configDir, { recursive: true });
  mkdirSync(clarDir, { recursive: true });

  mkdirSync(join(vaultDir, 'finances/trips'), { recursive: true });
  mkdirSync(join(vaultDir, 'finances/reimbursements'), { recursive: true });
  mkdirSync(join(vaultDir, 'entities/people'), { recursive: true });
  mkdirSync(join(vaultDir, 'entities/organizations'), { recursive: true });
  mkdirSync(join(vaultDir, 'entities/brands'), { recursive: true });
  mkdirSync(join(vaultDir, 'entities/projects'), { recursive: true });
  mkdirSync(join(vaultDir, 'projects'), { recursive: true });
  mkdirSync(join(vaultDir, 'meetings'), { recursive: true });
  mkdirSync(join(vaultDir, 'inbox'), { recursive: true });
  mkdirSync(join(vaultDir, '.dori/tasks/records'), { recursive: true });
  mkdirSync(join(vaultDir, '.dori/clarifications'), { recursive: true });
  mkdirSync(join(vaultDir, '.dori/decisions'), { recursive: true });

  const prevVault = process.env.VAULT_ROOT;
  const prevConfig = process.env.DORI_CONFIG_DIR;
  const prevClar = process.env.CLARIFICATION_STORE_ROOT;

  process.env.VAULT_ROOT = vaultDir;
  process.env.DORI_CONFIG_DIR = configDir;
  process.env.CLARIFICATION_STORE_ROOT = clarDir;

  const env = {
    ...process.env,
    VAULT_ROOT: vaultDir,
    DORI_CONFIG_DIR: configDir,
    CLARIFICATION_STORE_ROOT: clarDir,
  };

  return {
    vaultDir,
    configDir,
    clarDir,
    env,
    teardown: () => {
      try {
        if (existsSync(vaultDir)) rmSync(vaultDir, { recursive: true, force: true });
        if (existsSync(configDir)) rmSync(configDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
      if (prevVault !== undefined) process.env.VAULT_ROOT = prevVault;
      else delete process.env.VAULT_ROOT;

      if (prevConfig !== undefined) process.env.DORI_CONFIG_DIR = prevConfig;
      else delete process.env.DORI_CONFIG_DIR;

      if (prevClar !== undefined) process.env.CLARIFICATION_STORE_ROOT = prevClar;
      else delete process.env.CLARIFICATION_STORE_ROOT;
    },
  };
}

/**
 * Execute an action CLI in a dedicated subprocess with custom env.
 */
export function runActionCli(actionId, params = {}, env = process.env) {
  const res = spawnSync(
    process.execPath,
    [join(ROOT, 'actions.mjs'), 'run', actionId, JSON.stringify(params)],
    {
      cwd: ROOT,
      env: { ...process.env, ...env },
      encoding: 'utf-8',
    },
  );

  if (res.status !== 0) {
    let errMsg = res.stderr || res.stdout || `Action ${actionId} failed with exit code ${res.status}`;
    try {
      const parsed = JSON.parse(res.stderr || res.stdout);
      if (parsed.error) errMsg = parsed.error;
    } catch {
      // ignore json parse error
    }
    const err = new Error(errMsg);
    err.status = res.status;
    err.raw = res;
    throw err;
  }

  try {
    return JSON.parse(res.stdout);
  } catch {
    return res.stdout.trim();
  }
}

/**
 * Sets up global window.dori.call bridge connected to actions.mjs.
 * @param {Object} [options]
 */
export function setupWindowApiBridge(options = {}) {
  const calls = [];
  const env = options.env || process.env;

  globalThis.window = {
    dori: {
      call: async (actionId, params = {}) => {
        calls.push({ actionId, params });

        // Map common aliases if UI client uses shorthand
        let targetAction = actionId;
        if (actionId === 'list_trips') targetAction = 'list_trip_ledgers';
        if (actionId === 'list_ledgers') targetAction = 'list_trip_ledgers';

        if (options.customHandler) {
          const customResult = await options.customHandler(targetAction, params);
          if (customResult !== undefined) return customResult;
        }

        return runActionCli(targetAction, params, env);
      },
    },
  };

  return {
    calls,
    cleanup: () => {
      delete globalThis.window;
    },
  };
}

/**
 * Lightweight test runner for modular test files.
 */
export class TestRunner {
  constructor(suiteName) {
    this.suiteName = suiteName;
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.errors = [];
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log(`\n=== Running ${this.suiteName} ===`);
    const start = Date.now();

    for (const { name, fn } of this.tests) {
      try {
        await fn();
        this.passed++;
        console.log(`  [PASS] ${name}`);
      } catch (err) {
        this.failed++;
        this.errors.push({ name, error: err });
        console.error(`  [FAIL] ${name}`);
        console.error(`         ${err.message}`);
      }
    }

    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`\nResult for ${this.suiteName}: ${this.passed} passed, ${this.failed} failed (${duration}s)\n`);

    if (this.failed > 0) {
      return false;
    }
    return true;
  }
}

export { assert, api, actions, getAction };
