import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import crypto from 'crypto';
import { TextEncoder } from 'util';

const dynamoDB = DynamoDBDocument.from(new DynamoDB({}));

async function verifyHash(password, salt, storedHash) {
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);
    const saltData = encoder.encode(salt);

    // Combine password and salt
    const combined = new Uint8Array(passwordData.length + saltData.length);
    combined.set(passwordData);
    combined.set(saltData, passwordData.length);

    // Use PBKDF2 with 100,000 iterations
    const derivedKey = await new Promise((resolve, reject) => {
        crypto.pbkdf2(combined, saltData, 100000, 32, 'sha256', (err, key) => {
            if (err) reject(err);
            resolve(key);
        });
    });

    // Convert hash to hex string
    const hash = Array.from(new Uint8Array(derivedKey))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

    console.log('Generated hash:', hash);
    console.log('Stored hash:', storedHash);
    return hash === storedHash;
}

export const handler = async (event) => {
    try {
        // Log the incoming event for debugging
        console.log('Event:', JSON.stringify(event, null, 2));

        // Get Authorization header
        const authHeader = event.headers?.Authorization || event.headers?.authorization;
        if (!authHeader) {
            throw new Error('Missing Authorization header');
        }

        // Expected format: "Bearer username:plainTextPassword"
        const [bearer, credentials] = authHeader.split(' ');
        if (bearer !== 'Bearer' || !credentials) {
            throw new Error('Invalid Authorization format');
        }

        const [username, plainTextPassword] = credentials.split(':');
        if (!username || !plainTextPassword) {
            throw new Error('Invalid credentials format');
        }

        // Clean username (remove @ if present)
        const cleanUsername = username.startsWith('@') ?
            username.substring(1).toLowerCase() :
            username.toLowerCase();

        // Look up user in DynamoDB
        const params = {
            TableName: '', // your table name here, default in infrastructure.yaml is ElizaSignups
            Key: {
                username: cleanUsername
            }
        };

        const result = await dynamoDB.get(params);
        if (!result.Item) {
            throw new Error('User not found');
        }

        // Verify using plain text password, stored salt, and stored hash
        const isValid = await verifyHash(
            plainTextPassword,
            result.Item.salt,
            result.Item.hashed_token
        );

        if (!isValid) {
            throw new Error('Invalid token');
        }

        // Generate policy
        return {
            principalId: cleanUsername,
            policyDocument: {
                Version: '2012-10-17',
                Statement: [{
                    Action: 'execute-api:Invoke',
                    Effect: 'Allow',
                    Resource: event.methodArn
                }]
            },
            context: {
                username: cleanUsername,
                wallet: result.Item.wallet_address || 'none'
            }
        };

    } catch (error) {
        console.error('Authorization failed:', error);
        throw new Error('Unauthorized');
    }
};