# Market and research notes for stratx positioning

Collected August 2026. Every figure below is attributed to a named public
source so that claims derived from this file can be traced rather than
asserted.

## Citation hallucination rates

Studies published across 2025 and 2026 report that advanced models still
exhibit 15 to 20 percent hallucination rates on factual citation tasks, and
that this rises sharply to between 35 and 55 percent on niche or recent
topics. Source: suprmind.ai AI hallucination rates and benchmarks, August
2026, https://suprmind.ai/hub/ai-hallucination-rates-and-benchmarks/

Fabrication rates for references range from 18 percent to over 50 percent
depending on model and task, with more than 100 hallucinated references
identified in NeurIPS 2025 papers alone. Source: arXiv 2604.03173, Detecting
and Correcting Reference Hallucinations in Commercial LLMs and Deep Research
Agents, https://arxiv.org/html/2604.03173v1

DOI hallucination reaches 89.4 percent in the humanities compared with 29.1
percent in the natural sciences. Legal citation hallucination ranges from 58
percent to 88 percent depending on the model and the court hierarchy involved.
Source: arXiv 2604.03173, https://arxiv.org/html/2604.03173v1

## Verification tooling and its limits

SemanticCite classifies citation support with 84 percent accuracy but requires
the cited source to be accessible. CiteGuard approaches human-level citation
attribution at 68 percent against a human baseline of 70 percent, yet fails
silently on fabricated URLs. Source: arXiv 2605.08583, Source or It Didn't
Happen: A Multi-Agent Framework for Citation Hallucination Detection,
https://arxiv.org/pdf/2605.08583

## Citation context classification as a trust signal

Scite operates a deep learning model over more than 1.6 billion citation
statements, classifying each as supporting, contrasting, or merely mentioning
the work it cites. The classification for any individual citation is a model
output rather than a human peer-review judgement, which makes it useful as a
triage signal and a pointer to the relevant sentence rather than a verdict.
Source: scite.ai features, https://scite.ai/features

Traditional citation-impact metrics are volume measures that answer how much
a work was cited. Smart Citations instead answer what the citing literature
actually said about a specific claim. Source: Quantitative Science Studies,
MIT Press, https://direct.mit.edu/qss/article/2/3/882/102990/

## Trust effects of showing sources

The trust gap is measurably smaller in retrieval-augmented systems where
outputs are accompanied by source citations, and users who can see why a model
gave a particular answer report significantly higher confidence. Source:
cmarix RAG and AI trust statistics 2026,
https://www.cmarix.com/blog/rag-ai-statistics/

## NotebookLM API availability

NotebookLM does not offer a public developer API, self-serve API keys, or
supported public endpoints for automating its features as of 2026. Google
Cloud documents NotebookLM Enterprise API methods for creating notebooks,
adding sources and generating audio overviews, but this is restricted to
enterprise customers. Source: AutoContent API blog, Does NotebookLM Have an
API, https://autocontentapi.com/blog/does-notebooklm-have-an-api

## Personalisation in assistants

By 2026 every major assistant had shipped a memory feature: OpenAI shipped
ChatGPT Dreaming on 4 June, Anthropic brought Claude Chat Memory to the free
tier on 2 March, and Google made Gemini Personal Context automatic and on by
default. Anthropic's implementation uses human-readable markdown files the
user can open and edit. Five companies operate five separate memory systems
and none of them interoperate. Source: MemoryLake, AI Memory Compared 2026,
https://www.memorylake.ai/en/blogs/ai-memory-compared-2026

These systems personalise content and tone. None of them personalise
epistemic posture, meaning what a given user accepts as sufficient evidence.

## Infinite canvas tooling

Flowith operates an infinite-canvas agentic workspace, topped Product Hunt in
June 2025 and reports more than one million users. Other infinite-canvas
knowledge surfaces include Heptabase, Scrintal, Obsidian Canvas, Milanote and
Kosmik. Source: eesel AI, Flowith review 2026,
https://www.eesel.ai/blog/flowith-review

## Generative interfaces

Gartner forecasts that more than 50 percent of new SaaS products will ship
with generative UI as the default by 2027. The customer experience and
personalisation software market is forecast to grow from 7.6 billion dollars
in 2021 to 11.6 billion dollars by 2026. Source: ZeeFrames, Generative UI
2026, https://zeeframes.com/insights/generative-ui-2026-interfaces-that-build-themselves-around-each-user
