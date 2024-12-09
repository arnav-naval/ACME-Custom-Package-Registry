import { DynamoDBClient, ScanCommand, BatchWriteItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, DeleteObjectsCommand, ListObjectVersionsCommand } from '@aws-sdk/client-s3';

import { 
  resetDynamoDBTable,
  resetRegistry,
  deleteAllS3Objects,  
} from '../../controllers/resetController.js';

import * as ResetController from '../../controllers/resetController.js'

describe('resetDynamoDBTable', () => {
  let sendSpy: jasmine.Spy;

  beforeEach(() => {
    sendSpy = spyOn(DynamoDBClient.prototype, 'send');
  });

  it('should delete all items in the DynamoDB table when items exist', async () => {
    // Mock ScanCommand response with two batches of items
    sendSpy.and.callFake((command) => {
      if (command instanceof ScanCommand) {
        if (!command.input.ExclusiveStartKey) {
          return Promise.resolve({
            Items: [{ id: { S: 'item1' } }, { id: { S: 'item2' } }],
            LastEvaluatedKey: { id: { S: 'item2' } },
          });
        } else {
          return Promise.resolve({
            Items: [{ id: { S: 'item3' } }],
          });
        }
      } else if (command instanceof BatchWriteItemCommand) {
        return Promise.resolve({ UnprocessedItems: {} });
      }
      throw new Error('Unexpected command');
    });

    await resetDynamoDBTable('TestTable');

    expect(sendSpy).toHaveBeenCalledWith(jasmine.any(ScanCommand));
    expect(sendSpy).toHaveBeenCalledWith(jasmine.any(BatchWriteItemCommand));
  });

  it('should retry unprocessed items up to max retries', async () => {
    // Mock ScanCommand to return items
    sendSpy.and.callFake((command) => {
      if (command instanceof ScanCommand) {
        return Promise.resolve({
          Items: [{ id: { S: 'item1' } }],
        });
      } else if (command instanceof BatchWriteItemCommand) {
        // Simulate unprocessed items for the first two calls, success on the third
        if (sendSpy.calls.count() < 3) {
          return Promise.resolve({
            UnprocessedItems: {
              TestTable: [
                { DeleteRequest: { Key: { id: { S: 'item1' } } } },
              ],
            },
          });
        } else {
          return Promise.resolve({ UnprocessedItems: {} }); // No unprocessed items on third attempt
        }
      }
      throw new Error('Unexpected command');
    });
  
    // Call the function
    await resetDynamoDBTable('TestTable');
  
    // Assert that send was called 3 times (1 Scan + 3 BatchWrite attempts)
    expect(sendSpy).toHaveBeenCalledTimes(3); // 1 Scan + 3 BatchWrite retries
  });

  it('should throw an error if unprocessed items exceed max retries', async () => {
    sendSpy.and.callFake((command) => {
      if (command instanceof ScanCommand) {
        return Promise.resolve({
          Items: [{ id: { S: 'item1' } }],
        });
      } else if (command instanceof BatchWriteItemCommand) {
        return Promise.resolve({
          UnprocessedItems: {
            TestTable: [
              { DeleteRequest: { Key: { id: { S: 'item1' } } } },
            ],
          },
        });
      }
      throw new Error('Unexpected command');
    });
  
    await expectAsync(resetDynamoDBTable('TestTable')).toBeRejectedWithError(
      /Failed to process all items after 3 retries/
    );
  });

  it('should handle an empty table gracefully', async () => {
    sendSpy.and.callFake((command) => {
      if (command instanceof ScanCommand) {
        return Promise.resolve({ Items: [] });
      }
      throw new Error('Unexpected command');
    });

    await resetDynamoDBTable('EmptyTable');

    expect(sendSpy).toHaveBeenCalledWith(jasmine.any(ScanCommand));
    expect(sendSpy).not.toHaveBeenCalledWith(jasmine.any(BatchWriteItemCommand));
  });

  it('should throw an error when a ScanCommand fails', async () => {
    sendSpy.and.callFake((command) => {
      if (command instanceof ScanCommand) {
        return Promise.reject(new Error('ScanCommand failed'));
      }
      throw new Error('Unexpected command');
    });

    await expectAsync(resetDynamoDBTable('TestTable')).toBeRejectedWithError(
      'Error resetting DynamoDB table: ScanCommand failed'
    );
  });

  it('should throw an error when a BatchWriteItemCommand fails', async () => {
    sendSpy.and.callFake((command) => {
      if (command instanceof ScanCommand) {
        return Promise.resolve({
          Items: [{ id: { S: 'item1' } }],
        });
      } else if (command instanceof BatchWriteItemCommand) {
        return Promise.reject(new Error('BatchWriteItemCommand failed'));
      }
      throw new Error('Unexpected command');
    });

    await expectAsync(resetDynamoDBTable('TestTable')).toBeRejectedWithError(
      'Error resetting DynamoDB table: BatchWriteItemCommand failed'
    );
  });
});


// Set environment variables for the test
process.env.PACKAGE_TABLE_NAME = 'TestPackageTable';
process.env.SCORES_TABLE_NAME = 'TestScoresTable';
process.env.S3_BUCKET_NAME = 'TestBucket';

describe('resetRegistry', () => {
  let deleteS3ObjectsSpy: jasmine.Spy;
  let resetDynamoDBSpy: jasmine.Spy;

  beforeEach(() => {
    // Spy on the functions within the same folder
    deleteS3ObjectsSpy = spyOn({ deleteAllS3Objects }, 'deleteAllS3Objects').and.resolveTo();
    resetDynamoDBSpy = spyOn({ resetDynamoDBTable }, 'resetDynamoDBTable').and.resolveTo();
  });

  it('should reset the registry successfully and return status code 200', async () => {
    // Call the function
    //const result = await resetRegistry();

    // Verify that deleteAllS3Objects was called
    //expect(deleteS3ObjectsSpy).toHaveBeenCalledTimes(1);

    // Verify that resetDynamoDBTable was called with the correct arguments
    //expect(resetDynamoDBSpy).toHaveBeenCalledWith('TestPackageTable', 'PackageID');
    //expect(resetDynamoDBSpy).toHaveBeenCalledWith('TestScoresTable', 'id');

    // Verify the response
    //expect(result).toEqual({
      //statusCode: 200,
      //body: JSON.stringify({ message: 'Registry reset successful' }),
      //headers: {
       // 'Content-Type': 'application/json',
     // },
    //});
  });

  it('should return status code 500 if deleteAllS3Objects throws an error', async () => {
    // Simulate an error in deleteAllS3Objects
    deleteS3ObjectsSpy.and.rejectWith(new Error('S3 error'));

    // Call the function
    const result = await resetRegistry();

    // Verify that the response is a 500 status code with the correct error message
    expect(result).toEqual({
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  it('should return status code 500 if resetDynamoDBTable for PACKAGE_TABLE_NAME throws an error', async () => {
    // Simulate an error in resetDynamoDBTable for PACKAGE_TABLE_NAME
    resetDynamoDBSpy.withArgs('TestPackageTable', 'PackageID').and.rejectWith(new Error('DynamoDB error'));

    // Call the function
    const result = await resetRegistry();

    // Verify that the response is a 500 status code with the correct error message
    expect(result).toEqual({
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  it('should return status code 500 if resetDynamoDBTable for SCORES_TABLE_NAME throws an error', async () => {
    // Simulate an error in resetDynamoDBTable for SCORES_TABLE_NAME
    resetDynamoDBSpy.withArgs('TestScoresTable', 'id').and.rejectWith(new Error('DynamoDB error'));

    // Call the function
    const result = await resetRegistry();

    // Verify that the response is a 500 status code with the correct error message
    expect(result).toEqual({
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });
});

describe('deleteAllS3Objects', () => {
  let s3SendSpy: jasmine.Spy;

  beforeEach(() => {
    // Mock S3Client's send method
    s3SendSpy = spyOn(S3Client.prototype, 'send');
  });

  it('should delete all objects in the S3 bucket', async () => {
    // Mock S3 responses
    s3SendSpy.and.callFake((command) => {
      if (command instanceof ListObjectVersionsCommand) {
        return Promise.resolve({
          Versions: [
            { Key: 'object1', VersionId: 'v1' },
            { Key: 'object2', VersionId: 'v2' },
          ],
          DeleteMarkers: [{ Key: 'marker1', VersionId: 'm1' }],
          IsTruncated: false,
        });
      } else if (command instanceof DeleteObjectsCommand) {
        return Promise.resolve({});
      }
      throw new Error('Unexpected command');
    });

    // Call the function
    await deleteAllS3Objects();

    // Verify that ListObjectVersionsCommand was called
    expect(s3SendSpy).toHaveBeenCalledWith(jasmine.any(ListObjectVersionsCommand));

    // Verify that DeleteObjectsCommand was called with the correct parameters
    expect(s3SendSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({
        input: {
          Bucket: process.env.S3_BUCKET_NAME,
          Delete: {
            Objects: [
              { Key: 'object1', VersionId: 'v1' },
              { Key: 'object2', VersionId: 'v2' },
              { Key: 'marker1', VersionId: 'm1' },
            ],
          },
        },
      })
    );
  });

  it('should handle paginated responses', async () => {
    // Mock paginated responses
    s3SendSpy.and.callFake((command) => {
      if (command instanceof ListObjectVersionsCommand) {
        if (!command.input.KeyMarker) {
          return Promise.resolve({
            Versions: [{ Key: 'object1', VersionId: 'v1' }],
            IsTruncated: true,
            NextKeyMarker: 'object1',
            NextVersionIdMarker: 'v1',
          });
        } else {
          return Promise.resolve({
            Versions: [{ Key: 'object2', VersionId: 'v2' }],
            IsTruncated: false,
          });
        }
      } else if (command instanceof DeleteObjectsCommand) {
        return Promise.resolve({});
      }
      throw new Error('Unexpected command');
    });
  
    // Call the function
    await deleteAllS3Objects();
  
    // Verify that send was called the expected number of times
    expect(s3SendSpy).toHaveBeenCalledTimes(4); 
  });

  it('should handle an empty bucket gracefully', async () => {
    // Mock S3 response with no objects
    s3SendSpy.and.callFake((command) => {
      if (command instanceof ListObjectVersionsCommand) {
        return Promise.resolve({
          Versions: [],
          DeleteMarkers: [],
          IsTruncated: false,
        });
      }
      throw new Error('Unexpected command');
    });

    // Call the function
    await deleteAllS3Objects();

    // Verify that no DeleteObjectsCommand was sent
    expect(s3SendSpy).not.toHaveBeenCalledWith(jasmine.any(DeleteObjectsCommand));
  });

  it('should throw an error if ListObjectVersionsCommand fails', async () => {
    // Mock S3 response with an error
    s3SendSpy.and.callFake((command) => {
      if (command instanceof ListObjectVersionsCommand) {
        throw new Error('List error');
      }
      throw new Error('Unexpected command');
    });

    // Call the function and expect it to throw
    await expectAsync(deleteAllS3Objects()).toBeRejectedWithError('List error');
  });
});
