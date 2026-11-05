import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[96px] w-full rounded-lg border border-divider bg-background px-4 py-3 text-sm placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-150 hover:border-foreground/25 focus-visible:outline-none focus-visible:border-foreground/40 focus-visible:ring-4 focus-visible:ring-foreground/[0.06]",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export { Textarea };
