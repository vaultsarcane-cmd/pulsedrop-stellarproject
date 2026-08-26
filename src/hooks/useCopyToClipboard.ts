import { useEffect, useState } from "react";

/** Copy text to the clipboard and report success for transient feedback. */
export function useCopyToClipboard(resetAfterMs = 2000): {
  copied: boolean;
  copy: (text: string) => Promise<void>;
} {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), resetAfterMs);
    return () => window.clearTimeout(timer);
  }, [copied, resetAfterMs]);

  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard permission denied; keep silent and leave state unchanged.
    }
  }

  return { copied, copy };
}
