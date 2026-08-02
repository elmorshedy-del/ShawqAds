import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, resolveTheme, storedTheme, systemTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
  );

  // Keep in step with the OS until the operator makes an explicit choice.
  useEffect(() => {
    setTheme(resolveTheme() as "light" | "dark");
    if (!window.matchMedia) return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (storedTheme()) return;
      const next = systemTheme() as "light" | "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      setTheme(next);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(applyTheme(isDark ? "light" : "dark") as "light" | "dark")}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 p-1 text-xs",
        className,
      )}
    >
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full transition-colors",
          !isDark ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
        )}
      >
        <Sun className="h-3.5 w-3.5" />
      </span>
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full transition-colors",
          isDark ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
        )}
      >
        <Moon className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}
