import { createContext, useContext, useEffect } from "react";

export const PageSignalContext = createContext(null);
export function usePageSignal(record) {
  const publish = useContext(PageSignalContext);
  useEffect(() => {
    if (record && publish)
      publish({
        mode: record.mode,
        sample: !!(record.isSample || record.isLiveSample),
        scoringVersion: record.scoringVersion,
      });
  }, [record, publish]);
}
export function pageSignalLabel(route, config, record) {
  if (route === "/") return "Cafe demo · synthetic signals";
  if (
    ["/benchmark-lab/historical-case-01", "/case-study/cookie-cats"].includes(
      route,
    )
  )
    return "Historical case · workflow rehearsal";
  if (route === "/benchmark") return "Benchmark · see each case’s data source";
  if (/^\/benchmark\/proxy\/PX-\d{3}$/.test(route))
    return "Proxy case · prediction not started";
  if (
    /^\/(test|poll)\//.test(route) ||
    /^\/benchmark\/proxy\/run\//.test(route)
  ) {
    if (!record) return "Loading this case’s data source…";
    if (record.sample) return "Cafe demo · synthetic signals";
    if (record.mode === "mock") return "This case · synthetic signals";
    if (record.mode === "real")
      return record.scoringVersion === "qloo-candidate-affinity-v1"
        ? "This case · direct Qloo affinity"
        : "This case · Qloo data + local scoring";
    return "This case · data source unavailable";
  }
  if (["/create", "/benchmark/new"].includes(route)) {
    if (config.mode === "loading") return "Checking new-test configuration…";
    if (config.mode === "real")
      return config.configured
        ? "New tests · Qloo API configured"
        : "New tests · Qloo key missing";
    if (config.mode === "mock") return "New tests · synthetic signals";
    return "New tests · configuration unavailable";
  }
  return null;
}
