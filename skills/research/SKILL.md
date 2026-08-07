---
name: research
description: Run grounded research over the local corpus - answer questions with exact source spans, and report what could not be supported. Use when the user asks a research question against ingested sources, wants citations they can verify, asks "what do my sources say about X", or starts a phased research engagement.
---

# stratx research

Answer from sources, with every claim traceable to the sentence it came from.

## The rule that matters most

**Never read a full stored answer into your context unless you are about to
reason over that specific answer.**

`stratx ask` deliberately returns a compact record - an id, a gist, and
counts. The full answer, every span and every claim are written to disk. A
conversation that runs forty queries must not accumulate forty documents.

```bash
stratx ask "question" --json      # compact: id, gist, counts, cost
stratx show <id> --json           # the full record - only when you need it
```

If you find yourself calling `show` on more than two or three ids in a row,
stop: that is the accumulation problem this design exists to prevent. Work
from the compact records instead.

## Answering a one-off question

```bash
stratx ask "What do the sources say about X?"
```

Read the output for three things and relay them honestly:

- **`✓` claims** - supported, with a quoted sentence and character offsets.
- **`?` claims** - the model asserted it but no sentence in the corpus carries
  it. Say so. Do not upgrade these to facts in your summary.
- **"could not support"** - what was searched for and not found.

That last section is the most valuable output, not a shortfall. Report it
prominently. "I checked 147 sources for evidence of X and none of them state
it" is a finding.

Never present a `?` claim as established, and never omit the unsupported list
to make an answer look cleaner.

## A phased engagement

For anything bigger than a single question, use a run. Each phase writes a
durable artifact, and a phase cannot start until its prerequisite committed
one - so a crash mid-way resumes rather than restarts.

```bash
stratx run new "the research goal"
stratx run next                       # what to do, and what is blocking it
stratx run start <phase>
# ... do the work, write the artifact ...
stratx run commit <phase> --artifact <path>
```

Phases: `plan → ground → assign → execute → challenge → synthesize → compile → record`

Always call `stratx run next` to decide what to do. Do not reconstruct
progress by re-reading earlier conversation - that is the exact context bloat
the phase machine removes.

If `run start` refuses, the prerequisite genuinely has not produced an
artifact. Produce it; do not work around the check.

## Claims, not essays

When a phase produces findings, write them as claims - one self-contained
assertion per line with its span reference - rather than prose:

```json
{"claim":"Regional pack costs settled at $81/kWh in Q2 2026","span":"q_2f52:cl_1","confidence":"direct"}
```

Structured claims can be sorted, deduplicated and compared mechanically.
Conflicting figures are then caught by comparison rather than by asking a
model to read two documents, which costs nothing and never misses.

## Cost

Retrieval is local and free; only reasoning is billed.

```bash
stratx ledger --json              # totals, broken down per phase
```

If a run approaches the configured `spend_cap_usd`, stop and tell the user
what it would cost to continue rather than silently spending.
