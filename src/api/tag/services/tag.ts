/**
 * tag service
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreService("api::tag.tag", ({ strapi }) => ({
  async extractTags(content: string, id: number) {
    console.log("Extracting tags...", content);

    // Grab everything after # until the next space (or another #); supports hyphens etc.
    const tags = [...content.matchAll(/#([^\s#]+)/g)].map((m) => m[1]) ?? [];

    // Normalize & de-dupe (optional: toLowerCase to treat #New and #new the same)
    const finalTags = Array.from(new Set(tags.map((t) => t.trim())));

    // Get current post + existing tag ids (handle empty/null safely)
    const posts: any[] = await strapi.entityService.findMany("api::post.post", {
      filters: { id: { $eq: id } },
      populate: { tags: true },
    });

    const existingTagIds: number[] =
      posts?.[0]?.tags?.map((t: any) => t.id) ?? [];
    const finalTagIds: any = [...existingTagIds];

    for (const tag of finalTags) {
      // Find tag case-insensitively
      const found = await strapi.entityService.findMany("api::tag.tag", {
        filters: { name: { $eqi: tag } },
        limit: 1,
      });

      if (!found || found.length === 0) {
        // Create new tag
        const created = await strapi.entityService.create("api::tag.tag", {
          data: {
            name: tag,
            post_count: 1,
          },
        });
        finalTagIds.push(created.id);
      } else {
        const existing = found[0];

        // Avoid pushing the same id twice if it’s already linked
        if (!finalTagIds.includes(existing.id)) {
          finalTagIds.push(existing.id);
        }

        // Increment post_count (optional: only if not already linked)
        await strapi.entityService.update("api::tag.tag", existing.id, {
          data: {
            post_count: (existing.post_count ?? 0) + 1,
          },
        });
      }
    }

    // Update post with the merged tag ids
    await strapi.entityService.update("api::post.post", id, {
      data: { tags: finalTagIds },
    });
  },
}));
