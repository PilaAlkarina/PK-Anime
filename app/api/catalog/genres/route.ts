import { getGenres } from "@/lib/anilist/catalog";
import { catalogJson, upstreamError } from "../shared";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return catalogJson({ genres: await getGenres() }, 3600);
  } catch (err) {
    return upstreamError(err);
  }
}
