// Loader shim for the credentials store's crypto/DB core.
//
// `credentials-lib.mjs` ships with dori-mini, so this normally just resolves. It stays
// a runtime import purely so a missing/removed core fails with a sentence instead of an
// opaque ERR_MODULE_NOT_FOUND at module-load time, before any of the intake front-ends
// have printed a thing. (Not being on macOS is a different failure — the core itself
// reports that, since it affects every entry point, not just these two.)
export async function loadCredentialsLib() {
  try {
    return await import('./credentials-lib.mjs');
  } catch (err) {
    if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
    console.error(`Can't find credentials-lib.mjs, the encrypted store's core.

It should sit next to this script. If you're in a clone, re-pull; if you removed
it deliberately, these intake front-ends have nothing to write to.`);
    process.exit(1);
  }
}
