import { S3Client, PutObjectCommand, PutObjectCommandOutput } from '@aws-sdk/client-s3';
import { uploadBase64ZipToS3 } from '../../controllers/packageController';

describe('packageController', () => {
  let s3SendSpy: jasmine.Spy;

  beforeEach(() => {
    process.env.BUCKET_NAME = 'test-bucket';
    
    s3SendSpy = spyOn(S3Client.prototype as any, 'send').and.resolveTo({
      $metadata: {},
      ETag: 'test-etag'
    } as unknown as PutObjectCommandOutput);
});

  describe('uploadBase64ZipToS3', () => {
    // Test 1: Happy Path
    it('should successfully upload a valid base64 string', async () => {
      // Creates a simple base64 string from 'test data'
      const testBase64 = Buffer.from('test data').toString('base64');
      const testKey = 'test-key.zip';
  
      // Verifies the upload completes without error
      await expectAsync(uploadBase64ZipToS3(testBase64, testKey)).toBeResolved();
  
      // Verifies S3 client was called exactly once
      expect(s3SendSpy).toHaveBeenCalledTimes(1);
      
      // Verifies the S3 command was constructed correctly with all required parameters
      const command = s3SendSpy.calls.first().args[0] as PutObjectCommand;
      expect(command.input).toEqual({
        Bucket: 'test-bucket',
        Key: testKey,
        Body: jasmine.any(Buffer),          // Verifies body is a Buffer
        ContentType: 'application/zip',      // Correct MIME type for zip
        ContentEncoding: 'base64',          // Indicates content is base64 encoded
        Metadata: jasmine.objectContaining({
          uploadTimestamp: jasmine.any(String)  // Verifies timestamp is included
        })
      });
    });
  
    // Test 2: Empty Input Validation
    it('should throw error for missing base64 string', async () => {
      // Verifies that empty base64 string is rejected
      await expectAsync(uploadBase64ZipToS3('', 'test-key.zip'))
        .toBeRejectedWithError('base64String is required');
    });
  
    // Test 3: Empty Key Validation
    it('should throw error for missing s3Key', async () => {
      const testBase64 = Buffer.from('test data').toString('base64');
      // Verifies that empty S3 key is rejected
      await expectAsync(uploadBase64ZipToS3(testBase64, ''))
        .toBeRejectedWithError('s3Key is required');
    });
  
    // Test 4: Invalid Base64 Validation
    it('should throw error for invalid base64 string', async () => {
      // Verifies that malformed base64 string is rejected
      await expectAsync(uploadBase64ZipToS3('not-base64!', 'test-key.zip'))
        .toBeRejectedWithError('Invalid base64 string format');
    });
  
    // Test 5: File Size Validation
    it('should throw error when file size exceeds limit', async () => {
      // Creates a very large base64 string (7GB when decoded)
      const largeBase64 = 'A'.repeat(7 * 1024 * 1024 * 1024);
  
      // Verifies that files > 5GB are rejected
      await expectAsync(uploadBase64ZipToS3(largeBase64, 'test-key.zip'))
        .toBeRejectedWithError('File size exceeds maximum limit of 5GB');
    });
  
    // Test 6: S3 Error Handling
    it('should handle S3 upload errors', async () => {
      const testBase64 = Buffer.from('test data').toString('base64');
      
      // Simulates an S3 upload failure
      s3SendSpy.and.returnValue(
        Promise.reject(new Error('S3 Upload Failed'))
      );
  
      // Verifies that S3 errors are properly caught and wrapped
      await expectAsync(uploadBase64ZipToS3(testBase64, 'test-key.zip'))
        .toBeRejectedWithError('Failed to upload file to S3: S3 Upload Failed');
    });
  });
}); 