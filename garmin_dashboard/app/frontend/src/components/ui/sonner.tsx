import { Toaster as Sonner, type ToasterProps } from "sonner";

import { useTheme } from "@/lib/theme";

// shadcn/ui sonner — sans next-themes : l'app est sombre par défaut
const Toaster = (props: ToasterProps) => {
  const { theme } = useTheme();
  return (
  <Sonner
    theme={theme}
    className="toaster group"
    style={
      {
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--normal-border": "var(--border)",
        "--border-radius": "16px",
      } as React.CSSProperties
    }
    {...props}
  />
  );
};

export { Toaster };
