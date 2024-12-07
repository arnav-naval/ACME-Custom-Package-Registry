import { DynamoDBClient, GetItemCommand, ScanCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyResult } from 'aws-lambda';
import semver from 'semver';

const PACKAGES_TABLE_NAME = "Packages";
const MAX_RESULTS = 100; // Threshold for 413 error

// Initialize clients 
const dynamoDb = new DynamoDBClient({
  region: process.env.AWS_REGION,
});

interface PackageMetadata {
  Name: string;
  Version: string;
  ID: string;
}

interface PackageResponse {
  metadata: PackageMetadata;
}

interface PaginatedResponse<T> {
  items: T[];
  nextOffset?: string;
}

// Add new interfaces
interface PackageQuery {
  Name: string;
  Version?: string;
}

//Function that gets packages based on query criteria with pagination
export const getPackages = async (queries: PackageQuery[], offset?: string): Promise<APIGatewayProxyResult> => {
  try {
    // Validate queries
    if (!Array.isArray(queries) || queries.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid query format' })
      };
    }

    const pageSize = 10;
    const startIndex = offset ? parseInt(offset, 10) : 0;
    
    if (isNaN(startIndex) || startIndex < 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid offset parameter' })
      };
    }

    let packages: PackageMetadata[] = [];
    
    // Modify the response format to match API spec
    const formatResponse = (packages: PackageMetadata[]) => {
      return packages.map(p => ({
        Version: p.Version,
        Name: p.Name,
        ID: p.ID
      }));
    };

    // Handle get all packages case
    if (queries.length === 1 && queries[0].Name === '*') {
      const allPackages = await getAllPackages(startIndex, pageSize);
      
      // Check for too many results
      if (allPackages.packages.length > MAX_RESULTS) {
        return {
          statusCode: 413,
          body: JSON.stringify({ error: 'Too many packages returned' })
        };
      }

      return {
        statusCode: 200,
        body: JSON.stringify(formatResponse(allPackages.packages.map(p => p.metadata))),
        headers: {
          offset: allPackages.nextOffset?.toString() || ''
        }
      };
    }

    // Handle specific package queries
    for (const query of queries) {
      // Validate query format
      if (!isValidPackageQuery(query)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Malformed package query' })
        };
      }

      const matchingPackages = await queryPackages(query, startIndex, pageSize);
      packages.push(...matchingPackages.items.map(p => p.metadata));
    }

    // Check for too many results
    if (packages.length > MAX_RESULTS) {
      return {
        statusCode: 413,
        body: JSON.stringify({ error: 'Too many packages returned' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(formatResponse(packages)),
      headers: {
        offset: (startIndex + pageSize).toString()
      }
    };

  } catch (error) {
    console.error('Error getting packages:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

function isValidPackageQuery(query: PackageQuery): boolean {
  if (!query.Name || typeof query.Name !== 'string') {
    return false;
  }

  if (query.Version) {
    // Validate version format if provided
    if (!semver.validRange(query.Version)) {
      return false;
    }
  }

  return true;
}

async function getAllPackages(startIndex: number, pageSize: number): Promise<{ packages: { metadata: PackageMetadata }[]; nextOffset?: number }> {
  let currentIndex = 0;
  let packages: PackageResponse[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;

  // Keep scanning until we reach the desired start index
  do {
    const params = {
      TableName: process.env.PACKAGES_TABLE_NAME,
      Limit: pageSize,
      ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey })
    };

    const result = await dynamoDb.send(new ScanCommand(params));
    const currentBatch = result.Items?.map(item => {
      const unmarshalledItem = unmarshall(item);
      return {
        metadata: {
          Name: unmarshalledItem.Name,
          Version: unmarshalledItem.Version,
          ID: unmarshalledItem.PackageID,
        }
      };
    }) || [];

    currentIndex += currentBatch.length;
    packages = packages.concat(currentBatch);
    lastEvaluatedKey = result.LastEvaluatedKey;

  } while (lastEvaluatedKey && currentIndex < startIndex + pageSize);

  // Slice the results to get the exact page we want
  const paginatedPackages = packages.slice(startIndex, startIndex + pageSize);

  return {
    packages: paginatedPackages,
    nextOffset: packages.length >= startIndex + pageSize ? startIndex + pageSize : undefined
  };
}

async function queryPackages(
  query: PackageQuery, 
  startIndex: number, 
  pageSize: number,
  paginationToken?: string
): Promise<PaginatedResponse<{ metadata: PackageMetadata }>> {
  if (!query.Name) {
    throw new Error('Package name is required');
  }

  try {
    // If no version specified or exact version match, use direct query
    if (!query.Version || !isSemverRange(query.Version)) {
      const params = {
        TableName: PACKAGES_TABLE_NAME,
        IndexName: query.Version ? 'Name-Version-Index' : 'Name-Index',
        KeyConditionExpression: query.Version ? 
          '#name = :nameVal AND #version = :versionVal' : 
          '#name = :nameVal',
        ExpressionAttributeNames: {
          '#name': 'Name',
          ...(query.Version && { '#version': 'Version' })
        },
        ExpressionAttributeValues: marshall({
          ':nameVal': query.Name,
          ...(query.Version && { ':versionVal': query.Version })
        }),
        Limit: pageSize,
        ...(paginationToken && { 
          ExclusiveStartKey: JSON.parse(
            Buffer.from(paginationToken, 'base64').toString()
          )
        })
      };

      const result = await dynamoDb.send(new QueryCommand(params));
      const packages = result.Items?.map(item => unmarshallPackage(item)) || [];

      // Encode LastEvaluatedKey as base64 if it exists
      const nextToken = result.LastEvaluatedKey 
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : undefined;

      return {
        items: packages,
        nextOffset: nextToken
      };
    }

    // For semver ranges, we need to handle pagination differently
    let allVersions: PackageResponse[] = [];
    let lastEvaluatedKey = paginationToken 
      ? JSON.parse(Buffer.from(paginationToken, 'base64').toString())
      : undefined;
    
    // Keep fetching until we have enough matching versions or run out of items
    do {
      const params = {
        TableName: PACKAGES_TABLE_NAME,
        IndexName: 'Name-Index',
        KeyConditionExpression: '#name = :nameVal',
        ExpressionAttributeNames: {
          '#name': 'Name'
        },
        ExpressionAttributeValues: marshall({
          ':nameVal': query.Name
        }),
        Limit: pageSize * 2, // Fetch more items since we'll filter some out
        ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey })
      };

      const result = await dynamoDb.send(new QueryCommand(params));
      const batchVersions = result.Items?.map(item => unmarshallPackage(item)) || [];
      
      // Filter matching versions
      const matchingBatch = batchVersions.filter(pkg => 
        semver.satisfies(pkg.metadata.Version, query.Version || '*')
      );
      
      allVersions = [...allVersions, ...matchingBatch];
      lastEvaluatedKey = result.LastEvaluatedKey;

      // Continue if we don't have enough matching versions and there are more results
    } while (
      lastEvaluatedKey && 
      allVersions.length < startIndex + pageSize
    );

    // Handle pagination of the filtered results
    const paginatedPackages = allVersions.slice(startIndex, startIndex + pageSize);
    
    // Only return a next token if we have more matching results
    const nextToken = (allVersions.length > startIndex + pageSize && lastEvaluatedKey)
      ? Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64')
      : undefined;

    return {
      items: paginatedPackages,
      nextOffset: nextToken
    };

  } catch (error) {
    console.error('Error querying DynamoDB:', error);
    throw new Error('Failed to query packages');
  }
}

// Helper function to detect if a version string is a semver range
function isSemverRange(version: string): boolean {
  try {
    // First check if it's a valid version
    if (semver.valid(version)) {
      return false;
    }

    // Then check if it's a valid range
    return semver.validRange(version) !== null;
  } catch (error) {
    return false;
  }
}

// Add utility function for consistent item unmarshalling
function unmarshallPackage(item: Record<string, any>): PackageResponse {
  const unmarshalledItem = unmarshall(item);
  return {
    metadata: {
      Name: unmarshalledItem.Name,
      Version: unmarshalledItem.Version,
      ID: unmarshalledItem.PackageID,
    }
  };
}