# jobpilot-agent

Finds LinkedIn hiring posts, writes a personal email for each, and sends it with your resume.

One agent scrapes the relevant job post by the provided query using playwright mcp in a structured format including recruiter email, company name, post link etc.
Other agent drafts the email subject and body.

```
Agent A: scraper (Playwright MCP)  ->  audit (code)  ->  Agent B: email writer  ->  sender (Nodemailer)
```

Every stage reads and updates `data/raw/linkedin-<YYYY-MM-DD>.json`. 
All agent calls use a free OpenRouter model by default, but you can update it in .env. See .env.example for reference

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and fill it in. Gmail needs 2-Step Verification and an [App Password](https://myaccount.google.com/apppasswords).
3. Add your resume as `data/resume/resume.pdf`.
4. Update your profile and signature in `data/profile/profile.md` and `data/profile/signature.txt`.
5. Customize your email template in `data/profile/email-template.txt` to suit you. DONT CHANGE THE PLACEHOLDERS, The template's `{{positionName}}`, `{{companyName}}` and `{{recruiterName}}` are filled in for each post. When one is unknown it becomes "open HR", "your organization" or "Hiring Manager".
6. Put your LinkedIn `li_at` cookie in `.env` as `LINKEDIN_LI_AT`. The first `npm start` or `npm run scrape` opens Chrome so you can sign in if asked. The window closes on its own once your feed loads, and the session is saved to `data/browser-profile`.
6. Set `SEARCH_QUERY` in `.env` to change the LinkedIn search (see `.env.example`). Without it, the default HR query is used.

## Run
| Command | What it does |
|---|---|
| `npm start` | Runs every stage in order |
| `npm run scrape` | Agent A: search, filter, scroll, save posts |
| `npm run audit` | Removes already processed records; moves records without email to `data/ambiguity/missing.json` |
| `npm run write-emails` | Agent B checks whether each post fits the profile (`isMatch`). For a fit, it adds `subject` and a `body` built from the email template. A misfit is moved to `data/processed/skipped.json` and never sent |
| `npm run send` | Sends the emails, moves each sent record to `data/processed/processed-records.json`, and removes it from the raw file |
| `npm run login` | Opens LinkedIn to sign in again, for example after the session expires |

Set `TEST_RECIPIENT` in `.env` to send every email to yourself first. Test sends are not marked as processed.

## Logs
- `logs/agent.log`: everything the pipeline printed
- `logs/tool-calls.jsonl`: each tool call the agents made

## Notes
- Login and scraping share the same browser profile. The login window closes itself before scraping starts.
- If the model provider returns a 429 (rate limit), the pipeline stops at once with a log line and makes no more agent calls. Posts and drafts saved before that are kept, so just run it again later.
- Automating LinkedIn breaks its User Agreement. Keep runs small (30 posts, about once a day).
