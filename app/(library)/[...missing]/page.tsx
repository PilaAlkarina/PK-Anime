import { notFound } from "next/navigation";

// Any library address that matches no page: the library's own 404 (with its layout) instead of
// Next's bare one
export default function MissingPage() {
  notFound();
}
