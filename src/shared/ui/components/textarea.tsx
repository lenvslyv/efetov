import * as React from "react";
import { cn } from "@/shared/lib/cn";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn("flex min-h-24 w-full min-w-0 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 read-only:bg-muted/50", className)} {...props} />
);
Textarea.displayName = "Textarea";
