import { useContext } from "react";
import { AppSettingsContext } from "./AppSettingsProvider";

export function useAppSettings() {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) throw new Error("useAppSettings must be used within AppSettingsProvider");
  return ctx;
}
