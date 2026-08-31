---
name: dori-build
description: Install the Dori build-system process into a product repo, reverse-engineer as-built features from existing code, or run feature/verification checks. Use when the user says init-into, reverse-engineer, as-built features, brainstorm-to-build, dori-build, or asks to inventory features and missing tests in the current project.
---

# Dori build process (any product repo)

Canonical process repo is the git root of `dori-build-system` (or
`DORI_BUILD_SYSTEM`). Product features live in the **current product** at
`docs/features/`.

1. Read `docs/reverse-engineering.md` in the process repo before writing features.
2. New behavior: `docs/planning.md` then `docs/requirements-gathering.md`, output
   `docs/features/<feature>/requirements.yaml` and `verification-record.yaml`.
3. Existing product: reverse-engineer per that doc. Requirement items stay
   `WORKING` until the user confirms. `done` only with a real product test.
4. PHI: never put patient names, IDs, or clinical sample content in feature files.
5. Init: `node <process>/scripts/init-into.mjs <product-root>`
6. Start a feature: from the product, `node scripts/dori-build-check.mjs start <feature>`
   scaffolds `docs/features/<feature>/` and points at the Problem Statement interview.
   It does not run the interview itself — that's step 2 above.
7. Status: `node scripts/dori-build-check.mjs status [<feature>]` reports which
   artifacts exist per feature and each one's top-level `status:` field.
8. Check: from the product, `node scripts/dori-build-check.mjs` (or
   `DORI_PRODUCT_ROOT=<product> node <process>/scripts/check-feature-contracts.mjs`).
9. Unsupervised build workers are opt-in, not default.
