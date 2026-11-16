// ci/fetch-secret.mjs — pulls a secret from the 1Claw vault at CI runtime and
// exposes it to later steps as a MASKED env var ($DEPLOY_KEY).
//
// This is the CI equivalent of agent.js: authenticate with the scoped agent key
// (the only thing in GitHub Secrets), fetch the deploy credential by path, mask
// it in the logs, and hand it to the job env. The value is never written to the
// repo and never printed.

import { createClient } from "@1claw/sdk";
import { appendFileSync } from "node:fs";

const {
  ONECLAW_AGENT_API_KEY,
  ONECLAW_API_URL = "https://api.1claw.co",
  ONECLAW_VAULT_ID,
  DEMO_SECRET_PATH = "examples/hello",
  GITHUB_ENV,
} = process.env;

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

if (!ONECLAW_AGENT_API_KEY) {
  fail("ONECLAW_AGENT_API_KEY is not set. Add it in Settings → Secrets → Actions.");
}

const client = createClient({
  baseUrl: ONECLAW_API_URL,
  apiKey: ONECLAW_AGENT_API_KEY,
});

// Resolve the vault (explicit id preferred; otherwise the agent's first vault).
let vaultId = ONECLAW_VAULT_ID;
if (!vaultId) {
  const { data, error } = await client.vault.list();
  if (error) fail(`vault list failed: ${error.message ?? error}`);
  vaultId = (data?.vaults?.[0] ?? data?.[0])?.id;
  if (!vaultId) fail("No vault available for this agent.");
}

// Fetch the secret value at runtime.
const { data, error } = await client.secrets.get(vaultId, DEMO_SECRET_PATH);
if (error) fail(`could not read "${DEMO_SECRET_PATH}": ${error.message ?? error}`);
const value = String(data.value);

// Mask every line of the value in the logs BEFORE it can appear anywhere.
for (const line of value.split(/\r?\n/)) {
  if (line.trim()) console.log(`::add-mask::${line}`);
}

// Export to the job environment for later steps (multiline-safe heredoc form).
const delim = "ONECLAW_EOF_" + Math.random().toString(36).slice(2);
appendFileSync(GITHUB_ENV, `DEPLOY_KEY<<${delim}\n${value}\n${delim}\n`);

console.log(
  `✓ Fetched "${DEMO_SECRET_PATH}" from 1Claw vault ${vaultId} — exported as DEPLOY_KEY (masked).`,
);
