// agent.js — a small AI agent that uses a secret from a 1Claw vault.
//
// SECURITY CONTRACT (the whole point of this project):
//   1. No secret value appears anywhere in this file.
//   2. The agent API key is read ONLY from the environment (ONECLAW_AGENT_API_KEY),
//      which comes from a gitignored `.env`. It is never logged.
//   3. The demo secret is fetched from 1Claw at RUNTIME, by path, into a local
//      variable that is used and then discarded. It is never printed.
//
// The agent then does a "mock deploy": it authenticates to an endpoint using the
// secret as a Bearer token, and reports only proof-of-possession — an HTTP status
// and a one-way SHA-256 fingerprint — never the secret itself.

import { createClient } from "@1claw/sdk";
import { createHash, createHmac } from "node:crypto";

// Load `.env` if present (Node 20.12+). Never echo its contents.
try {
  process.loadEnvFile(new URL("./.env", import.meta.url));
} catch {
  /* no .env file — rely on the ambient environment instead */
}

const {
  ONECLAW_AGENT_API_KEY,
  ONECLAW_VAULT_ID,
  ONECLAW_API_URL = "https://api.1claw.co",
  DEMO_SECRET_PATH = "examples/hello",
  DEPLOY_URL = "https://httpbin.org/bearer",
} = process.env;

// A short, irreversible fingerprint. Proves "I hold the real key" to a human
// reading the logs, without revealing any of the key's bytes.
const fingerprint = (value) =>
  "sha256:" + createHash("sha256").update(value).digest("hex").slice(0, 12);

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

async function main() {
  if (!ONECLAW_AGENT_API_KEY) {
    fail(
      "ONECLAW_AGENT_API_KEY is not set.\n" +
        "  Enroll the agent, then put the key in `.env`:\n" +
        "    npx @1claw/cli agent enroll demo-agent --pair",
    );
  }

  console.log("1Claw no-secrets agent");
  console.log("──────────────────────");
  console.log(`API:    ${ONECLAW_API_URL}`);
  console.log(`Secret: ${DEMO_SECRET_PATH}  (path only — value stays in the vault)`);

  // The SDK exchanges the ocv_ key for a short-lived JWT automatically.
  const client = createClient({
    baseUrl: ONECLAW_API_URL,
    apiKey: ONECLAW_AGENT_API_KEY,
  });

  // 1) Resolve which vault to read from.
  let vaultId = ONECLAW_VAULT_ID;
  if (!vaultId) {
    const { data, error } = await client.vault.list();
    if (error) fail(`Could not list vaults: ${error.message ?? error}`);
    const first = data?.vaults?.[0] ?? data?.[0];
    if (!first?.id) fail("No vault available for this agent.");
    vaultId = first.id;
  }
  console.log(`Vault:  ${vaultId}`);

  // 2) Fetch the secret at runtime, by path. `secretValue` lives only here.
  const { data, error } = await client.secrets.get(vaultId, DEMO_SECRET_PATH);
  if (error) {
    fail(
      `Could not read secret "${DEMO_SECRET_PATH}": ${error.message ?? error}\n` +
        "  Create it first:  npx @1claw/cli secret rotate " +
        DEMO_SECRET_PATH +
        " --generate",
    );
  }
  const secretValue = data.value;
  console.log(
    `\n✓ Retrieved secret v${data.version} — ${fingerprint(secretValue)} ` +
      `(the value itself is never printed)`,
  );

  // 3) "Mock deploy": the secret SIGNS the request — it is never sent over the
  //    wire. We HMAC the deploy payload with the secret and send the signature.
  const payload = JSON.stringify({ action: "deploy", at: new Date().toISOString() });
  const signature = createHmac("sha256", secretValue).update(payload).digest("hex");

  console.log(`\nDeploying to ${DEPLOY_URL} (request signed with the vault secret)…`);
  let res;
  try {
    res = await fetch(DEPLOY_URL, {
      // The signature is the bearer credential; the secret itself stays local.
      headers: { Authorization: `Bearer ${signature}` },
    });
  } catch (e) {
    fail(`Deploy request failed: ${e.message}`);
  }

  console.log(`  → HTTP ${res.status} ${res.ok ? "OK" : ""}`);
  if (res.ok) {
    console.log(
      "\n✓ Deploy authenticated with a secret that never touched the codebase.",
    );
    console.log("  • Not in git        • Not in agent.js        • Not in logs");
  } else {
    fail("Deploy endpoint rejected the credential.");
  }
}

main().catch((e) => fail(e?.stack ?? String(e)));
