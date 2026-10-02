export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    const { warmHomeCache } = await import("./lib/warm-home-cache");
    warmHomeCache();
  }
}
