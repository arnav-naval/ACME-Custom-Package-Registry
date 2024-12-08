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
      // Handle both direct JSON and body-wrapped JSON
      if (event.body) {
        requestBody = typeof event.body === 'string' 
          ? JSON.parse(event.body) 
          : event.body;
      } else {
        // If no body property, treat the entire event as the request
        requestBody = event as unknown as PackageData;
      }
      
      console.log('Parsed request body:', JSON.stringify(requestBody, null, 2));
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Invalid JSON format in request',
          details: (parseError as Error).message
        }),
      };
    }

    const validationResult = validateRequestBody(requestBody);
    console.log('Validation result:', validationResult);
    
    //Check if validation fails
    if (!validationResult.isValid) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: validationResult.error }),
      };
    }

    //Upload package to S3
    const response = await uploadPackage(requestBody);
    return {
      statusCode: response.statusCode, 
      body: response.body,
      headers: { 'Content-Type': 'application/json' }
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