import { useState } from "react";

export function Copyable({
  text,
  display,
  className,
}: {
  text: string;
  display: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  }
  return (
    <button className={"copyable " + (className ?? "")} onClick={copy} title="Copy">
      {copied ? "copied" : display}
    </button>
  );
}
