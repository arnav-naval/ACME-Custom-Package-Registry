import { APIGatewayProxyHandler, APIGatewayProxyEvent, Context } from 'aws-lambda';
import { getPackages } from '../controllers/getSomePackagesController.js';

/**
 * Lambda handler for getting packages based on queries
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent, context: Context) => {
  try {
    // Log the incoming event for debugging
    console.log('Incoming event:', JSON.stringify(event));
    
    // Get body data, handling both string and parsed object cases
    const bodyData = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    console.log('Parsed body data:', bodyData);
    
    // Extract queries and offset with default
    const {queries, offset = 0} = bodyData;
    
    // Convert empty string offset to 0
    const numericOffset = offset === "" ? 0 : Number(offset);
    
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

    // Call controller with options
    return await getPackages({
      queries,
      offset: numericOffset.toString()
    });

  } catch (error) {
    console.error('Error in getPackages handler:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: `Internal server error while getting packages error: ${error}`
      })
    };
  }
};