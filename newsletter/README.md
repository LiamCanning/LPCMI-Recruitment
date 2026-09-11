# Daily Edition renderer

`build_digest.py` renders and sends Liam's "Daily Edition" morning newsletter.

It exists here, in version control, rather than inside the cloud routine's prompt
because between 3 and 11 August 2026 four separate scheduled runs treated an
in-prompt template as reference material, ignored it, and hand-wrote their own
HTML instead - shipping four different broken designs. Keeping the renderer as a
checked-out file means the agent never writes it.

## Contract

The agent's only output is `/tmp/digest_data.json`:

```json
{
  "date_str": "Wednesday, 12 August 2026",
  "short_date": "12 Aug",
  "top_headline": "<=90 chars, becomes the masthead headline AND the subject>",
  "today_line": "one line, or \"\" to omit the Today card",
  "sports":  [["headline", "context", "https://real/article", "Off the Pitch", "why it matters"]],
  "local":   [["titular", "contexto en espanol", "https://real/article", "Las Provincias", "why it matters in English"]],
  "general": [["headline", "context", "https://real/article", "The Times", "why it matters"]]
}
```

Then:

```bash
RESEND_KEY=... SLACK_BOT=... python3 newsletter/build_digest.py --dry-run   # render only
RESEND_KEY=... SLACK_BOT=... python3 newsletter/build_digest.py            # render and send
RESEND_KEY=... SLACK_BOT=... python3 newsletter/build_digest.py --alert "reason"
```

## Secrets

This repository is public, so `build_digest.py` contains no credentials.
`RESEND_KEY` and `SLACK_BOT` are read from the environment and supplied by the
caller. Never commit them here.

## Guarantees

The script aborts before sending, naming every offending story, if any story is
missing its context or its English "Why it matters" line, if a Valencia story has
no real article link or has had its Spanish accents stripped, if a Valencia
context merely restates its headline, if any URL goes through the r.jina.ai
proxy, or if `top_headline` is missing or over 90 characters. A homepage-only URL
elsewhere renders without a "Read more" button and is named in a NOTE.

Sending uses an idempotency key scoped to the UTC date **and hour**, so a retry
within the same hour replays rather than duplicating.
