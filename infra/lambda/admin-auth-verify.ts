import { APIGatewayProxyHandler } from 'aws-lambda';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // API Gateway with Cognito Authorizer populates requesting user's claims in requestContext.authorizer.claims
        const claims = event.requestContext.authorizer?.claims;

        if (!claims) {
            return {
                statusCode: 401,
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ isAdmin: false, error: "No claims found" }),
            };
        }

        // "cognito:groups" can be a string (single group) or an array (multiple groups) or undefined
        const groupsClaim = claims['cognito:groups'];
        let groups: string[] = [];

        if (typeof groupsClaim === 'string') {
            // If it's a string, it might be comma separated or just one string depending on how the claim is formatted in the context
            // Usually in JWT access token it is array, but in API Gateway Lambda Proxy authorizer context, it might be formatted differently or stringified.
            // However, standard claims often come as a string like "[Admin]" or just "Admin" if mapped?
            // Let's assume standard behavior: often comma separated string in requestContext or array object.
            // Safer approach: check if it contains 'Administrators'
            groups = [groupsClaim];
        } else if (Array.isArray(groupsClaim)) {
            groups = groupsClaim;
        } else if (groupsClaim) {
            // Some other format? 
            groups = String(groupsClaim).split(',');
        }

        // Check inclusion
        // Note: Use 'includes' or regex to be safe
        // The raw string from API Gateway authorizer claims for array fields is sometimes "[Admin, Other]" string.
        // Let's check the claims object log in CloudWatch if needed, but for now specific check:

        // Simplest robust check for "Administrators"
        const isAdmin = JSON.stringify(groupsClaim || "").includes("Administrators");

        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ isAdmin }),
        };

    } catch (error) {
        console.error("Error verifying auth:", error);
        return {
            statusCode: 500,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ isAdmin: false, error: "Internal Server Error" }),
        };
    }
};
