import { getPackage, getPackageFromMainTable } from '../../controllers/getPackageController.js';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

describe('getPackage Lambda Function', () => {
  let dynamoDbSpy: jasmine.Spy;

  beforeEach(() => {
    // Spy on DynamoDB client
    dynamoDbSpy = spyOn(DynamoDBClient.prototype, 'send');
  });

  it('should return 200 and package response for a valid packageId', async () => {
    const mockResponse = {
      Item: {
        Name: { S: 'Test Package' },
        Version: { S: '1.0.0' },
        PackageId: { S: '123' },
        JSProgram: { S: 'console.log("Hello World");' },
        Content: { S: 'Some content' },
      },
    };

    dynamoDbSpy.and.returnValue(Promise.resolve(mockResponse));

    const result = await getPackage('123');

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      metadata: {
        Name: 'Test Package',
        Version: '1.0.0',
        ID: '123',
      },
      data: {
        JSProgram: 'console.log("Hello World");',
        Content: 'Some content',
      },
    });
    expect(dynamoDbSpy).toHaveBeenCalled();
  });

  it('should return 404 when the package is not found', async () => {
    const mockResponse = { Item: null };

    dynamoDbSpy.and.returnValue(Promise.resolve(mockResponse));

    const result = await getPackage('nonexistent-id');

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: 'Package does not exist' });
    expect(dynamoDbSpy).toHaveBeenCalled();
  });

  it('should return 500 for unexpected errors', async () => {
    dynamoDbSpy.and.returnValue(Promise.reject(new Error('Unexpected DynamoDB error')));

    const result = await getPackage('123');

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'Internal server error' });
    expect(dynamoDbSpy).toHaveBeenCalled();
  });

  it('should handle valid input in getPackageFromMainTable', async () => {
    const mockResponse = {
      Item: {
        Name: { S: 'Test Package' },
        Version: { S: '1.0.0' },
        PackageId: { S: '123' },
        JSProgram: { S: 'console.log("Hello World");' },
        Content: { S: 'Some content' },
        URL: { S: 'https://example.com' },
      },
    };

    dynamoDbSpy.and.returnValue(Promise.resolve(mockResponse));

    const result = await getPackageFromMainTable('123');

    expect(result).toEqual({
      metadata: {
        Name: 'Test Package',
        Version: '1.0.0',
        ID: '123',
      },
      data: {
        JSProgram: 'console.log("Hello World");',
        Content: 'Some content',
        URL: 'https://example.com',
      },
    });
    expect(dynamoDbSpy).toHaveBeenCalled();
  });

  it('should throw an error if packageId does not exist in getPackageFromMainTable', async () => {
    const mockResponse = { Item: null };

    dynamoDbSpy.and.returnValue(Promise.resolve(mockResponse));

    await expectAsync(getPackageFromMainTable('nonexistent-id')).toBeRejectedWithError('Package not found');
    expect(dynamoDbSpy).toHaveBeenCalled();
  });
});


describe('getPackageFromMainTable', () => {
    let dynamoDbSpy: jasmine.Spy;
  
    beforeEach(() => {
      // Spy on the DynamoDB client's `send` method
      dynamoDbSpy = spyOn(DynamoDBClient.prototype, 'send');
    });
  
    it('should return a valid package response for a valid packageId', async () => {
      const mockResponse = {
        Item: marshall({
          Name: 'Test Package',
          Version: '1.0.0',
          PackageId: '123',
          JSProgram: 'console.log("Hello World");',
          Content: 'Some content',
          URL: 'https://example.com',
        }),
      };
  
      dynamoDbSpy.and.returnValue(Promise.resolve(mockResponse));
  
      const result = await getPackageFromMainTable('123');
  
      expect(result).toEqual({
        metadata: {
          Name: 'Test Package',
          Version: '1.0.0',
          ID: '123',
        },
        data: {
          JSProgram: 'console.log("Hello World");',
          Content: 'Some content',
          URL: 'https://example.com',
        },
      });
      expect(dynamoDbSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({
          input: {
            TableName: process.env.PACKAGES_TABLE_NAME,
            Key: marshall({ PackageId: '123' }),
          },
        })
      );
    });
  
    it('should return a package response with only non-null fields', async () => {
      const mockResponse = {
        Item: marshall({
          Name: 'Test Package',
          Version: '1.0.0',
          PackageId: '123',
          JSProgram: 'console.log("Hello World");',
        }),
      };
  
      dynamoDbSpy.and.returnValue(Promise.resolve(mockResponse));
  
      const result = await getPackageFromMainTable('123');
  
      expect(result).toEqual({
        metadata: {
          Name: 'Test Package',
          Version: '1.0.0',
          ID: '123',
        },
        data: {
          JSProgram: 'console.log("Hello World");',
        },
      });
      expect(dynamoDbSpy).toHaveBeenCalled();
    });
  
    it('should throw an error if the package does not exist', async () => {
      const mockResponse = { Item: null };
  
      dynamoDbSpy.and.returnValue(Promise.resolve(mockResponse));
  
      await expectAsync(getPackageFromMainTable('nonexistent-id')).toBeRejectedWithError('Package not found');
      expect(dynamoDbSpy).toHaveBeenCalled();
    });
  
    it('should throw an error for a DynamoDB failure', async () => {
      dynamoDbSpy.and.returnValue(Promise.reject(new Error('DynamoDB error')));
  
      await expectAsync(getPackageFromMainTable('123')).toBeRejectedWithError('DynamoDB error');
      expect(dynamoDbSpy).toHaveBeenCalled();
    });
  });
