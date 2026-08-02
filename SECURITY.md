# Security

## What this project holds

A Perplexity API key in `.env`, and a SQLite file, `promptiplex.db`, containing
every question asked, every answer returned, and what each one cost. Both are
gitignored. Neither is encrypted.

## Threat model

Promptiplex is a single-user tool meant to run on the machine of the person
whose key it spends. It has no authentication, no authorisation, and no rate
limiting, and it is not trying to acquire any: anything able to reach the
server can issue billable searches and read the whole query history.

That makes the network boundary the only control. `npm run dev` and `npm start`
bind `127.0.0.1` for that reason. Deploying this to a public URL as it stands
is a known-unsafe configuration rather than a vulnerability in it — put real
authentication in front of it first.

Out of scope, for the same reason:

- No auth on the API routes.
- The query history being readable by anyone with access to the machine.
- `PROMPTIPLEX_PROVIDER_MODULE` executing arbitrary code. It is a local
  configuration setting; anyone who can set it can already run code.

## In scope

- The API key appearing anywhere other than `.env` — logs, error messages,
  responses, the database, or a committed file.
- Anything that makes the server reachable beyond loopback by default.
- A search response causing code execution or script injection in the UI.
- A path where the app issues more billable requests than the user asked for.

## Reporting

Report privately through GitHub's [security
advisories](https://github.com/Sinetheta/promptiplex/security/advisories/new)
rather than in a public issue. A response may take a while — this is a personal
project maintained in spare time, with no SLA.

**Do not include a real API key in a report.** If you believe one has leaked,
revoke it first at
<https://www.perplexity.ai/account/api/group>, then report.

Vulnerabilities in Perplexity's own service belong with Perplexity, not here.
