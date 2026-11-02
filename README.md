# Maple Street Hardware assistant

A RAG chatbot that answers customer questions only from the store's documents.
TypeScript, Express, OpenAI, no RAG framework.

## Quick start

Needs Node 20+ and an OpenAI API key.

```bash
git clone https://github.com/JulioRy/maple-street-rag.git && cd maple-street-rag
npm install
cp .env.example .env   # add your OpenAI key (Windows cmd: copy .env.example .env)
npm start              # ingests docs/, then listens on http://localhost:3000
npm run eval           # in a second terminal
```

`npm test` runs the unit tests (no key needed).
`npm run eval:verbose` also prints each question and answer.
`npm run ask -- "How much is the tile saw per day?" 2026-11-05` asks one question (the date is optional).

## How it works

**Safety first, at ingest.**
Before anything is read or embedded, I filter on metadata (front matter, or `manifest.json`).
Only `audience: public` gets in; internal files and the file with no metadata are skipped, so the model never sees them.
When two files share a title, I index only the one with the latest `effective` date.
That drops the 2025 return policy and the old HTML FAQ completely, so an old answer is impossible, not just unlikely.
A test runs the real ingest and checks that no internal text ends up in the index.

**Chunking.**
I split by headings, so a rule stays with its exceptions (for example "opened power tools").
Each chunk starts with `[Title > Heading]`.
The CSV is one chunk per row with its column names, which makes price and aisle lookups exact.
HTML is cleaned with cheerio (no nav, footer or scripts) and the PDF's numbered sections become headings.

**Retrieval.**
`text-embedding-3-small` in an in-memory array (164 chunks don't need a database), plus my own BM25 for exact words like "20V" or "drywall screws".
Both rankings are merged with Reciprocal Rank Fusion.
I send k = 8 chunks because many questions need two or three files (store hours + key counter, contractor terms + flyer).

**Follow-ups.**
Sessions keep the last 6 turns.
If there is history, a small LLM call rewrites "How much is the deposit on it?" into "carpet cleaner rental deposit" before searching.

**Dates.**
The code reads each flyer's "Valid ... through ..." line and tags it ACTIVE, EXPIRED or UPCOMING for the request's date.
The model never compares dates itself.

**Injected review.**
Every chunk goes inside a `<document>` tag, and the prompt says document text is data, never instructions.

**Arithmetic and "not in the docs".**
The model answers in JSON with a `reasoning` field where it does the math first (never returned to the user).
Time periods are converted in code ("5 weeks" becomes "35 days"), because the model got that comparison wrong.
The model picks `answer`, `not_in_docs` or `decline` under clear rules in the prompt.
Code then keeps only sources that were really retrieved, and replaces any answer with a phone number that isn't in the documents.
Every model call has a 20 s timeout and returns a clean error.

More detail, with the alternatives I considered, is in `DECISIONS.md`.

## Eval results

```
FAIL lumber-01: missing group ["181.47"]
     answer: The total cost for 3 sheets of 3/4 inch plywood with 4 cuts on each sheet is $178.47 before tax.

57/58 passed in 24s
```

My last runs scored between 57 and 58 out of 58.
`lumber-01` fails about one run in three: the model charges the paid cuts once instead of once per sheet.
Retrieval is right, it's an arithmetic slip; a calculator tool would fix it.

## Cost and time

One eval run: ~112k input and ~6k output tokens on `gpt-4o-mini`, about $0.02.
Time spent: about 2 hours, with AI coding tools.

## 100 stores x 5,000 documents

- Postgres + pgvector with a `storeId` filter instead of the in-memory array.
- An ingest queue that only re-embeds changed files.
- A reranker, Redis for sessions, and the eval running in CI.
- At that volume, cost matters: route simple questions to a cheaper model and cache common answers.

## What's left

- The arithmetic slip above (calculator tool).
- Some answers are correct but thin, for example missing a workshop's start time.
- No auth or rate limiting; `/debug` endpoints are open.
