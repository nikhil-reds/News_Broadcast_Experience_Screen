"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

// Submit button that asks for confirmation before its form is sent.
export function ConfirmSubmitButton({
  message,
  children,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { message: string; children: ReactNode }) {
  return (
    <button
      type="submit"
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
