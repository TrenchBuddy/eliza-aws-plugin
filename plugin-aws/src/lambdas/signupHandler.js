import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import crypto from 'crypto';

const dynamoDB = DynamoDBDocument.from(new DynamoDB({}));

export const handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
    };

    try {
        // Handle API Gateway proxy integration
        let requestBody;
        if (event.body) {
            // If the body is a string (from API Gateway), parse it
            requestBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        } else {
            throw new Error('Missing request body');
        }

        const { username, hashedToken, salt, wallet } = requestBody;
        // Remove @ symbol if present
        const cleanUsername = username.startsWith('@') ? username.substring(1) : username;

        // Create timestamp for record
        const timestamp = new Date().toISOString();

        // Prepare the item for DynamoDB
        const params = {
            TableName: '{stage}-signups', // default table name in infrastructure.yaml SignupsTable
            Item: {
                username: cleanUsername.toLowerCase(),
                hashed_token: hashedToken,  // Store the hashed token
                salt: salt,                 // Store the salt
                wallet_address: wallet || null,
                signup_timestamp: timestamp,
                // Don't store the raw signup data anymore since it contained the plain token
                signup_metadata: JSON.stringify({
                    username: cleanUsername,
                    wallet: wallet || null,
                    timestamp
                })
            },
            ConditionExpression: 'attribute_not_exists(username)'
        };

        // Write to DynamoDB
        await dynamoDB.put(params);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                message: 'Signup successful',
                username: cleanUsername
            })
        };

    } catch (error) {
        console.error('Error:', error);

        if (error.code === 'ConditionalCheckFailedException') {
            return {
                statusCode: 409,
                headers,
                body: JSON.stringify({
                    message: 'User has already signed up'
                })
            };
        }

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                message: 'Internal server error'
            })
        };
    }
};