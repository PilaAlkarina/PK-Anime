import { getTags } from "@/lib/anilist/catalog";
import { catalogJson, upstreamError } from "../shared";

export const dynamic = "force-dynamic";

/** GET /api/catalog/tags: AniList's community tags without adult ones, by category */
export async function GET() {
  try {
    return catalogJson({ tags: await getTags() }, 3600);
  } catch (err) {
    return upstreamError(err);
  }
}
