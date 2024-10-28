import { uploadPackageToS3 } from '../controllers/packageController.js';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { Context } from 'aws-lambda';


export const handler: APIGatewayProxyHandler = async (event, context: Context) => {
  try {
    return await uploadPackageToS3(event);
  } catch (error) {
    console.error('Unhandled error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'An unexpected error occurred' }),
    };
  }
};