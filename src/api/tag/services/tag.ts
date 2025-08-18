/**
 * tag service
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreService("api::tag.tag", ({ strapi }) => ({
  async extractTags(content, type, id) {
    console.log("Extracting tags...", content);
    const tags = content.match(/#\w+/g);
    let finalTags = tags ? tags.map((tag) => tag.slice(1)) : [];
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
        let finalbody: any = {
          tag: createdTag.id,
        };
        if (type === "post") {
          finalbody.post = id;
        } else {
          finalbody.comment = id;
        }
        await strapi.entityService.create("api::tag-link.tag-link", {
          data: finalbody,
        });
      } else {
        let existingTag = findTag[0];
        await strapi.entityService.update("api::tag.tag", existingTag.id, {
          data: {
            post_count: existingTag.post_count + 1,
          },
        });
        let finalbody: any = {
          tag: existingTag.id,
        };
        if (type === "post") {
          finalbody.post = id;
        } else {
          finalbody.comment = id;
        }
        await strapi.entityService.create("api::tag-link.tag-link", {
          data: finalbody,
        });
      }
    }
  },
}));
