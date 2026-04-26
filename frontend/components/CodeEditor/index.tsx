"use client";

import Editor from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { Language } from "@/lib/types";
import styles from "./CodeEditor.module.css";

interface CodeEditorProps {
  language: Language;
  code: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

const monacoLanguageMap: Record<Language, string> = {
  javascript: "javascript",
  python: "python",
  cpp: "cpp",
};

export function CodeEditor({ language, code, disabled, onChange }: CodeEditorProps) {
  const [editorTheme, setEditorTheme] = useState("vs-dark");
  const [editorHeight, setEditorHeight] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(420);

  useEffect(() => {
    const applyTheme = () => {
      const isLight = document.documentElement.getAttribute("data-theme") === "light";
      setEditorTheme(isLight ? "light" : "vs-dark");
    };

    applyTheme();

    const observer = new MutationObserver(() => {
      applyTheme();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const preferredHeight = Math.max(320, Math.min(560, Math.floor(window.innerHeight * 0.48)));
    setEditorHeight(preferredHeight);
  }, []);

  const startResize = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    startYRef.current = event.clientY;
    startHeightRef.current = editorHeight;
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handleMove = (event: MouseEvent) => {
      const delta = event.clientY - startYRef.current;
      const nextHeight = startHeightRef.current + delta;
      setEditorHeight(Math.max(280, Math.min(760, nextHeight)));
    };

    const stopResize = () => {
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", stopResize);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", stopResize);
    };
  }, [isResizing]);

  return (
    <div className={styles.container} style={{ height: `${editorHeight}px` }}>
      <div className={styles.editorArea}>
        <Editor
          theme={editorTheme}
          language={monacoLanguageMap[language]}
          value={code}
          onChange={(value) => onChange(value ?? "")}
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 14,
            fontFamily: "'Fira Code', 'Cascadia Code', monospace",
            readOnly: !!disabled,
            automaticLayout: true,
          }}
        />
      </div>

      <button
        type="button"
        className={styles.resizeBar}
        aria-label="Resize code editor"
        title="Drag to resize editor"
        onMouseDown={startResize}
      >
        <span className={styles.resizeIndicator} />
      </button>
    </div>
  );
}
