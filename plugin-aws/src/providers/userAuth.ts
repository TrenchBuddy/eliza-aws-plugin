import { stringToUuid } from "@ai16z/eliza";


export function parseAuthorizationHeaderForAgentID(authHeader: string | undefined): string | null {
    if (!authHeader?.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.split(' ')[1];
    const agentName = token.split(':')[0];
    return agentName ? stringToUuid(agentName) : null;
}

