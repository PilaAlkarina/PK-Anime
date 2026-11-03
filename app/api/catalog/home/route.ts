import { getHomeRows } from "@/lib/anilist/catalog";
import { catalogJson, upstreamError } from "../shared";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return catalogJson({ rows: await getHomeRows() }, 300);
  } catch (err) {
    return upstreamError(err);
  }
}
