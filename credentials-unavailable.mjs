// Loader shim for the credentials store's crypto/DB core.
//
// `credentials-lib.mjs` is deliberately NOT part of the public dori-mini package —
// it's macOS-only (Keychain + pbcopy) and not something to hand out even sanitized
// (see README, "Not included"). The intake front-ends that sit on top of it ARE
// shipped, so a static import would crash a public clone at module-load time with
// an opaque ERR_MODULE_NOT_FOUND. This resolves it at runtime instead and explains
// the situation in plain terms.
export async function loadCredentialsLib() {
  try {
    return await import('./credentials-lib.mjs');
  } catch (err) {
    if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
    console.error(`The local credentials store isn't installed on this machine.

This script is the intake front-end for an encrypted key/password store whose
core (credentials-lib.mjs) is macOS-only and isn't shipped with dori-mini —
see "Not included" in the README. Without it there's nothing to write to.`);
    process.exit(1);
  }
}
