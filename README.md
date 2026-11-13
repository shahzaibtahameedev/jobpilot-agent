# jobpilot-agent

Finds LinkedIn hiring posts, writes a personal email for each, and sends it with your resume. Comes with a web app (Angular + Tailwind + Hono) to drive the whole flow, plus the original CLI pipeline.

One agent scrapes the relevant job posts by the provided query using Playwright MCP in a structured format including recruiter email, company name, post link etc. Another agent drafts the email subject, and the body is built from your template.

```
Agent A: scraper (Playwright MCP)  ->  audit (code)  ->  Agent B: email writer  ->  sender (Nodemailer)
```

Every stage reads and updates the single `data/jobs.json` file. Legacy date-wise files in `data/raw/` are merged into it automatically on first run. All agent calls use a free OpenRouter model by default, but you can update it in `.env`. See `.env.example` for reference.

## Setup
1. `npm install` and `npm install --prefix client`
2. Copy `.env.example` to `.env` and fill it in. Gmail needs 2-Step Verification and an [App Password](https://myaccount.google.com/apppasswords).
3. Put your LinkedIn `li_at` cookie in `.env` as `LINKEDIN_LI_AT`.
4. Set `SEARCH_QUERY` in `.env` to change the LinkedIn search (see `.env.example`). Without it, the default HR query is used.

Your resume, profile and email template can all be managed from the app's Settings page. The template's `{{positionName}}`, `{{companyName}}` and `{{recruiterName}}` placeholders are filled in for each post; when one is unknown it becomes "open HR", "your organization" or "Hiring Manager".

## Run the app
| Command | What it does |
|---|---|
| `npm run app` | Builds the client and serves everything at http://localhost:3000 |
| `npm run dev:server` | API server only, with reload (port 3000) |
| `npm run dev:client` | Angular dev server with API proxy (port 4200) |

### What the app gives you
- **Save LinkedIn Session**: opens Chrome with your `li_at` cookie so the browser profile stays signed in. The window closes on its own once your feed loads.
- **Find Jobs**: runs scrape → audit → email drafting with live progress, then lists every refined job. Click a job to edit its subject and body and send it from your Gmail with the resume attached.
- **Processed**: every email already sent, searchable.
- **Settings**: edit `profile.md`, the signature, the email template (placeholders are enforced) and replace the resume PDF.
- **Free limits**: checks your OpenRouter key's free-model daily requests (limit, used, remaining).

## Run the CLI pipeline
| Command | What it does |
|---|---|
| `npm start` | Runs every stage in order |
| `npm run scrape` | Agent A: search, filter, scroll, save posts |
| `npm run audit` | Removes already processed records; moves records without email to `data/ambiguity/missing.json` |
| `npm run write-emails` | Agent B checks whether each post fits the profile (`isMatch`). For a fit, it adds `subject` and a `body` built from the email template. A misfit is moved to `data/processed/skipped.json` and never sent |
| `npm run send` | Sends the emails, moves each sent record to `data/processed/processed-records.json`, and removes it from `data/jobs.json` |
| `npm run login` | Opens LinkedIn to sign in again, for example after the session expires |

Set `TEST_RECIPIENT` in `.env` to send every email to yourself first. Test sends are not marked as processed.

## Logs
- `logs/agent.log`: everything the pipeline printed
- `logs/tool-calls.jsonl`: each tool call the agents made

## Notes
- Login and scraping share the same browser profile. The login window closes itself before scraping starts.
- If the model provider returns a 429 (rate limit), the pipeline stops at once with a log line and makes no more agent calls. Posts and drafts saved before that are kept, so just run it again later.
- Automating LinkedIn breaks its User Agreement. Keep runs small (30 posts, about once a day).
