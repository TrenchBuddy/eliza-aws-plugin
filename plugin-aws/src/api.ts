/*
Put the following code inside of client-direct/src/index.ts.
handleMessageRequest is the logic of the /:agentID/message endpoint pulled into
a common function so both /message and /:agentID/message can use it.


private getAgentIDFromAuthorizationHeader(req: express.Request): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.split(' ')[1];
    const agentName = token.split(':')[0];
    return agentName ? stringToUuid(agentName) : null;
}

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
*/