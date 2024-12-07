import { DynamoDBClient, ScanCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
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

interface GetPackagesOptions {
  queries: PackageQuery[];
  offset?: string;
  pageSize?: number;
}

//Function that gets packages based on query criteria with pagination
export const getPackages = async (options: GetPackagesOptions): Promise<APIGatewayProxyResult> => {
  const { queries, offset, pageSize = 10 } = options;

  try {
    // Validate queries
    if (!Array.isArray(queries) || queries.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid query format' })
      };
    }

    const startIndex = offset ? parseInt(offset, 10) : 0;
    
    if (isNaN(startIndex) || startIndex < 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid offset parameter' })
      };
    }

    let packages: PackageMetadata[] = [];
    
    // Handle enumerate all packages case
    if (queries.length === 1 && queries[0].Name === '*') {
      const result = await getAllPackages(startIndex, pageSize);
      packages = result.items.map(p => p.metadata);
      
      return {
        statusCode: 200,
        body: JSON.stringify(packages),
        headers: {
          offset: (startIndex + packages.length).toString()
        }
      };
    }

    // Handle specific package queries
    for (const query of queries) {
      if (!isValidPackageQuery(query)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Malformed package query' })
        };
      }

      const result = await queryPackages(query, startIndex, pageSize);
      packages.push(...result.items.map(p => p.metadata));
    }

    // Check for too many results
    if (packages.length > MAX_RESULTS) {
      return {
        statusCode: 413,
        body: JSON.stringify({ error: 'Too many packages returned' })
      };
    }

    // Remove duplicates if any
    const uniquePackages = Array.from(
      new Map(packages.map(p => [`${p.Name}-${p.Version}`, p])).values()
    );

    return {
      statusCode: 200,
      body: JSON.stringify(uniquePackages),
      headers: {
        offset: (startIndex + uniquePackages.length).toString()
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

// Helper function for enumerating all packages
async function getAllPackages(
  startIndex: number,
  pageSize: number
): Promise<PaginatedResponse<{ metadata: PackageMetadata }>> {
  const params = {
    TableName: PACKAGES_TABLE_NAME,
    Limit: pageSize
  };

  const result = await dynamoDb.send(new ScanCommand(params));
  const packages = result.Items?.map(item => unmarshallPackage(item)) || [];

  return {
    items: packages,
    nextOffset: packages.length >= pageSize ? 
      (startIndex + pageSize).toString() : undefined
  };
}

async function queryPackages(
  query: PackageQuery, 
  startIndex: number, 
  pageSize: number
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
        Limit: pageSize
      };

      const result = await dynamoDb.send(new QueryCommand(params));
      const packages = result.Items?.map(item => unmarshallPackage(item)) || [];

      return {
        items: packages,
        nextOffset: packages.length >= pageSize ? 
          (startIndex + pageSize).toString() : undefined
      };
    }

    // For semver ranges
    const MAX_ITEMS = 1000; // Safeguard against excessive memory usage
    let allVersions: PackageResponse[] = [];
    let currentBatch: PackageResponse[] = [];
    
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
        Limit: pageSize * 2 // Fetch extra to account for filtering
      };

      const result = await dynamoDb.send(new QueryCommand(params));
      currentBatch = (result.Items?.map(item => unmarshallPackage(item)) || [])
        .filter(pkg => semver.satisfies(pkg.metadata.Version, query.Version || '*'));
      
      allVersions = [...allVersions, ...currentBatch];

      // Safety check
      if (allVersions.length > MAX_ITEMS) {
        throw new Error(`Query would return too many results (over ${MAX_ITEMS} items)`);
      }

    } while (
      currentBatch.length > 0 && 
      allVersions.length < startIndex + pageSize
    );

    const paginatedPackages = allVersions.slice(startIndex, startIndex + pageSize);
    
    return {
      items: paginatedPackages,
      nextOffset: allVersions.length > startIndex + pageSize ? 
        (startIndex + pageSize).toString() : undefined
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