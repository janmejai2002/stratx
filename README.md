# stratx

Grounded research where every claim carries the sentence it came from — and
where what *couldn't* be supported is reported rather than smoothed over.

A Claude Code plugin. Setup is one API key. Indexing and retrieval are local,
offline and free; the key is spent only on reasoning.

```
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

## Why

A citation marker tells you a source exists. It does not tell you whether the
source says what the sentence in front of you claims. Those two things have
come apart: citation hallucination still runs 15–20% on factual tasks and far
higher on niche topics, so "there is a footnote" and "this is true" are no
longer the same statement.

stratx separates them. A claim is only marked supported when an actual
sentence carrying it has been located, with character offsets into the
original file. Everything else is marked `?` or listed under *could not
support*.

## Install

```bash
claude plugin marketplace add janmejai2002/stratx
claude plugin install stratx@stratx
```

Then, in the folder you want to work in:

```bash
stratx init
stratx config set-key          # prompts, input hidden
stratx ingest ./docs
stratx ask "your question"
```

`stratx doctor` tells you what's missing at any point.

**Requirements:** Node 18+ (for built-in `fetch`) and an API key —
[OpenRouter](https://openrouter.ai) (`sk-or-…`) or
[Anthropic](https://platform.claude.com) (`sk-ant-…`). The provider is
inferred from the key shape. There are no npm dependencies to install.

## How it works

**Retrieval is lexical (BM25), not embeddings.** Three reasons, in order:
indexing costs nothing and works offline, so the key is only ever spent on
reasoning; there are no dependencies, which is what makes this portable to a
machine that isn't the author's; and term positions are exact, so a retrieved
span resolves to real character offsets rather than an approximate
neighbourhood.

**Answers are compact by design.** `stratx ask` writes the full record to disk
and returns an id, a gist and counts. A conversation that runs forty queries
must not accumulate forty documents in its context — that accumulation, not
prompt length, is what makes agentic research expensive.

**Ordering is enforced, not requested.** A run moves through
`plan → ground → assign → execute → challenge → synthesize → compile → record`.
Each phase writes a durable artifact and the next phase refuses to start until
it exists. A crash resumes instead of restarting, and any phase can be re-run
on its own because its input is a file rather than a conversation.

## Commands

| | |
|---|---|
| `stratx doctor` | check environment, key, corpus |
| `stratx init` | create the `.stratx` workspace here |
| `stratx config set-key` | store a key (hidden input) |
| `stratx ingest <path>` | add sources — local, free, offline |
| `stratx sources` | list what's indexed |
| `stratx ask "<q>"` | grounded answer with spans |
| `stratx show <id>` | full stored record |
| `stratx run new "<goal>"` | start a phased engagement |
| `stratx run next` | what to do, and what's blocking it |
| `stratx ledger` | token and cost totals, per phase |

Add `--json` to any command for machine-readable output.

## Layout

The plugin is read-only and shared. The workspace is per-project and mutable.
They never mix.

```
.stratx/                 in your project, gitignored
├── config.json          model, backend, spend cap, key
├── corpus/              source text + chunk offsets
├── spans/               full query records
├── runs/<id>/           phase state + artifacts
└── ledger.jsonl         append-only token and cost log
```

## Status

**v0.1** — local grounding, span-level citations, negative results, the phase
machine, cost ledger.

Next: the reading surface (claims rendered with hover-to-source), NotebookLM
as an optional grounding backend for artifact generation, and the engagement
console.

## Licence

MIT
