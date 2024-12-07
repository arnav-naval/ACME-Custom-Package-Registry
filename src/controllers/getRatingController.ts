import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyResult } from 'aws-lambda';

// Initialize clients 
const dynamoDb = new DynamoDBClient({
    region: process.env.AWS_REGION,
  });

  //Create a package response interface
interface PackageRating {
    Correctness: number;
    RampUp: number;
    BusFactor: number;
    ResponsiveMaintainer: number;
    LicenseScore: number;
    GoodPinningPractice: number;
    PullRequest: number;
    NetScore: number;
    RampUpLatency: number;
    CorrectnessLatency: number;
    BusFactorLatency: number;
    ResponsiveMaintainerLatency: number;
    LicenseScoreLatency: number;
    GoodPinningPracticeLatency: number;
    PullRequestLatency: number;
    NetScoreLatency: number;
};

// Function to get package rating from scores table
export const getPackageRating = async (packageId: string): Promise<APIGatewayProxyResult> => {
    try {
      // Get package rating from DynamoDB
      const params = {
        TableName: process.env.SCORES_TABLE_NAME,
        Key: marshall({ id: packageId }),
      };
  
      const command = new GetItemCommand(params);
      const response = await dynamoDb.send(command);
  
      // Check if package exists
      if (!response.Item) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'Package not found' }),
        };
      }
  
      // Unmarshall the DynamoDB response
      const item = unmarshall(response.Item);
  
      // Format the response according to the PackageRating schema
      const rating: PackageRating = {
        BusFactor: item.scores.BusFactor,
        BusFactorLatency: item.scores.BusFactorLatency,
        Correctness: item.scores.Correctness,
        CorrectnessLatency: item.scores.CorrectnessLatency,
        RampUp: item.scores.RampUp,
        RampUpLatency: item.scores.RampUpLatency,
        ResponsiveMaintainer: item.scores.ResponsiveMaintainer,
        ResponsiveMaintainerLatency: item.scores.ResponsiveMaintainerLatency,
        LicenseScore: item.scores.LicenseScore,
        LicenseScoreLatency: item.scores.LicenseScoreLatency,
        GoodPinningPractice: item.scores.GoodPinningPractice,
        GoodPinningPracticeLatency: item.scores.GoodPinningPracticeLatency,
        PullRequest: item.scores.PullRequest,
        PullRequestLatency: item.scores.PullRequestLatency,
        NetScore: item.scores.NetScore,
        NetScoreLatency: item.scores.NetScoreLatency,
      };
  
      // Validate all required fields are present, if not set to -1
      const requiredFields = [
        'NetScore', 'BusFactor', 'Correctness', 'RampUp',
        'ResponsiveMaintainer', 'LicenseScore', 'GoodPinningPractice', 'PullRequest', 
        'RampUpLatency', 'CorrectnessLatency', 'BusFactorLatency', 'ResponsiveMaintainerLatency',
        'LicenseScoreLatency', 'GoodPinningPracticeLatency', 'PullRequestLatency', 'NetScoreLatency'
      ];
  
      for (const field of requiredFields) {
        if (rating[field] === undefined || rating[field] === null) {
          rating[field] = -1;
        }
      }
  
      return {
        statusCode: 200,
        body: JSON.stringify(rating),
      };
    } catch (error) {
        // Handle potential errors
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' }),
        };
    }
};