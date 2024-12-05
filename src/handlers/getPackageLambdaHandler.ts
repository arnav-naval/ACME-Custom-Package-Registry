import { APIGatewayProxyHandler, APIGatewayProxyEvent, Context } from 'aws-lambda';
import { getPackage } from '../controllers/getPackageController.js';

//Validate id with regex pattern
export const validateId = (id: string): boolean => {
    //Assert that id is in the pattern '^[a-zA-Z0-9\-]+$'
    const pattern = '^[a-zA-Z0-9\-]+$';
    const regex = new RegExp(pattern);
    return regex.test(id);
}

/**
 * Lambda handler for getting a package by id
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent, context: Context) => {
  try {
    const packageId = event.pathParameters?.id;

    if (!packageId || !validateId(packageId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'There is missing field(s) in the PackageID or it is formed improperly, or is invalid.' 
        }),
      };
    }

    return await getPackage(packageId);

  } catch (error) {
    console.error('Error in getPackage handler:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error while getting package'
      })
    };
  }
};