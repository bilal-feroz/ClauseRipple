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
  await expect(page.getByText("Baseline · DPA v1")).toBeVisible();
  await expect(page.getByText("FalkorDB connected", { exact: false })).toBeVisible();
  const verdicts = page.getByRole("list", { name: "Customer verdicts" });
  await expect(verdicts.getByRole("button")).toHaveCount(4);
  await expect(verdicts.getByText("No impact")).toHaveCount(4);
  await page.waitForTimeout(2500);
  await shot(page, "01-baseline");

  // Falcon Bank is compliant at baseline.
  await verdicts.getByRole("button", { name: /Falcon Bank/ }).click();
  await expect(page.getByText("Why is Falcon Bank not impacted?")).toBeVisible();
  await shot(page, "02-baseline-falcon-why");

  // Apply the change: the agent runs over MCP against FalkorDB.
  await page.getByRole("button", { name: "Apply ModelCloud DPA v2" }).click();
  await expect(page.getByText("Detected change", { exact: false })).toBeVisible();
  await page.waitForTimeout(2200);
  await shot(page, "03-ripple-in-progress");
  await expect(page.getByText(/Run AR-\d+ · completed/)).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  await shot(page, "04-run-completed");

  // Distinction: Falcon + Acme impacted, Nova allowed, GulfGov no dependency.
  await expect(verdicts.getByRole("button", { name: /Falcon Bank/ })).toContainText("CRITICAL");
  await expect(verdicts.getByRole("button", { name: /Acme Insurance/ })).toContainText("CRITICAL");
  await expect(verdicts.getByRole("button", { name: /Nova Retail/ })).toContainText("No impact");
  await expect(verdicts.getByRole("button", { name: /GulfGov/ })).toContainText("No dependency");

  // Agent trace shows real tool calls.
  for (const tool of ["inspect_change()", "trace_vendor_dependents()", "evaluate_residency()", "recall_related_decisions()", "find_owner()", "create_impact_case()", "assign_impact_case()"]) {
    await expect(page.getByText(tool).first()).toBeVisible();
  }

  // Case CR-104 for Falcon Bank, assigned to Sarah Malik, with CR-087 memory.
  await page.getByRole("tab", { name: /Impact cases/ }).click();
  await expect(page.getByRole("article", { name: "Impact case CR-104" })).toBeVisible();
  const caseView = page.getByRole("article", { name: "Impact case CR-104" });
  await expect(caseView).toContainText("Falcon Bank");
  await expect(caseView).toContainText("Sarah Malik");
  await expect(caseView).toContainText("CR-087");
  await shot(page, "05-case-cr104");

  // Why? evidence for Falcon Bank.
  await verdicts.getByRole("button", { name: /Falcon Bank/ }).click();
  await expect(page.getByText("Why is Falcon Bank impacted?")).toBeVisible();
  await expect(page.getByText("The Document Processing API routes model inference requests through ModelCloud.").first()).toBeVisible();
  await shot(page, "06-falcon-why");

  // 2D evidence graph.
  await page.getByRole("tab", { name: "Evidence graph" }).click();
  await expect(page.getByText("US not allowed", { exact: false })).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, "07-evidence-graph");
  await page.getByRole("tab", { name: "RippleSpace" }).click();

  // Memory survives a reload (read back from FalkorDB).
  await page.reload();
  await expect(page.getByText("Updated · DPA v2")).toBeVisible();
  await page.getByRole("tab", { name: "Company memory" }).click();
  await expect(page.getByText("CR-087").first()).toBeVisible();
  await page.waitForTimeout(2500);
  await shot(page, "08-after-reload-memory");

  // Ask ClauseRipple: answered from FalkorDB with sources.
  await page.getByRole("searchbox", { name: /Ask ClauseRipple/ }).or(page.getByLabel(/Ask ClauseRipple/)).first().fill("Who should handle CR-104?");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Answer from the company graph" });
  await expect(dialog).toContainText("Sarah Malik");
  await expect(dialog).toContainText("case_detail");
  await shot(page, "09-ask");

  const relevant = consoleErrors.filter((e) => !e.includes("Download the React DevTools"));
  console.log(`console errors: ${relevant.length}`);
  for (const e of relevant.slice(0, 5)) console.log("  ", e.slice(0, 200));
});
