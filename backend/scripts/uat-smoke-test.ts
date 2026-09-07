type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

type SmokeResponse = {
  status: number;
  ok: boolean;
  body: unknown;
  text: string;
  url: string;
};

type Session = {
  role: string;
  email: string;
  token: string;
  user: unknown;
};

type TestResult = {
  name: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail?: string;
};

const API_BASE_URL = trimTrailingSlash(
  process.env.UAT_API_BASE_URL ?? process.env.API_BASE_URL ?? "http://localhost:3001/api",
);

const PASSWORD = process.env.UAT_PASSWORD ?? "Admin@123456";
const ENABLE_MUTATING_TESTS = process.env.UAT_SMOKE_MUTATE === "true";
const PAYROLL_RUN_ID_FROM_ENV = process.env.UAT_PAYROLL_RUN_ID;

const ACCOUNTS = {
  admin: {
    email: process.env.UAT_ADMIN_EMAIL ?? "uat.admin@hr.local",
    password: process.env.UAT_ADMIN_PASSWORD ?? PASSWORD,
  },
  hr: {
    email: process.env.UAT_HR_EMAIL ?? "uat.hr@hr.local",
    password: process.env.UAT_HR_PASSWORD ?? PASSWORD,
  },
  payroll: {
    email: process.env.UAT_PAYROLL_EMAIL ?? "uat.payroll@hr.local",
    password: process.env.UAT_PAYROLL_PASSWORD ?? PASSWORD,
  },
  executive: {
    email: process.env.UAT_EXECUTIVE_EMAIL ?? "uat.executive@hr.local",
    password: process.env.UAT_EXECUTIVE_PASSWORD ?? PASSWORD,
  },
  managerA: {
    email: process.env.UAT_MANAGER_A_EMAIL ?? "uat.manager.a@hr.local",
    password: process.env.UAT_MANAGER_A_PASSWORD ?? PASSWORD,
  },
  managerB: {
    email: process.env.UAT_MANAGER_B_EMAIL ?? "uat.manager.b@hr.local",
    password: process.env.UAT_MANAGER_B_PASSWORD ?? PASSWORD,
  },
  employeeA1: {
    email: process.env.UAT_EMPLOYEE_A1_EMAIL ?? "uat.employee.a1@hr.local",
    password: process.env.UAT_EMPLOYEE_A1_PASSWORD ?? PASSWORD,
  },
};

const results: TestResult[] = [];
const sessions: Partial<Record<keyof typeof ACCOUNTS, Session>> = {};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function buildUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}/${path.replace(/^\/+/, "")}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function getPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    const currentRecord = asRecord(current);
    return currentRecord ? currentRecord[key] : undefined;
  }, value);
}

function unwrapData(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) return value;

  const data = record.data;
  return data === undefined ? value : data;
}

function getItems(value: unknown): unknown[] {
  const unwrapped = unwrapData(value);

  if (Array.isArray(unwrapped)) return unwrapped;

  const directItems = getPath(unwrapped, "items");
  if (Array.isArray(directItems)) return directItems;

  const dataItems = getPath(value, "data.items");
  if (Array.isArray(dataItems)) return dataItems;

  const data = getPath(value, "data");
  if (Array.isArray(data)) return data;

  return [];
}

function bodyText(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function requestApi(
  path: string,
  options: {
    method?: HttpMethod;
    token?: string;
    body?: unknown;
    expectedStatuses?: number[];
  } = {},
): Promise<SmokeResponse> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(buildUrl(path), {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  let body: unknown = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    body,
    text,
    url: buildUrl(path),
  };
}

function assertStatus(response: SmokeResponse, expected: number | number[]) {
  const expectedList = Array.isArray(expected) ? expected : [expected];
  if (!expectedList.includes(response.status)) {
    throw new Error(
      `Expected status ${expectedList.join("/")} but got ${response.status} at ${response.url}\n${bodyText(
        response.body,
      ).slice(0, 1200)}`,
    );
  }
}

function assert2xx(response: SmokeResponse) {
  if (!response.ok) {
    throw new Error(
      `Expected 2xx but got ${response.status} at ${response.url}\n${bodyText(response.body).slice(0, 1200)}`,
    );
  }
}

function assertContains(value: unknown, expected: string) {
  const text = bodyText(value);
  if (!text.includes(expected)) {
    throw new Error(`Expected response to include "${expected}"`);
  }
}

function assertNotContains(value: unknown, forbidden: string) {
  const text = bodyText(value);
  if (text.includes(forbidden)) {
    throw new Error(`Expected response to NOT include "${forbidden}"`);
  }
}

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log(`✅ PASS ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "FAIL", detail });
    console.error(`❌ FAIL ${name}`);
    console.error(indent(detail));
  }
}

function skipTest(name: string, detail: string) {
  results.push({ name, status: "SKIP", detail });
  console.log(`⏭️  SKIP ${name} - ${detail}`);
}

function indent(value: string) {
  return value
    .split("\n")
    .map((line) => `   ${line}`)
    .join("\n");
}

async function login(role: keyof typeof ACCOUNTS): Promise<Session> {
  const account = ACCOUNTS[role];
  const response = await requestApi("/auth/login", {
    method: "POST",
    body: {
      email: account.email,
      password: account.password,
    },
  });

  assert2xx(response);

  const loginBody = asRecord(unwrapData(response.body));
  if (!loginBody) {
    throw new Error(`Login response is not an object. Body: ${bodyText(response.body).slice(0, 1200)}`);
  }

  if (loginBody.requiresTwoFactor === true) {
    const twoFactorToken = String(loginBody.twoFactorToken ?? "");
    const code = String(loginBody.debugTwoFactorCode ?? "");

    if (!twoFactorToken || !code) {
      throw new Error(
        `Login for ${account.email} requires 2FA, but response did not include debugTwoFactorCode. For UAT, set TWO_FACTOR_DEV_SHOW_CODE=true or use a non-2FA UAT role.`,
      );
    }

    const verifyResponse = await requestApi("/auth/2fa/verify", {
      method: "POST",
      body: {
        twoFactorToken,
        code,
      },
    });

    assert2xx(verifyResponse);
    return mapSession(role, account.email, verifyResponse.body);
  }

  return mapSession(role, account.email, response.body);
}

function mapSession(role: string, email: string, body: unknown): Session {
  const authBody = unwrapData(body);
  const accessToken = getPath(authBody, "accessToken");

  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error(
      `Login response for ${email} does not include accessToken. Body: ${bodyText(body).slice(0, 1200)}`,
    );
  }

  return {
    role,
    email,
    token: accessToken,
    user: getPath(authBody, "user") ?? null,
  };
}

function requireSession(role: keyof typeof ACCOUNTS): Session {
  const session = sessions[role];
  if (!session) throw new Error(`Missing session for ${role}`);
  return session;
}

async function findPayrollRunId() {
  if (PAYROLL_RUN_ID_FROM_ENV) return PAYROLL_RUN_ID_FROM_ENV;

  const payroll = requireSession("payroll");
  const response = await requestApi("/payroll/runs", { token: payroll.token });
  assert2xx(response);

  const runs = getItems(response.body);
  const preferred = runs.find((run) => bodyText(run).includes("UAT")) ?? runs[0];
  const id = getPath(preferred, "id");

  if (typeof id !== "string" || !id) {
    throw new Error("Cannot resolve payroll run id from /payroll/runs. Set UAT_PAYROLL_RUN_ID manually.");
  }

  return id;
}

async function main() {
  console.log("HR WFM UAT API Smoke Test");
  console.log(`API_BASE_URL=${API_BASE_URL}`);
  console.log(`UAT_SMOKE_MUTATE=${ENABLE_MUTATING_TESTS ? "true" : "false"}`);
  console.log("");

  await runTest("auth login all UAT roles", async () => {
    for (const role of Object.keys(ACCOUNTS) as Array<keyof typeof ACCOUNTS>) {
      sessions[role] = await login(role);
    }
  });

  await runTest("auth me returns current user", async () => {
    const employee = requireSession("employeeA1");
    const response = await requestApi("/auth/me", { token: employee.token });
    assert2xx(response);
    assertContains(response.body, employee.email);
  });

  await runTest("admin system settings read", async () => {
    const admin = requireSession("admin");
    const response = await requestApi("/settings/system", { token: admin.token });
    assert2xx(response);
  });

  await runTest("employee cannot access system settings", async () => {
    const employee = requireSession("employeeA1");
    const response = await requestApi("/settings/system", { token: employee.token });
    assertStatus(response, 403);
  });

  await runTest("employee cannot access payroll runs", async () => {
    const employee = requireSession("employeeA1");
    const response = await requestApi("/payroll/runs", { token: employee.token });
    assertStatus(response, 403);
  });

  await runTest("HR dashboard summary", async () => {
    const hr = requireSession("hr");
    const response = await requestApi("/hr/dashboard-summary", { token: hr.token });
    assert2xx(response);
  });

  await runTest("payroll dashboard summary", async () => {
    const payroll = requireSession("payroll");
    const response = await requestApi("/payroll/dashboard-summary", { token: payroll.token });
    assert2xx(response);
  });

  await runTest("executive dashboard summary", async () => {
    const executive = requireSession("executive");
    const response = await requestApi("/executive/dashboard-summary", { token: executive.token });
    assert2xx(response);
  });

  await runTest("manager A scope does not leak manager B employee", async () => {
    const managerA = requireSession("managerA");
    const response = await requestApi("/manager/team", { token: managerA.token });
    assert2xx(response);
    assertContains(response.body, "UAT Employee A1");
    assertNotContains(response.body, "UAT Employee B1");
  });

  await runTest("manager B scope does not leak manager A employees", async () => {
    const managerB = requireSession("managerB");
    const response = await requestApi("/manager/team", { token: managerB.token });
    assert2xx(response);
    assertContains(response.body, "UAT Employee B1");
    assertNotContains(response.body, "UAT Employee A1");
    assertNotContains(response.body, "UAT Employee A2");
  });

  await runTest("employee ESS dashboard own scope", async () => {
    const employee = requireSession("employeeA1");
    const response = await requestApi("/ess/dashboard", { token: employee.token });
    assert2xx(response);
    assertContains(response.body, "UAT Employee A1");
    assertNotContains(response.body, "UAT Employee B1");
  });

  await runTest("attendance policy effective read", async () => {
    const hr = requireSession("hr");
    const response = await requestApi("/attendance/policies/effective?companyId=uat_company_tjc", { token: hr.token });
    assert2xx(response);
  });

  if (ENABLE_MUTATING_TESTS) {
    await runTest("attendance recalculate UAT range", async () => {
      const hr = requireSession("hr");
      const response = await requestApi("/attendance/daily-summaries/recalculate", {
        method: "POST",
        token: hr.token,
        body: {
          startDate: "2026-06-01",
          endDate: "2026-06-07",
        },
      });
      assert2xx(response);
    });
  } else {
    skipTest("attendance recalculate UAT range", "Set UAT_SMOKE_MUTATE=true to run mutating recalculate test.");
  }

  await runTest("payroll run read", async () => {
    const payroll = requireSession("payroll");
    const runId = await findPayrollRunId();
    const response = await requestApi(`/payroll/runs/${runId}`, { token: payroll.token });
    assert2xx(response);
  });

  await runTest("payroll attendance deductions read", async () => {
    const payroll = requireSession("payroll");
    const runId = await findPayrollRunId();
    const response = await requestApi(`/payroll/runs/${runId}/attendance-deductions`, {
      token: payroll.token,
    });
    assert2xx(response);
    assertContains(response.body, "UAT Employee A1");
  });

  await runTest("payroll validation read", async () => {
    const payroll = requireSession("payroll");
    const runId = await findPayrollRunId();
    const response = await requestApi(`/payroll/runs/${runId}/validation`, {
      token: payroll.token,
    });
    assert2xx(response);
  });

  await runTest("payroll payslip publication status read", async () => {
    const payroll = requireSession("payroll");
    const runId = await findPayrollRunId();
    const response = await requestApi(`/payroll/runs/${runId}/payslip-publication-status`, {
      token: payroll.token,
    });
    assert2xx(response);
  });

  await runTest("audit critical actions read", async () => {
    const admin = requireSession("admin");
    const response = await requestApi("/audit/critical-actions", { token: admin.token });
    assert2xx(response);
  });

  await runTest("monitoring overview read", async () => {
    const admin = requireSession("admin");
    const response = await requestApi("/monitoring/overview", { token: admin.token });
    assert2xx(response);
  });

  const passed = results.filter((result) => result.status === "PASS").length;
  const failed = results.filter((result) => result.status === "FAIL").length;
  const skipped = results.filter((result) => result.status === "SKIP").length;

  console.log("\nSummary");
  console.log(`PASS=${passed} FAIL=${failed} SKIP=${skipped}`);

  if (failed > 0) {
    console.log("\nFailures");
    for (const result of results.filter((item) => item.status === "FAIL")) {
      console.log(`- ${result.name}: ${result.detail}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("\nAll required UAT smoke checks passed.");
}

main().catch((error) => {
  console.error("Fatal smoke test error");
  console.error(error);
  process.exitCode = 1;
});
