<div align="center">

# stratx

**Research that shows its work.**

Every claim resolves to the exact sentence it came from.
What the sources could not support is reported, not quietly dropped.

[![test](https://github.com/janmejai2002/stratx/actions/workflows/test.yml/badge.svg)](https://github.com/janmejai2002/stratx/actions/workflows/test.yml)
[![version](https://img.shields.io/badge/version-0.1.0-A2640B)](https://github.com/janmejai2002/stratx/releases)
[![node](https://img.shields.io/badge/node-%E2%89%A518-2B6B50)](https://nodejs.org)
[![dependencies](https://img.shields.io/badge/dependencies-0-2B6B50)](package.json)
[![licence](https://img.shields.io/badge/licence-MIT-525B68)](LICENSE)

[Website](https://janmejai2002.github.io/stratx/) · [Install](#install) · [How it works](#how-it-works) · [Roadmap](#roadmap)

</div>

---

```console
$ stratx ask "What was the battery pack cost in Q2 2025 versus Q2 2026?"

claims
  ✓ Q2 2025 battery pack cost in Southeast Asia was USD 96 per kilowatt-hour
      "Volume-weighted average pack prices in Southeast Asia reached USD 81 per
       kilowatt-hour in the second quarter of 2026, down from USD 96 in the
       same quarter of 2025."
      Regional Battery Cost Survey, Q2 2026 · chars 41-204

could not support
  · Whether the requirement applies to years other than 2027
      looked for: local content requirements for 2025, 2026, or post-2027

3/4 claims with spans · 2 unsupported · 2 sources · $0.0032
```

## Why this exists

A citation marker tells you a source exists. It does not tell you whether that
source says what the sentence in front of you claims. Those two things have
come apart:

| | |
|---|---|
| **15-20%** | citation hallucination on factual tasks, rising to **35-55%** on niche or recent topics ([suprmind, 2026](https://suprmind.ai/hub/ai-hallucination-rates-and-benchmarks/)) |
| **89.4%** | DOI hallucination in the humanities, against 29.1% in the natural sciences ([arXiv 2604.03173](https://arxiv.org/html/2604.03173v1)) |
| **68%** | best automated citation attribution against a 70% human baseline, and it still fails silently on fabricated URLs ([arXiv 2605.08583](https://arxiv.org/pdf/2605.08583)) |

stratx keeps the two separate. A claim is marked supported **only** when a
sentence carrying it has been located, with character offsets into the original
file. Everything else is marked unverified, or listed under *could not support*
along with what was searched for.

Those figures are themselves span-verified by stratx against the sources cited.

## Install

```bash
claude plugin marketplace add janmejai2002/stratx
claude plugin install stratx@stratx
```

Then, in the folder you want to work in:

```bash
stratx init
stratx config set-key      # prompts, input hidden
stratx ingest ./docs
stratx ask "your question"
```

`stratx doctor` reports exactly what is missing at any point.

**Requirements.** Node 18 or newer, and one API key: [OpenRouter](https://openrouter.ai)
(`sk-or-…`) or [Anthropic](https://platform.claude.com) (`sk-ant-…`). The provider
is inferred from the key's shape, so you never declare one. There are no npm
dependencies to install.

## How it works

**Retrieval is lexical (BM25), not embeddings.** Three reasons, in order of
importance. Indexing costs nothing and runs offline, so the key is only ever
spent on reasoning. There are no dependencies, which is what makes this portable
to a machine that is not the author's. And term positions are exact, so a
retrieved span resolves to real character offsets rather than an approximate
neighbourhood.

**Answers are compact by design.** `stratx ask` writes the full record to disk
and returns an id, a gist and counts. A conversation that runs forty queries must
not accumulate forty documents in its context. That accumulation, rather than
prompt length, is what makes agentic research expensive.

**Ordering is enforced, not requested.** A run moves through eight phases. Each
writes a durable artifact, and the next refuses to start until it exists:

```
plan → ground → assign → execute → challenge → synthesize → compile → record
```

A crash resumes instead of restarting, and any phase can be re-run on its own
because its input is a file rather than a conversation.

```console
$ stratx run start execute
error: Cannot start "execute": phase "assign" has not committed an artifact yet.
```

**Negative results are output.** Reporting that 147 sources were searched and
none support a claim is a finding, not a shortfall. It is the cheapest valuable
thing a research tool can produce and almost nothing ships it.

## Commands

| Command | Does |
|---|---|
| `stratx doctor` | check environment, key, corpus |
| `stratx init` | create the `.stratx` workspace here |
| `stratx config set-key` | store a key, input hidden |
| `stratx ingest <path>` | add sources. Local, free, offline |
| `stratx sources` | list what is indexed |
| `stratx ask "<q>"` | grounded answer with spans |
| `stratx show <id>` | full stored record for a previous answer |
| `stratx run new "<goal>"` | start a phased engagement |
| `stratx run next` | what to do, and what is blocking it |
| `stratx run start\|commit <phase>` | move a phase |
| `stratx ledger` | token and cost totals, per phase |

Add `--json` to any command for machine-readable output.

## Layout

The plugin is read-only and shared. The workspace is per-project and mutable.
They never mix, which is what lets the same plugin serve every project on a
machine.

```
.stratx/                 in your project, gitignored
├── config.json          model, backend, spend cap, key
├── corpus/              source text plus chunk offsets
├── spans/               full query records
├── runs/<id>/           phase state and artifacts
└── ledger.jsonl         append-only token and cost log
```

## Cost

Indexing and retrieval are local and free. Only reasoning is billed, at roughly
a fifth of a cent per question on default settings. `stratx ledger` shows real
token counts per phase, written by code on every call rather than by a model
choosing to record them.

## Roadmap

- [x] Local grounding, no external service required
- [x] Span-level citations with character offsets
- [x] Negative results, with what was searched for
- [x] Phase machine with enforced preconditions
- [x] Append-only cost ledger
- [x] Cross-platform CI on Linux, macOS and Windows
- [ ] Reading surface: claims rendered with hover to source
- [ ] Engagement console: read-only view over `run.json`
- [ ] NotebookLM as an optional grounding backend, for artifact generation
- [ ] Structured claims interchange between specialists
- [ ] Batch verification pass on an independent model

## Verification

Every capability claimed above was exercised against live calls before being
written down, not asserted from reading the code. Two span-fidelity bugs were
found that way and fixed:

1. Soft line wrapping in a source file truncated quotes mid-sentence. If a whole
   sentence is the product, half a sentence is a broken product.
2. Markdown headings were glued onto the sentence beneath them.

Both are covered by regression tests in [`test/spans.test.js`](test/spans.test.js).

```bash
node --test test/spans.test.js
```

## Contributing

Issues and pull requests welcome. Two rules that matter more than style here:

- **No capability claim without a live run behind it.** If it has not been
  executed, it does not go in the README.
- **Anything that must be true should be enforced by code**, not requested in a
  prompt. If a guarantee only exists because a model was asked nicely, it is not
  a guarantee.

## Licence

MIT
