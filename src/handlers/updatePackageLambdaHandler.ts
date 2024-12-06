import { APIGatewayProxyHandler, APIGatewayProxyEvent, Context } from 'aws-lambda';
import { updatePackageController } from '../controllers/updatePackageController.js';

/**
 * Validates the package ID using the specified regex pattern.
 * Ensures it adheres to the schema defined in the specification.
 */
export const validateId = (id: string): boolean => {
  const pattern = '^[a-zA-Z0-9\\-]+$'; // Matches alphanumeric characters and hyphens
  const regex = new RegExp(pattern);
  return regex.test(id);
};

/**
 * The Lambda handler for updating a package.
 * Validates the input, extracts the relevant data, and delegates logic to the controller.
 */
export const updatePackageHandler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context: Context
) => {
  try {
    // Extract `id` from the path parameters
    const packageId = event.pathParameters?.id;

    // Validate the `id` field
    if (!packageId || !validateId(packageId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'There is missing field(s) in the PackageID or it is formed improperly, or is invalid.',
        }),
      };
    }

    // Validate the request body
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Request body is missing or improperly formatted.',
        }),
      };
    }

    const requestBody = JSON.parse(event.body);

    // Validate that `metadata` and `data` fields exist
    const { metadata, data } = requestBody;
    if (!metadata || !data) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Request body is missing required fields: metadata and data.',
        }),
      };
    }

    // Validate the presence of either `Content` or `URL` in the `data` field
    const hasContent = !!data.Content;
    const hasURL = !!data.URL;

    if (hasContent && hasURL) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Provide either Content or URL, not both.',
        }),
      };
    }

    if (!hasContent && !hasURL) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Either Content or URL must be provided.',
        }),
      };
    }

    // Delegate logic to the controller
    const response = await updatePackageController(packageId, metadata, data);
    return response;
  } catch (error) {
    console.error('Error in updatePackageHandler:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error.',
      }),
    };
  }
};
