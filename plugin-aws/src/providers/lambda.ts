import AWS from 'aws-sdk';
import { IAgentRuntime, Memory, Provider, State } from "@ai16z/eliza";


export async function invokeLambda(functionName: string, payload: any) {
    const lambda = new AWS.Lambda({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: new AWS.Credentials({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
        })
    });
    return await lambda.invoke({
        FunctionName: functionName,
        Payload: payload
    }).promise();
}

export const lambdaProvider: Provider = {
    get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        try {
            const response = await invokeLambda(message.content.text, message.content.attachments);


            return response.Payload ? JSON.parse(response.Payload.toString()) : null;
        } catch (error) {
            console.error('Lambda invocation failed:', error);
            throw error;
        }
    }
};
