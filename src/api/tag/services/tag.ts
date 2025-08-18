/**
 * tag service
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreService("api::tag.tag", ({ strapi }) => ({
  async extractTags(content, id) {
    console.log("Extracting tags...", content);
    const tags = content.match(/#\w+/g);
    let finalTags = tags ? tags.map((tag) => tag.slice(1)) : [];
    let findProducts: any = await strapi.entityService.findMany(
      "api::post.post",
      {
        filters: {
          id: {
            $eq: id,
          },
        },
        populate: {
          tags: true,
        },
      }
    );

    let finalTagIds: any = findProducts[0]?.tags.map((tag) => tag.id);
    for (let i = 0; i < finalTags.length; i++) {
      const tag = finalTags[i];

      let findTag = await strapi.entityService.findMany("api::tag.tag", {
        filters: {
          name: {
            $eqi: tag,
          },
        },
      });
      if (findTag.length === 0) {
        let createdTag = await strapi.entityService.create("api::tag.tag", {
          data: {
            name: tag,
            post_count: 1,
          },
        });

        finalTagIds.push(createdTag.id);
      } else {
        let existingTag = findTag[0];
        finalTagIds.push(existingTag.id);
        await strapi.entityService.update("api::tag.tag", existingTag.id, {
          data: {
            post_count: existingTag.post_count + 1,
          },
        });
      }
    }
    await strapi.entityService.update("api::post.post", id, {
      data: {
        tags: finalTagIds,
      },
    });
  },
}));
