# AWS Plugin for Eliza

This plugin provides AWS infrastructure and deployment capabilities for running Eliza in a scalable cloud environment.
It was created inadvertently during the creation of [TrenchBuddy.io](https://TrenchBuddy.io) due to its unique requirements as a one-agent-per-user application.
AWS provided a great framework for scaling, centralized data storage, and authentication. I hope this can be of use to others
who want to host Eliza on AWS, regardless of whether they leverage the multi-agent modifications I made.

## Setup

### Environment Variables
Add the following to your `.env` file:
```bash
# AWS Credentials
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=your_aws_region  # e.g., us-east-1

# Optional: Stage for resource naming
AWS_STAGE=dev  # or staging, prod
```

These credentials are required for:
- Deploying infrastructure with CloudFormation
- Lambda function invocation
- DynamoDB access
- All AWS service interactions

## Overview

The plugin enables Eliza to run on AWS with:
- Auto-scaling EC2 instances
- Centralized PostgreSQL database on RDS
- API Gateway endpoints with custom authorization
- DynamoDB tables for user data
- Network Load Balancer for traffic distribution

## Key Components

### Infrastructure Template
The `infrastructure.yaml` template defines the complete AWS environment including:
- VPC with 3 availability zones
- Auto-scaling group for EC2 instances (main instance is xlarge to facilitate building, but you can comfortably run on a medium or small instance)
- RDS PostgreSQL database
- DynamoDB tables for user accounts (if desired) and preferences
- API Gateway with custom authorizer
- Lambda functions for API handling
- Required IAM roles and policies

### API Integration
The `api.ts` module provides:
- Agent-agnostic endpoint handling, with credentials obtained from the header also verified in the custom authorizer
- Custom authorization for API requests
- Integration with DynamoDB for user data

To use client-direct mode, modify your client code to work with the agent-agnostic endpoint pattern in API Gateway. The endpoint expects requests in the format:

```
POST /message
```

The agentId is extracted from the Authorization header in the format:
```
Bearer agentName:password
```

### Lambda Functions & Database Integration

The infrastructure uses two key Lambda functions that work with the databases:

#### Custom Authorizer
Located in `src/lambdas/authorizer.js`, this function:
- Validates incoming requests to the API Gateway
- Expects "Bearer username:password" format in Authorization header
- Looks up users in DynamoDB using a cleaned username (removes @ and converts to lowercase)
- Verifies password using PBKDF2 with stored salt and hash
- Returns an IAM policy document that allows/denies access
- Includes user context (username and wallet address) for downstream processing

Example authorization flow:
```javascript
// 1. Extract and validate credentials
const [username, plainTextPassword] = credentials.split(':');
const cleanUsername = username.startsWith('@') ?
    username.substring(1).toLowerCase() :
    username.toLowerCase();

// 2. Look up user in DynamoDB
const result = await dynamoDB.get({
    TableName: '{stage}-signups',  // Default table name from infrastructure.yaml
    Key: { username: cleanUsername }
});

// 3. Verify password using PBKDF2
const isValid = await verifyHash(
    plainTextPassword,
    result.Item.salt,
    result.Item.hashed_token
);

// 4. Generate IAM policy
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
```

#### Signup Handler
Located in `src/lambdas/signupHandler.js`, this function:
- Processes new user registrations
- Handles CORS with appropriate headers
- Cleans usernames (removes @ and converts to lowercase)
- Stores pre-hashed tokens and salts for security
- Prevents duplicate signups using DynamoDB condition expressions
- Optionally stores wallet addresses for Web3 integration

Example signup flow:
```javascript
// 1. Process and clean the signup data
const { username, hashedToken, salt, wallet } = requestBody;
const cleanUsername = username.startsWith('@') ?
    username.substring(1).toLowerCase() :
    username.toLowerCase();

// 2. Write to DynamoDB with duplicate prevention
await dynamoDB.put({
    TableName: '{stage}-signups',
    Item: {
        username: cleanUsername,
        hashed_token: hashedToken,
        salt: salt,
        wallet_address: wallet || null,
        signup_timestamp: new Date().toISOString(),
        signup_metadata: JSON.stringify({
            username: cleanUsername,
            wallet: wallet || null,
            timestamp
        })
    },
    ConditionExpression: 'attribute_not_exists(username)'
});
```

The signup handler works in conjunction with the custom authorizer:
1. Signup handler stores credentials and metadata
2. Custom authorizer uses stored salt and hash to verify subsequent requests
3. Both functions use the same DynamoDB table structure
4. Error handling includes duplicate user detection (409) and server errors (500)

### Database Architecture

The system uses a hybrid database approach:

#### DynamoDB Tables
- **User Accounts**: Fast lookups for authentication
- **Preferences**: Quick access to user settings
- Used by Lambda functions for low-latency operations
- Automatically scales with demand

#### RDS PostgreSQL
- Central database for complex data relationships
- Accessed by EC2 instances for chat history and analysis
- Shared across all instances in auto-scaling group
- Maintains consistency across the application

### Code Integration

To integrate with this infrastructure:

1. **Client Code**:
```typescript
// Modify client-direct/src/index.ts to extract agentID from Authorization header
private getAgentIDFromAuthorizationHeader(req: express.Request): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.split(' ')[1];
    const agentName = token.split(':')[0];
    return agentName ? stringToUuid(agentName) : null;
}

// Add new /message endpoint that works with the agent-agnostic pattern
this.app.post(
    "/message",
    async (req: express.Request, res: express.Response) => {
        const agentId = this.getAgentIDFromAuthorizationHeader(req);
        if (!agentId) {
            res.status(401).send("Unauthorized");
            return;
        }
        await this.handleMessageRequest(agentId, req.body, res);
    }
);
```

2. **Lambda Functions**:
```typescript
// Custom Authorizer
export const handler = async (event) => {
  const token = event.authorizationToken;
  const userRecord = await dynamoDB.get({
    TableName: 'user-accounts',
    Key: { username: getUserFromToken(token) }
  });
  // Return IAM policy based on validation
};

// Signup Handler
export const handler = async (event) => {
  const { username, hashedToken, salt, wallet } = JSON.parse(event.body);
  const cleanUsername = username.startsWith('@') ?
    username.substring(1).toLowerCase() :
    username.toLowerCase();

  await dynamoDB.put({
    TableName: '{stage}-signups',
    Item: {
      username: cleanUsername,
      hashed_token: hashedToken,
      salt: salt,
      wallet_address: wallet || null,
      signup_timestamp: new Date().toISOString()
    },
    ConditionExpression: 'attribute_not_exists(username)'
  });
};
```

3. **EC2 Application Code**:
```typescript
// Access RDS for chat history
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.RDS_ENDPOINT,
  database: 'eliza'
});

async function getChatHistory(username) {
  const result = await pool.query(
    'SELECT * FROM chat_history WHERE username = $1',
    [username]
  );
  return result.rows;
}
```

This architecture allows for:
- Fast authentication via DynamoDB
- Consistent data access across all instances
- Scalable user management
- Centralized chat history and analysis

## Deployment
Deploy using AWS CloudFormation:

```bash
aws cloudformation create-stack \\
  --stack-name eliza-environment \\
  --template-body file://infrastructure.yaml \\
  --parameters file://parameters.json \\
  --capabilities CAPABILITY_IAM
```

## Parameters
Required parameters for deployment:
- Environment (dev/staging/prod)
- Database credentials
- Lambda function code
- Custom authorizer code

## Scaling
The infrastructure automatically scales based on:
- EC2 auto-scaling group (3-10 instances)
- RDS storage auto-scaling (up to 1000GB)
- DynamoDB on-demand capacity

## Monitoring
- CloudWatch logs for Lambda functions
- RDS Performance Insights
- Load Balancer metrics
- Auto-scaling group metrics

## Development
To modify the agent-agnostic endpoint:
1. Update API Gateway configuration
2. Modify client code to use new endpoint pattern
3. Update Lambda functions as needed
4. Test with character.json loading

For local development, see `agent.ts` comments for character configuration loading implementation.

### Lambda Provider
The plugin includes a Lambda provider that allows Eliza agents to invoke AWS Lambda functions directly:

```typescript
// Using the Lambda provider in your agent
import { awsPlugin } from "@ai16z/plugin-aws";

// Add the plugin to your agent configuration
const agent = new AgentRuntime({
  plugins: [awsPlugin]
});

// The provider uses AWS credentials from environment variables:
// AWS_REGION
// AWS_ACCESS_KEY_ID
// AWS_SECRET_ACCESS_KEY

// Invoke a Lambda function from your agent:
const response = await runtime.get({
  provider: "lambda",
  content: {
    text: "functionName",  // Lambda function name
    attachments: payload   // Function payload
  }
});
```

This allows agents to:
- Invoke any Lambda function in your AWS account
- Pass payloads to Lambda functions
- Handle Lambda function responses
- Integrate with other AWS services via Lambda
