"use client";

import { useCallback, useEffect, useState } from "react";
import type { ServiceState, ServiceStatus } from "@/lib/status";

export type { ServiceState, ServiceStatus };

export interface ServiceStatusView {
  services: ServiceStatus[];
  checkedAt: Date | null;
  httpFallbackHosts: string[];
  loading: boolean;
  failed: boolean;
  /** Runs a new check (the server ignores it within a minute of the last one) */
  refresh: () => void;
}

/**
 * Live status from /api/status, fetched on mount. With `peek` it only reads the last report and
 * never starts a check, for indicators shown on every page.
 */
export function useServiceStatus({ peek = false }: { peek?: boolean } = {}): ServiceStatusView {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [httpFallbackHosts, setHosts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (force: boolean) => {
    setLoading(true);
    try {
      const query = force ? "?refresh=1" : peek ? "?peek=1" : "";
      const data = await (await fetch(`/api/status${query}`, { cache: "no-store" })).json();
      if (!data.success) throw new Error(data.error);
      setServices(data.services);
      setCheckedAt(data.checkedAt ? new Date(data.checkedAt) : null);
      setHosts(data.httpFallbackHosts || []);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [peek]);

  useEffect(() => {
    load(false);
  }, [load]);

  return { services, checkedAt, httpFallbackHosts, loading, failed, refresh: () => load(true) };
}
