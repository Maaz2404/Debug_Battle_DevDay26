"use client";

import clsx from "clsx";
import type { ConnectionStatus } from "@/lib/types";
import styles from "./ConnectionStatusBadge.module.css";

interface ConnectionStatusBadgeProps {
  status: ConnectionStatus;
}

const labelMap: Record<ConnectionStatus, string> = {
  connected: "Connected",
  reconnecting: "Reconnecting",
  disconnected: "Disconnected",
};

export function ConnectionStatusBadge({ status }: ConnectionStatusBadgeProps) {
  const statusClassMap: Record<ConnectionStatus, string> = {
    connected: styles.connected,
    reconnecting: styles.reconnecting,
    disconnected: styles.disconnected,
  };

  const dotClassMap: Record<ConnectionStatus, string> = {
    connected: styles.connectedDot,
    reconnecting: styles.reconnectingDot,
    disconnected: styles.disconnectedDot,
  };

  return (
    <span className={clsx(styles.base, statusClassMap[status])}>
      <span className={clsx(styles.dot, dotClassMap[status])} />
      {labelMap[status]}
    </span>
  );
}
