import { resetRegistry } from '../controllers/resetController';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

describe('resetRegistry', () => {
  const mockAuthToken = 'valid-token';
  const invalidAuthToken = '';

  // Mock the DynamoDB Document Client
  const sendMock = jasmine.createSpy('send');
  const mockDynamoDBClient = {
    send: sendMock,
  };

  beforeEach(() => {
    sendMock.calls.reset();
    spyOn(DynamoDBDocumentClient, 'from').and.returnValue(mockDynamoDBClient as any);

    // Ensure AUTH_TOKEN is available for testing
    process.env.AUTH_TOKEN = mockAuthToken;
  });

  afterEach(() => {
    // Clean up environment variable
    delete process.env.AUTH_TOKEN;
  });

  it('should return a 403 response if authToken is missing', async () => {
    const response = await resetRegistry(invalidAuthToken);
    expect(response).toEqual({
      statusCode: 403,
      body: JSON.stringify({ error: 'Missing or invalid authentication token' }),
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('should clear the DynamoDB table if authToken is valid', async () => {
    sendMock.and.returnValue(Promise.resolve());

    const response = await resetRegistry(mockAuthToken);

    expect(response).toEqual({
      statusCode: 200,
      body: JSON.stringify({ message: 'Registry reset successfully' }),
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      jasmine.any(DeleteCommand)
    );
  });

  it('should return a 401 response if the token is invalid', async () => {
    const response = await resetRegistry('invalid-token');

    expect(response).toEqual({
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized access' }),
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('should handle errors thrown during DynamoDB operations', async () => {
    sendMock.and.throwError('DynamoDB error');

    const response = await resetRegistry(mockAuthToken);

    expect(response).toEqual({
      statusCode: 500,
      body: JSON.stringify({ error: 'An unexpected error occurred' }),
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
