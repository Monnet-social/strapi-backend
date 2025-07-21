import AlgorithmControlService from "../../../../utils/algorithm_control_service";

export default {
    async afterCreate(event) {
        const { result } = event;

        const algorithmControlDetails = await strapi.documents("api::algorithm-control.algorithm-control").findOne({
            documentId: result.documentId,
            populate: {
                categories_entry: {
                    populate: {
                        category: true,
                    }
                },
                user: {
                    fields: ['username', 'email']
                }
            }
        });
        let finalData = {
            ...algorithmControlDetails,
        };
        delete finalData.user;

       await new AlgorithmControlService().setAlgorithmControlDetails(algorithmControlDetails.user.documentId, finalData);
    }
}