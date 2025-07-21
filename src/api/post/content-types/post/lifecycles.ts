import AlgorithmControlService from "../../../../utils/algorithm_control_service";

export default {
    async afterCreate(event) {
        const { result } = event;

        await new AlgorithmControlService().processPostCreation(result.documentId);
    }
}