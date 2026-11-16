# CI with no secrets in the repo

A GitHub Actions pipeline that holds **no deploy secrets**. The deploy credential lives in a [1Claw](https://1claw.co) HSM-backed vault and is pulled **at runtime** by the official 1Claw GitHub Action. The repo is public and contains zero secrets.

Built for the **1Claw Creator Contest**. Runs on the 1Claw **free tier**.

## The idea

Teams scatter secrets across GitHub Secrets, `.env` files, and CI configs. Here, every real credential lives in the vault. CI authenticates with a single **low-privilege bootstrap key** whose only power is to read the specific vault secrets this workflow is allowed to fetch — nothing else.

```
  GitHub Actions runner                         1Claw vault (HSM-backed)
  ┌───────────────────────┐                     ┌────────────────────────┐
  │ secrets.ONECLAW_AGENT  │ ── api key ───────▶ │  examples/hello         │
  │   _API_KEY (bootstrap) │   (exchanged for a  │  (deploy credential)    │
  │                        │    900s JWT)        │                         │
  │ 1clawAI/1claw-action   │ ◀── DEPLOY_KEY ──── │  value never leaves     │
  │   → $DEPLOY_KEY (masked)│                     │  until requested        │
  │ ./deploy.sh  ──────────┼──► uses it, logs 🔒  └────────────────────────┘
  └───────────────────────┘
```

## Where 1Claw comes in

- **The deploy key is NOT in the repo and NOT in GitHub Secrets** — it's stored in the vault, encrypted with HSM-held keys, addressed by path (`examples/hello`).
- The workflow's [`1clawAI/1claw-action@v1`](https://github.com/1clawAI/1claw-action) step exchanges the bootstrap agent key for a short-lived JWT and fetches the deploy key **only during the run**.
- The value is **masked** in logs (`::add-mask::`) and injected as `$DEPLOY_KEY` for `deploy.sh`. It is never written to disk or committed.
- The action is **deny-by-default**: it fetches only the paths listed in the workflow and fails closed on any policy denial.

## What's in GitHub Secrets

Exactly **one** entry, by design:

| Name | What it is | What it can do |
|---|---|---|
| `ONECLAW_AGENT_API_KEY` | A 1Claw **agent** key (`ocv_…`) | Only read the vault secrets this agent is scoped to. It is not a deploy key, a cloud credential, or an admin token. |

Every *real* secret — the deploy credential — lives in the vault, never here.

> **Note on OIDC:** The contest's ideal is *zero* GitHub Secrets via OIDC. 1Claw's current GitHub Action authenticates with the agent key, and GitHub-OIDC-to-1Claw trust isn't documented yet, so one bootstrap key remains. This is the minimal, honest footprint achievable today.

## Proof: no secrets in the codebase

```bash
git ls-files                 # no .env, no key files
grep -Rn "ocv_\|Bearer [A-Za-z0-9]\{20\}" . --exclude-dir=node_modules   # nothing
```

The workflow references only `${{ secrets.ONECLAW_AGENT_API_KEY }}` — a pointer, not a value.

## Set it up

1. **Store the deploy credential in your vault** (if not already there — `npx @1claw/cli setup` creates a sample `examples/hello`, which this repo uses):
   ```bash
   npx @1claw/cli secret rotate ci/deploy-key --generate   # optional: your own
   ```
2. **Add the bootstrap key to GitHub Secrets:** repo → *Settings → Secrets and variables → Actions → New repository secret*
   - Name: `ONECLAW_AGENT_API_KEY`
   - Value: your `ocv_…` agent key
3. **Point the workflow at your secret** — edit the mapping in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):
   ```yaml
   secrets: |
     DEPLOY_KEY=<your-vault-id-or-name>/<secret-path>
   ```
4. **Push to `main`** (or run it from the *Actions* tab). Watch the run pull the secret and deploy — with `DEPLOY_KEY` masked in every log line.

## Bonus: the same vault, used from a local agent

[`agent.js`](agent.js) is a small Node agent that reads the same vault secret at runtime via `@1claw/sdk`, signs a request with it (HMAC — the secret never leaves the process), and does a mock deploy. Run it locally:

```bash
npm install
cp .env.example .env     # paste your ocv_ key into ONECLAW_AGENT_API_KEY
npm start
```

## Free-tier footprint

1 vault, 1 secret, 1 agent — well within the free tier.

## License

MIT
