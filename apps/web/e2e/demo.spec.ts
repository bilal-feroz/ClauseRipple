import { expect, test, type Page } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://localhost:8000";
const SHOTS = "test-results/screens";

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

test("ModelCloud DPA change → agent → impact cases → evidence", async ({ page, request }) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  // Reset the demo graph through the real API.
  const reset = await request.post(`${API}/api/demo/reset`);
  expect(reset.ok()).toBeTruthy();
  expect((await reset.json()).validation.ok).toBe(true);

  await page.goto("/");
  await expect(page.getByText("Today · v1")).toBeVisible();
  await expect(page.getByText("Live on FalkorDB", { exact: false })).toBeVisible();
  const verdicts = page.getByRole("list", { name: "Customer verdicts" });
  await expect(verdicts.getByRole("button")).toHaveCount(4);
  await page.waitForTimeout(2000);
  await shot(page, "01-baseline");

  // Falcon Bank is compliant at baseline.
  await verdicts.getByRole("button", { name: /Falcon Bank/ }).click();
  await expect(page.getByText("Why Falcon Bank is not affected")).toBeVisible();
  await shot(page, "02-baseline-falcon-why");

  // Apply the change: the agent runs over MCP against FalkorDB.
  await page.getByRole("button", { name: "Apply the new contract" }).click();
  await expect(page.getByRole("heading", { name: "What changed" })).toBeVisible();
  await page.waitForTimeout(2500);
  await shot(page, "03-in-progress");
  await expect(page.getByText(/Agent finished in \d+ steps/)).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  await shot(page, "04-run-completed");

  // Distinction: Falcon + Acme impacted, Nova allowed, GulfGov not connected.
  await expect(verdicts.getByRole("button", { name: /Falcon Bank/ })).toContainText(/critical/i);
  await expect(verdicts.getByRole("button", { name: /Acme Insurance/ })).toContainText(/critical/i);
  await expect(verdicts.getByRole("button", { name: /Nova Retail/ })).toContainText(/no impact/i);
  await expect(verdicts.getByRole("button", { name: /GulfGov/ })).toContainText(/not affected/i);

  // Agent steps show real tool calls.
  await page.getByRole("tab", { name: "Agent steps" }).click();
  for (const tool of ["inspect_change()", "trace_vendor_dependents()", "evaluate_residency()", "recall_related_decisions()", "find_owner()", "create_impact_case()", "assign_impact_case()"]) {
    await expect(page.getByText(tool).first()).toBeVisible();
  }

  // Case CR-104 for Falcon Bank, assigned to Sarah Malik, with CR-087 memory.
  await page.getByRole("tab", { name: /Cases & next steps/ }).click();
  const caseView = page.getByRole("article", { name: "Impact case CR-104" });
  await expect(caseView).toBeVisible();
  await expect(caseView).toContainText("Falcon Bank");
  await expect(caseView).toContainText("Sarah Malik");
  await expect(caseView).toContainText("CR-087");
  await shot(page, "05-case-cr104");

  // Why? steps for Falcon Bank, each backed by a source quote.
  await verdicts.getByRole("button", { name: /Falcon Bank/ }).click();
  await expect(page.getByText("Why Falcon Bank is impacted")).toBeVisible();
  await page.getByRole("button", { name: /sends customer data to/ }).click();
  await expect(page.getByText("The Document Processing API routes model inference requests through ModelCloud.").first()).toBeVisible();
  await shot(page, "06-falcon-why");

  // 2D evidence graph.
  await page.getByRole("tab", { name: "Evidence graph" }).click();
  await expect(page.getByText("✕ US not allowed")).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, "07-evidence-graph");
  await page.getByRole("tab", { name: "Map" }).click();

  // Memory survives a reload (read back from FalkorDB).
  await page.reload();
  await expect(page.getByText("Contract updated · v2")).toBeVisible();
  await page.getByRole("tab", { name: "Company memory" }).click();
  await expect(page.getByText("CR-087").first()).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, "08-after-reload-memory");

  // Ask ClauseRipple: answered from FalkorDB with sources.
  await page.getByLabel(/Ask ClauseRipple/).first().fill("Who should handle CR-104?");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Answer from the company graph" });
  await expect(dialog).toContainText("Sarah Malik");
  await expect(dialog).toContainText("case_detail");
  await shot(page, "09-ask");

  const relevant = consoleErrors.filter((e) => !e.includes("Download the React DevTools"));
  console.log(`console errors: ${relevant.length}`);
  for (const e of relevant.slice(0, 5)) console.log("  ", e.slice(0, 200));
});
