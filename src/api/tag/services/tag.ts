import { factories } from "@strapi/strapi";

export default factories.createCoreService("api::tag.tag", ({ strapi }) => ({
  async extractTags(content, id) {
    // Defensive: ensure content is a string
    if (typeof content !== "string" || !content) content = "";

    const tags = content.match(/#\w+/g);
    const finalTags = tags ? tags.map((tag) => tag.slice(1)) : [];

    // Get any currently attached tags
    const findProducts = await strapi.entityService.findMany("api::post.post", {
      filters: { id: { $eq: id } },
      populate: { tags: true },
    });
    let finalTagIds =
      (findProducts[0] as any)?.tags?.map((tag) => tag.id) || [];

    for (const tag of finalTags) {
      // Find tag case-insensitively
      const findTag = await strapi.entityService.findMany("api::tag.tag", {
        filters: { name: { $eqi: tag } },
      });
      if (findTag.length === 0) {
        const createdTag = await strapi.entityService.create("api::tag.tag", {
          data: { name: tag, post_count: 1 },
        });
        if (!finalTagIds.includes(createdTag.id))
          finalTagIds.push(createdTag.id);
      } else {
        const existingTag = findTag;
        if (!finalTagIds.includes((existingTag as any).id))
          finalTagIds.push((existingTag as any).id);
        await strapi.entityService.update(
          "api::tag.tag",
          (existingTag as any).id,
          {
            data: { post_count: (existingTag as any).post_count + 1 },
          }
        );
      }
    }

    // Deduplicate
    finalTagIds = [...new Set(finalTagIds)];

    // Always cleanly update the tags relational field (array of ids)
    await strapi.entityService.update("api::post.post", id, {
      data: { tags: finalTagIds },
    });
  },
}));
