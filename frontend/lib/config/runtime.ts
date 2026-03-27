const modeFlag = String(process.env.NEXT_PUBLIC_ENABLE_REAL_BACKEND ?? "").trim().toLowerCase();

// Default to real backend unless explicitly disabled.
export const REAL_BACKEND_ENABLED = modeFlag !== "false";