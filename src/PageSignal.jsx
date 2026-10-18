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
  // The homepage already explains that its sample uses synthetic signals in
  // the report itself. Repeating that status in the header looked actionable
  // even though it was only an informational label.
  if (route === "/") return null;
  if (
    ["/benchmark-lab/historical-case-01", "/case-study/cookie-cats"].includes(
      route,
    )
  )
    return "Historical case · observed data only";
  if (route === "/benchmark") return null;
  if (/^\/benchmark\/(?:(?:film|proxy)\/PX|music\/MX)-\d{3}$/.test(route))
    return "Proxy case · historical preferences";
  if (
    /^\/(test|poll)\//.test(route) ||
    /^\/benchmark\/(?:film|proxy|music)\/run\//.test(route)
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
