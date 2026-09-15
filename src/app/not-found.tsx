import Link from "next/link";
import { BRAND } from "@/lib/brand";

export default function NotFound() {
  return (
    <main className="error-page">
      <p className="eyebrow">404</p>
      <h1>That view does not exist.</h1>
      <Link href="/">Return to {BRAND.name}</Link>
    </main>
  );
}
