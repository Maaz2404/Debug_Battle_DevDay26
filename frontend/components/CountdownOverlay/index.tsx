"use client";

import { AnimatePresence, motion } from "framer-motion";
import styles from "./CountdownOverlay.module.css";

interface CountdownOverlayProps {
  value: number | null;
}

export function CountdownOverlay({ value }: CountdownOverlayProps) {
  return (
    <AnimatePresence>
      {value !== null ? (
        <motion.div
          key="countdown-overlay"
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            key={value}
            className={styles.value}
            initial={{ scale: 0.45, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.25, opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            {value}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
