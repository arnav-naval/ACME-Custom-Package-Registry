import { uploadPackageToS3, searchPackages } from '../controllers/packageController.js';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { Context } from 'aws-lambda';

export const handler: APIGatewayProxyHandler = async (event, context: Context) => {
  try {
    // Check the route path and HTTP method to determine action
    if (event.httpMethod === 'POST' && event.path === '/upload') {
      return await uploadPackageToS3(event);
    } else if (event.httpMethod === 'GET' && event.path === '/search') {
      return await searchPackages(event);
    } else {
      // Return a 404 response if the route is not recognized
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Route not found' }),
      };
    }
  } catch (error) {
    console.error('Unhandled error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'An unexpected error occurred' }),
    };
  }
};
