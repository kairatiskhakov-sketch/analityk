"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { MODULES, type ModuleKey } from "@/lib/modules/config";
import { fetcher } from "@/lib/swr/fetcher";

type ModuleRow = {
  moduleKey: string;
  name: string;
  page: string;
  isEnabled: boolean;
  position: number;
};

type ModulesResponse = { modules?: ModuleRow[] };

export function useModules() {
  const { data, mutate, isLoading } = useSWR<ModulesResponse>(
    "/api/modules",
    fetcher,
    { revalidateOnFocus: false },
  );

  const isEnabled = useCallback(
    (key: ModuleKey): boolean => {
      const mod = data?.modules?.find((m) => m.moduleKey === key);
      if (!mod) {
        return MODULES.find((m) => m.key === key)?.default ?? true;
      }
      return mod.isEnabled;
    },
    [data?.modules],
  );

  const toggle = async (key: ModuleKey, enabled: boolean) => {
    const r = await fetch("/api/modules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleKey: key, isEnabled: enabled }),
      credentials: "same-origin",
    });
    if (!r.ok) {
      throw new Error(`HTTP ${r.status}`);
    }
    await mutate();
  };

  return { isEnabled, toggle, isLoading, modules: data?.modules };
}
