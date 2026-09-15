"use client";

import Link, { type LinkProps } from "next/link";
import { useState, type AnchorHTMLAttributes, type ReactNode } from "react";

type Props = LinkProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & { children?: ReactNode };

/** Link that only prefetches once the user shows intent (hover / focus / touch). */
export function PrefetchLink(props: Props) {
  const [prefetch, setPrefetch] = useState(false);
  return (
    <Link
      {...props}
      prefetch={prefetch}
      onMouseEnter={(e) => {
        setPrefetch(true);
        props.onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        setPrefetch(true);
        props.onFocus?.(e);
      }}
      onTouchStart={(e) => {
        setPrefetch(true);
        props.onTouchStart?.(e);
      }}
    />
  );
}
