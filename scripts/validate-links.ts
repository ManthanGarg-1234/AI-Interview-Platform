import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sheetSchema } from "../prisma/sheet-schema";

type LinkStatus = "OK" | "UNVERIFIED" | "BROKEN";
type ProblemLink = {
  sheet: string;
  topic: string;
  title: string;
  url: string;
};
type LinkResult = ProblemLink & {
  status: LinkStatus;
  reason?: string;
};

const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 (CareerPrepAI link validator)";
const timeoutMs = 10_000;
const concurrency = 5;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isSuccessStatus(status: number): boolean {
  return status >= 200 && status <= 399;
}

function errorDescription(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause as { code?: string; message?: string } | undefined;
  const code = cause?.code;
  if (error.name === "TimeoutError" || error.name === "AbortError" || code === "ETIMEDOUT") {
    return "timeout";
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ENODATA") {
    return `DNS error${code ? ` (${code})` : ""}`;
  }
  return code ? `${error.message} (${code})` : error.message;
}

async function request(url: string, method: "HEAD" | "GET"): Promise<{ status?: number; error?: unknown }> {
  try {
    const response = await fetch(url, {
      method,
      headers: {
        "User-Agent": userAgent,
        ...(method === "GET" ? { Range: "bytes=0-0" } : {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const status = response.status;
    await response.body?.cancel();
    return { status };
  } catch (error) {
    return { error };
  }
}

async function checkLink(problem: ProblemLink): Promise<LinkResult> {
  const head = await request(problem.url, "HEAD");
  if (head.status !== undefined && isSuccessStatus(head.status)) {
    return { ...problem, status: "OK" };
  }

  const get = await request(problem.url, "GET");
  if (get.status !== undefined && isSuccessStatus(get.status)) {
    return { ...problem, status: "OK" };
  }

  const blockedStatus = [head.status, get.status].find((status) => status === 403 || status === 429);
  if (blockedStatus) {
    return { ...problem, status: "UNVERIFIED", reason: `HTTP ${blockedStatus}` };
  }

  const failedStatus = get.status ?? head.status;
  if (failedStatus !== undefined) {
    return { ...problem, status: "BROKEN", reason: `HTTP ${failedStatus}` };
  }

  const error = get.error ?? head.error;
  return {
    ...problem,
    status: "BROKEN",
    reason: error === undefined ? "Request failed" : errorDescription(error),
  };
}

async function main(): Promise<void> {
  const sheetDirectory = path.resolve(__dirname, "..", "prisma", "data", "sheets");
  const reportDirectory = __dirname;
  const files = (await readdir(sheetDirectory)).filter((file) => file.endsWith(".json")).sort();
  const links: ProblemLink[] = [];
  const duplicates: Array<ProblemLink & { firstTopic: string }> = [];

  for (const file of files) {
    const input: unknown = JSON.parse(await readFile(path.join(sheetDirectory, file), "utf8"));
    const sheet = sheetSchema.parse(input);
    const seenUrls = new Map<string, string>();

    for (const topic of sheet.topics) {
      for (const problem of topic.problems) {
        const link = { sheet: sheet.name, topic: topic.name, title: problem.title, url: problem.url };
        const firstTopic = seenUrls.get(problem.url);
        if (firstTopic !== undefined) {
          duplicates.push({ ...link, firstTopic });
        } else {
          seenUrls.set(problem.url, topic.name);
        }
        links.push(link);
      }
    }
  }

  const results: LinkResult[] = [];
  for (let offset = 0; offset < links.length; offset += concurrency) {
    const batch = links.slice(offset, offset + concurrency);
    results.push(...(await Promise.all(batch.map(checkLink))));
    if (offset + concurrency < links.length) await delay(300);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      links: results.length,
      OK: results.filter((result) => result.status === "OK").length,
      UNVERIFIED: results.filter((result) => result.status === "UNVERIFIED").length,
      BROKEN: results.filter((result) => result.status === "BROKEN").length,
      duplicates: duplicates.length,
    },
    OK: results.filter((result) => result.status === "OK"),
    UNVERIFIED: results.filter((result) => result.status === "UNVERIFIED"),
    BROKEN: results.filter((result) => result.status === "BROKEN"),
    duplicates,
  };

  await mkdir(reportDirectory, { recursive: true });
  await writeFile(path.join(reportDirectory, "link-report.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Link report: ${report.totals.OK} OK, ${report.totals.UNVERIFIED} UNVERIFIED, ${report.totals.BROKEN} BROKEN.`);
  for (const status of ["UNVERIFIED", "BROKEN"] as const) {
    console.log(`\n${status}:`);
    for (const result of report[status]) {
      console.log(`- ${result.sheet} > ${result.topic} > ${result.title}: ${result.url} (${result.reason})`);
    }
  }
  if (duplicates.length) {
    console.log(`\nDUPLICATE URLS (${duplicates.length}):`);
    for (const duplicate of duplicates) {
      console.log(`- ${duplicate.sheet} > ${duplicate.topic} > ${duplicate.title}: ${duplicate.url} (first topic: ${duplicate.firstTopic})`);
    }
  }
  console.log(`\nDetailed report written to ${path.join(reportDirectory, "link-report.json")}`);

  if (report.totals.BROKEN > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error("Link validation failed:", error);
  process.exitCode = 1;
});
