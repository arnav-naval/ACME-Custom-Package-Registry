import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import * as semver from "semver";

// Initialize DynamoDB client
const dynamoDBClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const TABLE_NAME = "Packages";

export const fetchPackageVersions = async (id: string, versionRange?: string) => {
  try {
    // Query to fetch package data based on package ID
    const params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: "PackageID = :id",
      ExpressionAttributeValues: {
        ":id": id,
      },
    };

    const result = await dynamoDBClient.send(new QueryCommand(params));

    if (!result.Items || result.Items.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Package not found" }),
      };
    }

    // Extract versions from results
    const versions = result.Items.map(item => item.Version);

    // If a versionRange is provided, filter the versions
    const filteredVersions = versionRange ? filterVersions(versions, versionRange) : versions;

    return {
      statusCode: 200,
      body: JSON.stringify({ versions: filteredVersions }),
    };
  } catch (error) {
    console.error("Error fetching package versions:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "An unexpected error occurred" }),
    };
  }
};

// Helper function to filter versions based on the range
const filterVersions = (versions: string[], versionRange: string): string[] => {
  if (semver.valid(versionRange)) {
    // Exact match
    return versions.filter(version => semver.eq(version, versionRange));
  } else if (semver.validRange(versionRange)) {
    // Range match
    return versions.filter(version => semver.satisfies(version, versionRange));
  } else {
    throw new Error("Invalid version range");
  }
};
