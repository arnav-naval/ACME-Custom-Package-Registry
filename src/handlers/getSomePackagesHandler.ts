import { APIGatewayProxyHandler, APIGatewayProxyEvent, Context } from 'aws-lambda';
import { getPackages } from '../controllers/getSomePackagesController.js';

/**
 * Lambda handler for getting packages based on queries
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent, context: Context) => {
  try {
    // Parse the request body
    let {queries, offset} = JSON.parse(event.body);
    if (offset == "") {
      offset = 0;
    }
    
    // Validate request body
    if (!Array.isArray(queries) || queries.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Request body must be a non-empty array of package queries' 
        })
      };
    }

    // Validate each query object structure
    for (const query of queries) {
      if (!query.Name || typeof query.Name !== 'string') {
        return {
          statusCode: 400,
          body: JSON.stringify({ 
            error: 'Each query must have a Name property of type string' 
          })
        };
      }
    }

    // Get offset from query parameters

    // Call controller with options
    return await getPackages({
      queries,
      offset
    });

  } catch (error) {
    console.error('Error in getPackages handler:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error while getting packages'
      })
    };
  }
};