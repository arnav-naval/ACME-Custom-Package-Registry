import { uploadPackage, PackageData} from '../controllers/packageController.js';
import { APIGatewayProxyHandler, APIGatewayProxyEvent, Context } from 'aws-lambda';

//Function to process the request body of URL, Content, and JSProgram
const validateRequestBody = (body: PackageData): { isValid: boolean, error?: string } => {
  // Check if either URL or Content is provided
  if (!body.URL && !body.Content) {
   return {
     isValid: false,
     error: 'Missing required fields: Must provide either URL or Content',
   };
 }

 // Check if both URL and Content are provided (not allowed)
 if (body.URL && body.Content) {
   return {
     isValid: false,
     error: 'Cannot provide both URL and Content fields',
   };
 }

 //If all checks pass, return true
 return {
   isValid: true,
 }; 
};

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent, context: Context) => {
  try {
    console.log('Received event:', JSON.stringify(event, null, 2));

    let requestBody: PackageData;
    try {
      // Parse the body
      requestBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      console.log('Parsed request body:', JSON.stringify(requestBody, null, 2));
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Invalid JSON format in request',
          details: (parseError as Error).message,
        }),
      };
    }

    // Validate the request body
    const validationResult = validateRequestBody(requestBody);
    if (!validationResult.isValid) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: validationResult.error }),
      };
    }

    // Process the package upload
    const response = await uploadPackage(requestBody);

    // Return the correct structure: body should contain ONLY the relevant payload
    return {
      statusCode: 201, // Set the status code here
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metadata: {
          Name: requestBody.Name,
          Version: requestBody.Version,
          ID: response.ID, // Adjust based on your `uploadPackage` implementation
        },
        data: {
          Name: requestBody.Name,
          Version: response.PreviousVersion, // Adjust as necessary
          URL: response.URL, // Include the relevant fields here
        },
      }),
    };
  } catch (error) {
    console.error('Error in uploadPackageLambdaHandler:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'An unexpected error occurred' }),
    };
  }
};
