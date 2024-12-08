import { APIGatewayProxyHandler, APIGatewayProxyEvent, Context } from 'aws-lambda';
import { getPackages } from '../controllers/getSomePackagesController.js';

/**
 * Lambda handler for getting packages based on queries
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent, context: Context) => {
  try {
    console.error('Incoming event:', JSON.stringify(event));
    console.error('Raw body:', event.body);
    
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Missing request body' 
        })
      };
    }
    
    // Parse body data, handling both string and parsed object cases
    let bodyData;
    try {
      bodyData = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      console.error('Parsed bodyData:', bodyData);
    } catch (parseError) {
      console.error('Error parsing body:', parseError);
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Invalid JSON in request body' 
        })
      };
    }
    
    // Handle case where body is an array (convert to expected format)
    if (Array.isArray(bodyData)) {
      console.error('Converting array to object format');
      bodyData = {
        queries: bodyData,
        offset: ""
      };
    }
    
    if (!bodyData) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Invalid request body format' 
        })
      };
    }
    
    console.error('Final bodyData:', bodyData);
    
    // Extract queries and offset with default
    const {queries, offset = ""} = bodyData;
    
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
      offset: offset
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