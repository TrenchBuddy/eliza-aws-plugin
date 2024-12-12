import AWS from 'aws-sdk';


export async function getCharacterInfo(userID: string, tableName: string) {
    const dynamo = new AWS.DynamoDB.DocumentClient({
        region: process.env.AWS_REGION || 'us-east-2', // default region in infrastructure.yaml is us-east-2
        credentials: new AWS.Credentials({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
        })
    });

    const params = {
        TableName: tableName,
        Key: {
            username: userID
        }
    };

    try {
        const result = await dynamo.get(params).promise();

        if (!result.Item) {
            throw new Error(`No character info found for user: ${userID}`);
        }

        // Parse the preferences (character JSON) string into an object
        try {
            const preferences = JSON.parse(result.Item.preferences);
            return preferences;
        } catch (jsonError) {
            console.error('Failed to parse preferences JSON:', jsonError);
            throw new Error('Invalid preferences format in database');
        }

    } catch (error) {
        console.error('Error fetching character info from DynamoDB:', error);
        throw error;
    }
}