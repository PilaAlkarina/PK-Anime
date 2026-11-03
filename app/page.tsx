import { redirect } from "next/navigation";

// The API documentation lives at /aniflow-doc; the root is free for a future home page
export default function RootPage() {
  redirect("/aniflow-doc");
}
