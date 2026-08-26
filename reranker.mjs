// Shared local cross-encoder reranker — direct port of dori-engine's TransformersReranker
// (packages/embeddings/src/reranker.ts) and its wiring in src/vector/index.ts. Factored out
// of semantic-index.mjs (where it first landed, Part 17) into its own module because
// query-vault.mjs needs the identical implementation for the FTS channel (Part 18) — the
// two channels must share pointer-identical scoring behavior for a cross-channel comparison
// to mean anything. No top-level side effects or CLI dispatch, so importing this from either
// entry point is safe (unlike the smaller RRF fusion helpers those two files still
// deliberately duplicate, rather than share, because importing across THOSE would run the
// other file's own dispatch).
//
// Scores one (query, document) pair per forward pass — real Dori's own comment on this:
// "callers should only rerank a small shortlist from a cheaper first-pass retrieval, not a
// corpus." Never call on more than a few dozen candidates.
export const RERANK_MODEL = process.env.RERANK_MODEL || 'mixedbread-ai/mxbai-rerank-xsmall-v1';
export const RERANK_CANDIDATE_MULTIPLIER = 4;
// RERANK=0 disables it — an escape hatch for A/B measurement against the pre-rerank
// baseline (docs/research-benchmarks-2026-08-26.md), not a toggle real Dori exposes.
export const RERANK_ENABLED = process.env.RERANK !== '0';

let rerankerPromise = null;
async function getReranker() {
  if (!rerankerPromise) {
    rerankerPromise = (async () => {
      const { AutoModelForSequenceClassification, AutoTokenizer } = await import('@huggingface/transformers');
      const [tokenizer, model] = await Promise.all([
        AutoTokenizer.from_pretrained(RERANK_MODEL),
        AutoModelForSequenceClassification.from_pretrained(RERANK_MODEL, { dtype: 'q8' }),
      ]);
      return { tokenizer, model };
    })();
  }
  return rerankerPromise;
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

async function modelScorer(query, texts) {
  if (texts.length === 0) return [];
  const { tokenizer, model } = await getReranker();
  const scores = [];
  for (const text of texts) {
    const inputs = tokenizer(query, { text_pair: text, padding: true, truncation: true });
    const { logits } = await model(inputs);
    scores.push(sigmoid(logits.data[0]));
  }
  return scores;
}

// The pure contract, with the scorer injectable — this is what test-rerank.mjs exercises
// directly, with a fake scorer, so the fail-open/scoring-replaces/disabled/short-array
// behavior is tested against the REAL code path rather than a hand-mirrored copy of it.
// `rerank()` below is just this wired to the real cross-encoder.
//
// Applies `scoreFn` to `candidates` (the fused first-stage ranking, each with a `.text`)
// and returns a NEW array sorted by score, which fully REPLACES the first-stage score —
// mirrors real Dori exactly: "when a reranker ran, its cross-encoder scores fully replace
// the first-stage scores... reranking already reflects deep semantic relevance to the
// query text" (src/vector/index.ts). Fails open: any error keeps candidates in their
// original first-stage order, same contract as SearchIndex.query's try/catch, so a broken
// or unavailable reranker degrades search quality — it never errors the whole search.
export async function rerankWithScorer(query, candidates, scoreFn, enabled = RERANK_ENABLED) {
  if (!enabled || candidates.length <= 1) return candidates;
  try {
    const scores = await scoreFn(query, candidates.map((c) => c.text));
    return candidates
      .map((c, i) => ({ ...c, score: scores[i] ?? 0 }))
      .sort((a, b) => b.score - a.score);
  } catch (err) {
    console.error(`Reranking failed, keeping first-stage ranking: ${err.message}`);
    return candidates;
  }
}

export async function rerank(query, candidates) {
  return rerankWithScorer(query, candidates, modelScorer, RERANK_ENABLED);
}
