import { APIGatewayProxyHandler, APIGatewayProxyEvent, Context } from 'aws-lambda';
import { resetRegistry } from '../controllers/resetController.js';

/**
 * Lambda handler for resetting the registry.
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent, context: Context) => {
  try {
    // Perform the reset
    const result = await resetRegistry();
    
    // Return the result directly from resetRegistry
    return {
      statusCode: result.statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: result.body
    };

  } catch (error) {
    console.error('Error in reset handler:', error);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal server error while resetting registry'
      })
    };
  }
};
