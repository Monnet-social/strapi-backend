import AlgorithmControlService from "../../../../utils/algorithm_control_service";

export default {
  async afterCreate(event) {
    const { result } = event;
    await strapi.service("api::tag.tag").extractTags(
      result.title,

      result.id
    );
    await strapi.service("api::tag.tag").extractTags(
      result.description,

      result.id
    );
    await new AlgorithmControlService().processPostCreation(result.documentId);
  },
};
