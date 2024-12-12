export * from "./providers/lambda";
export { getCharacterInfo } from "./utils/dynamoCharacterInfo";
import { lambdaProvider } from "./providers/lambda";
import { Plugin } from "@ai16z/eliza";

export const awsPlugin: Plugin = {
    name: "aws",
    description: "AWS plugin",
    actions: [],
    evaluators: [],
    providers: [
        lambdaProvider
    ]
};

export default awsPlugin;