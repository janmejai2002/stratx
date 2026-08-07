---
name: setup
description: Set up stratx in this folder - check the environment, store an API key, and ingest the first sources. Use when the user installs stratx, says "set up stratx", hits a "no API key" or "corpus is empty" error, or asks how to get started.
---

# stratx setup

Get this folder ready for grounded research. Aim for the smallest number of
steps the user has to take, and never ask them for something you can detect.

## 1. Check what is already true

```bash
stratx doctor --json
```

Read the `checks` array. Only act on what is actually missing. Do not run
`init` if the workspace exists, and never ask for a key that `doctor` already
resolved.

## 2. Create the workspace, if missing

```bash
stratx init
```

This creates `.stratx/` in the current project. It is gitignored by default
and holds the corpus, spans, runs and ledger. It is per-project state, not
part of the plugin - a different project gets a different workspace.

## 3. The API key, if missing

**Never ask the user to paste a key into the chat, and never put a key in a
shell command you run** - it would land in shell history and in the transcript.

Tell the user to run this themselves in their own terminal:

```bash
stratx config set-key
```

It prompts with hidden input and stores the key in `.stratx/config.json`
(gitignored, chmod 600 where the OS supports it).

If they would rather use an environment variable, any of these work and take
precedence: `STRATX_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`. A
`.env` file beside the project is also read.

The provider is inferred from the key: `sk-or-...` is OpenRouter, `sk-ant-...`
is Anthropic. The user never declares it.

## 4. Ingest sources

```bash
stratx ingest <file-or-folder>
```

Reads `.md .txt .csv .json .yaml .html` and similar. Indexing is local, free
and offline - no API call is made, so this is safe to run on a large folder.

If the user has no sources yet, say so plainly. stratx answers **only** from
the corpus; with an empty corpus every question correctly returns "could not
support", which is working as designed, not a failure.

## 5. Confirm it works

```bash
stratx ask "a question the sources can actually answer"
```

A healthy result shows claims marked `✓` with a quoted source sentence and
character offsets beneath each one.

## Reporting back

Tell the user, in one short paragraph: where the workspace is, which provider
was detected, how many sources are indexed, and the single next command. Do
not paste `doctor` output verbatim.

## Cost note worth stating once

Indexing and retrieval are local and cost nothing. The API key is spent only
on reasoning - roughly a fifth of a cent per question at default settings. The
running total is always available:

```bash
stratx ledger
```
