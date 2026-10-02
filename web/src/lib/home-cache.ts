import type { HomeStats, SidebarCounts } from "./stats";
import type { TopSupplier } from "./queries";

export type AssetTotal = { personId: number; assetCount: number; assetTotalCents: number };
export type AssetGrowth = {
  personId: number; firstYear: number; lastYear: number;
  firstCents: number; lastCents: number; growthCents: number;
};

type HomeCache = {
  stats: Map<number, HomeStats>;
  suppliers: Map<string, TopSupplier[]>;
  expenseYears: number[] | null;
  assetYears: number[] | null;
  sidebar: SidebarCounts | null;
  assets: Map<number, AssetTotal[]>;
  growth: AssetGrowth[] | null;
};

// Instrumentation and route bundles must use the same cache in this process.
const globalCache = globalThis as typeof globalThis & { elosysHomeCache?: HomeCache };
export const homeCache: HomeCache = globalCache.elosysHomeCache ??= {
  stats: new Map(), suppliers: new Map(), expenseYears: null, assetYears: null,
  sidebar: null, assets: new Map(), growth: null,
};
