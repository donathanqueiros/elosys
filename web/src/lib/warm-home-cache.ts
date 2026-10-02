import { getHomeStats, getSidebarCounts } from "./stats";
import { getExpenseYears, getAssetYears, getTopSuppliers, getAssetsRanking, getAssetsGrowthRanking } from "./queries";

export function warmHomeCache() {
  const timed = (label: string, compute: () => unknown) => {
    const start = performance.now();
    compute();
    console.info(`[elosys] ${label}: ${Math.round(performance.now() - start)}ms`);
  };
  console.info("[elosys] Preparing home and ranking caches before accepting requests...");
  timed("sidebar", getSidebarCounts);
  const expenseYears = getExpenseYears();
  for (const year of [undefined, ...expenseYears]) {
    timed(`home stats ${year ?? "all"}`, () => getHomeStats(year));
    timed(`suppliers ${year ?? "all"}`, () => getTopSuppliers(year ?? null, 10));
  }
  for (const year of [undefined, ...getAssetYears()]) {
    timed(`assets ${year ?? "latest"}`, () => getAssetsRanking({ year, limit: 0 }));
  }
  timed("asset growth", () => getAssetsGrowthRanking({ limit: 0 }));
  console.info("[elosys] Home and ranking caches ready.");
}
