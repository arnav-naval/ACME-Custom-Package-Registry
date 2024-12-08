import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDBDocClient = DynamoDBDocumentClient.from(dynamoDBClient);
const TABLE_NAME = "Packages";

/**
 * Searches packages using a regular expression on package names and README fields.
 * 
 * @param event - API Gateway event containing the regex in the request body
 * @returns APIGatewayProxyResult - List of matching packages or error message
 */
export const searchPackages = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing request body' }),
      };
    }

    const body = JSON.parse(event.body);
    const { RegEx } = body;
    if (!RegEx) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid or missing RegEx field' }),
      };
    }

    // Attempt to compile the regex and catch any errors
    let regexPattern;
    try {
      regexPattern = new RegExp(RegEx);
    } catch (error) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'There is missing field(s) in the PackageRegEx or it is formed improperly, or is invalid' }),
      };
    }

    const params = {
      TableName: TABLE_NAME,
      ProjectionExpression: "#name, Version, PackageID, ReadMe",
      ExpressionAttributeNames: {
        "#name": "Name", // Escaping reserved keyword
      },
    };
    const result = await dynamoDBDocClient.send(new ScanCommand(params));
    const matchedPackages = (result.Items || []).filter(pkg =>
      regexPattern.test(pkg.Name) || (pkg.ReadMe && regexPattern.test(pkg.ReadMe))
    );
    
    if (matchedPackages.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'No package found under this regex' }),
      };
    }

    const response = matchedPackages.map(pkg => ({
      Name: pkg.Name,
      Version: pkg.Version,
      ID: pkg.PackageID,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Error searching packages by RegEx:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
