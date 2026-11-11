import assert from "node:assert/strict";
import test from "node:test";
import { READ_ONLY_TOOL_NAMES, roleTools } from "./roles.js";

function names(tools: ReturnType<typeof roleTools>): string[] {
  return tools.map((tool) => String(tool.name)).sort();
}

test("analyst only receives read-only tools, never mutations", () => {
  const tools = names(
    roleTools("analista", "Abra um incidente crítico e resolva o primeiro"),
  );
  assert.ok(!tools.includes("open_incidente"));
  assert.ok(!tools.includes("resolve_incidente"));
  assert.deepEqual(tools, [...READ_ONLY_TOOL_NAMES].sort());
});

test("planner receives no tools at all", () => {
  assert.deepEqual(
    roleTools("planejador", "Abra um incidente para checkout"),
    [],
  );
});

test("executor does not receive mutation tools without authorization", () => {
  const tools = names(
    roleTools("executor", "Analise os incidentes e crie um plano de correção"),
  );
  assert.ok(!tools.includes("open_incidente"));
  assert.ok(!tools.includes("resolve_incidente"));
  assert.ok(tools.includes("list_alerts"));
});

test("executor receives mutation tools only when the request authorizes them", () => {
  const tools = names(
    roleTools("executor", "Abra um incidente para checkout"),
  );
  assert.ok(tools.includes("open_incidente"));
  assert.ok(!tools.includes("resolve_incidente"));
});

test("executor can resolve only when the request authorizes resolution", () => {
  const tools = names(
    roleTools("executor", "Resolva o incidente 42"),
  );
  assert.ok(tools.includes("resolve_incidente"));
});
