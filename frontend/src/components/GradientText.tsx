import type { ReactNode } from "react";

// react-bits "GradientText" style: an animated gradient clipped to the text.
export function GradientText({ children }: { children: ReactNode }) {
  return <span className="gradient-text">{children}</span>;
}
