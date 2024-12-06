import { fetchPackageVersions } from '../controllers/fetchPackageVersionsController';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

describe('fetchPackageVersions', () => {
  const mockDynamoDBClient = {
    send: jasmine.createSpy('send'),
  };

  beforeEach(() => {
    // Reset the mock behavior before each test
    mockDynamoDBClient.send.calls.reset();
    spyOn(DynamoDBDocumentClient, 'from').and.returnValue(mockDynamoDBClient as any);
  });

  it('should return all versions for a package', async () => {
    const packageID = 'test-package';
    const mockResponse = { Items: [{ Version: '1.0.0' }, { Version: '1.2.3' }] };
    mockDynamoDBClient.send.and.returnValue(Promise.resolve(mockResponse));

    const result = await fetchPackageVersions(packageID);

    expect(result).toEqual({
      statusCode: 200,
      body: JSON.stringify(['1.0.0', '1.2.3']),
    });
    expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(1);
    expect(mockDynamoDBClient.send).toHaveBeenCalledWith(
      jasmine.any(QueryCommand)
    );
  });

  it('should return versions within a bounded range', async () => {
    const packageID = 'test-package';
    const mockResponse = { Items: [{ Version: '1.2.3' }, { Version: '2.0.0' }] };
    mockDynamoDBClient.send.and.returnValue(Promise.resolve(mockResponse));

    const result = await fetchPackageVersions(packageID, '1.2.0-2.1.0');

    expect(result).toEqual({
      statusCode: 200,
      body: JSON.stringify(['1.2.3', '2.0.0']),
    });
    expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(1);
  });

  it('should return an error for missing package ID', async () => {
    const result = await fetchPackageVersions('');

    expect(result).toEqual({
      statusCode: 400,
      body: JSON.stringify({ error: 'Package ID is required' }),
    });
    expect(mockDynamoDBClient.send).not.toHaveBeenCalled();
  });

  it('should return an error if no versions are found', async () => {
    const packageID = 'test-package';
    mockDynamoDBClient.send.and.returnValue(Promise.resolve({ Items: [] }));

    const result = await fetchPackageVersions(packageID);

    expect(result).toEqual({
      statusCode: 404,
      body: JSON.stringify({ error: 'No versions found for the specified package' }),
    });
    expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(1);
  });

  it('should handle unexpected errors gracefully', async () => {
    const packageID = 'test-package';
    mockDynamoDBClient.send.and.throwError('Unexpected error');

    const result = await fetchPackageVersions(packageID);

    expect(result).toEqual({
      statusCode: 500,
      body: JSON.stringify({ error: 'An unexpected error occurred' }),
    });
    expect(mockDynamoDBClient.send).toHaveBeenCalledTimes(1);
  });
});
