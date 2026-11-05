import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./conversa-longa.sh", import.meta.url));
const bashPath = process.env.BASH ?? "bash";

function bashQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function runScript(mode: "actual" | "unavailable" | "failure") {
  const directory = mkdtempSync(join(tmpdir(), "opspilot-conversa-longa-"));
  const counterFile = join(directory, "counter");
  const mocksPath = join(directory, "mocks.sh");
  try {
    writeFileSync(
      mocksPath,
      `jq() {
if [[ "$1" == "-n" ]]; then
  printf '{}'
  return 0
fi
export MOCK_FILTER="$2"
node -e '
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  const data = JSON.parse(input);
  const filter = process.env.MOCK_FILTER;
  const value = filter.includes("conversationId") ? data.conversationId
    : filter.includes("answer") ? data.answer
    : filter.includes("error") ? data.error
    : filter.includes("promptTokens") ? (data.metrics.promptTokens ?? "n/a")
    : 0;
  process.stdout.write(value === undefined || value === null ? "" : String(value));
});
'
}

curl() {
count=0
if [[ -f "$MOCK_COUNTER_FILE" ]]; then
  count=$(<"$MOCK_COUNTER_FILE")
fi
count=$((count + 1))
printf '%s' "$count" > "$MOCK_COUNTER_FILE"
if [[ "$MOCK_MODE" == "failure" ]]; then
  printf '{"error":"fixture failure"}'
  return 0
fi
if [[ "$MOCK_MODE" == "unavailable" && "$count" -eq 1 ]]; then
  printf '{"conversationId":"fixture-conversation","answer":"ok","metrics":{"historyMessages":0}}'
  return 0
fi
printf '{"conversationId":"fixture-conversation","answer":"ok","metrics":{"promptTokens":%s,"historyMessages":0}}' "$((count * 10))"
}
`,
    );

    const command =
      `MOCK_MODE=${bashQuote(mode)} ` +
      `MOCK_COUNTER_FILE=${bashQuote(counterFile)} ` +
      `BASH_ENV=${bashQuote(mocksPath)} ` +
      `bash ${bashQuote(scriptPath)}`;
    return spawnSync(bashPath, ["-c", command], {
      encoding: "utf8",
      env: {
        ...process.env,
        BASE_URL: "http://fixture.invalid",
      },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("prints only the actual prompt metric as the per-turn prompt count", () => {
  const script = readFileSync(scriptPath, "utf8");
  assert.ok(script.includes('.metrics.promptTokens // "n/a"'));
  assert.ok(script.includes("promptTokens=%s"));
});

test("prints actual prompt tokens for each successful turn", {
  skip: process.platform === "win32",
}, () => {
  const result = runScript("actual");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /turno 01 \| .*promptTokens=10 \|/);
  assert.match(result.stdout, /turno 30 \| .*promptTokens=300 \|/);
});

test("prints an unavailable marker rather than estimating prompt tokens", {
  skip: process.platform === "win32",
}, () => {
  const result = runScript("unavailable");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /turno 01 \| .*promptTokens=n\/a \|/);
  assert.match(result.stdout, /turno 02 \| .*promptTokens=20 \|/);
});

test("stops and reports failed chat responses", {
  skip: process.platform === "win32",
}, () => {
  const result = runScript("failure");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Turno 1 FALHOU: .*fixture failure/);
  assert.doesNotMatch(result.stdout, /turno 01 \|/);
});
