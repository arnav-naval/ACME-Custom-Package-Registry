import { searchPackages } from '../controllers/searchController';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

describe('searchPackages', () => {
  let sendSpy: jasmine.Spy;

  beforeEach(() => {
    sendSpy = spyOn(DynamoDBDocumentClient.prototype, 'send');
  });

  it('should return matching packages when valid RegEx is provided', async () => {
    // Mock DynamoDB response with items matching the regex pattern
    sendSpy.and.returnValue(Promise.resolve({
      Items: [
        { PackageName: 'Underscore', Version: '1.2.3', README: 'A useful library' },
        { PackageName: 'Lodash', Version: '1.2.3-2.1.0', README: 'A similar library' }
      ]
    }));

    const event = { body: JSON.stringify({ RegEx: '.*?Underscore.*|.*?Lodash.*' }) };

    const result = await searchPackages(event as any);

    // Check that we have two items in the result and they match exactly
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([
      { Name: 'Underscore', Version: '1.2.3' },
      { Name: 'Lodash', Version: '1.2.3-2.1.0' }
    ]);
});


  it('should return 404 if no packages match the regex', async () => {
    sendSpy.and.returnValue(Promise.resolve({ Items: [] })); // No matches

    const event = { body: JSON.stringify({ RegEx: 'NonExistentPackage' }) };

    const result = await searchPackages(event as any);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: 'No package found under this regex' });
  });

  it('should return 400 if RegEx field is missing', async () => {
    const event = { body: JSON.stringify({}) }; // Missing RegEx field

    const result = await searchPackages(event as any);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'Invalid or missing RegEx field' });
  });

  it('should return 400 if request body is missing', async () => {
    const event = {}; // No body in event

    const result = await searchPackages(event as any);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'Missing request body' });
  });

  it('should handle invalid regex patterns gracefully', async () => {
    const event = { body: JSON.stringify({ RegEx: '[' }) }; // Invalid regex pattern

    const result = await searchPackages(event as any);

    // Check that the response code is 400 and the error message is correct
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'Invalid regular expression' });
});



  it('should return 500 if DynamoDB scan fails', async () => {
    sendSpy.and.returnValue(Promise.reject(new Error('DynamoDB error')));

    const event = { body: JSON.stringify({ RegEx: '.*' }) };

    const result = await searchPackages(event as any);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'Internal server error' });
  });
});
