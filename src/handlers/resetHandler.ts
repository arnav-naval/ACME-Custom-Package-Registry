import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { resetRegistry } from '../controllers/resetController';

/**
 * Lambda handler for resetting the registry.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const authToken = event.headers['X-Authorization']; // Retrieve token from headers
    const response = await resetRegistry(authToken || "");
    return response;
  } catch (error) {
    console.error("Unhandled error in reset handler:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'An unexpected error occurred.' }),
    };
  }
};
