import { S3Client, PutObjectCommand, PutObjectCommandOutput } from '@aws-sdk/client-s3';
import { uploadBase64ZipToS3, fetchPackageJson } from '../../controllers/packageController';
import AdmZip from 'adm-zip';

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
      const zip = new AdmZip();
      zip.addFile('package.json', Buffer.from(JSON.stringify({
        name: 'test-package',
        version: '1.0.0'
      })));
      const testBase64 = zip.toBuffer().toString('base64');
  
      // Verifies the upload completes without error
      await expectAsync(uploadBase64ZipToS3(testBase64)).toBeResolved();
  
      // Verifies S3 client was called exactly once
      expect(s3SendSpy).toHaveBeenCalledTimes(1);
      
      // Verifies the S3 command was constructed correctly with all required parameters
      const command = s3SendSpy.calls.first().args[0] as PutObjectCommand;
      expect(command.input.Bucket).toBe('test-bucket');
      expect(command.input.Key).toBe('test-package-1.0.0');
      expect(command.input.Body).toEqual(jasmine.any(Buffer));
      expect(command.input['Content-Type']).toBe('application/zip');
    });
  
    // Test 2: Empty Input Validation
    it('should throw error for missing base64 string', async () => {
      await expectAsync(uploadBase64ZipToS3(''))
        .toBeRejectedWithError('base64String is required');
    });
  
    // Test 3: Invalid Base64 Validation
    it('should throw error for invalid base64 string', async () => {
      await expectAsync(uploadBase64ZipToS3('not-base64!'))
        .toBeRejectedWithError('Invalid base64 string format');
    });
  
    // Test 4: File Size Validation
    it('should throw error when file size exceeds limit', async () => {
      // Creates a very large base64 string (7GB when decoded)
      const largeBase64 = 'A'.repeat(7 * 1024 * 1024 * 1024);
  
      await expectAsync(uploadBase64ZipToS3(largeBase64))
        .toBeRejectedWithError('File size exceeds maximum limit of 5GB');
    });
  
    // Test 5: S3 Error Handling
    it('should handle S3 upload errors', async () => {
      const zip = new AdmZip();
      zip.addFile('package.json', Buffer.from(JSON.stringify({
        name: 'test-package',
        version: '1.0.0'
      })));
      const testBase64 = zip.toBuffer().toString('base64');
      
      // Simulates an S3 upload failure
      s3SendSpy.and.returnValue(
        Promise.reject(new Error('S3 Upload Failed'))
      );
  
      await expectAsync(uploadBase64ZipToS3(testBase64))
        .toBeRejectedWithError('Failed to upload file to S3: S3 Upload Failed');
    });

    // Test 6: Package.json Extraction
    it('should extract package info and use it for S3 key', async () => {
      const zip = new AdmZip();
      zip.addFile('package.json', Buffer.from(JSON.stringify({
        name: 'test-package',
        version: '2.0.0'
      })));
      const testBase64 = zip.toBuffer().toString('base64');

      await uploadBase64ZipToS3(testBase64);

      const command = s3SendSpy.calls.first().args[0] as PutObjectCommand;
      expect(command.input.Key).toBe('test-package-2.0.0');
    });

    // Test 7: Missing package.json
    it('should throw error when zip does not contain package.json', async () => {
      const zip = new AdmZip();
      const testBase64 = zip.toBuffer().toString('base64');

      await expectAsync(uploadBase64ZipToS3(testBase64))
        .toBeRejectedWithError('Package.json not found in the zip file');
    });
  });

  describe('fetchPackageJson', () => {
    let zip: AdmZip;

    beforeEach(() => {
      zip = new AdmZip();
    });

    it('should successfully extract name and version from package.json', () => {
      zip.addFile('package.json', Buffer.from(JSON.stringify({
        name: 'test-package',
        version: '1.0.0'
      })));

      const result = fetchPackageJson(zip);

      expect(result).toEqual({
        name: 'test-package',
        version: '1.0.0'
      });
    });

    it('should use default version 1.0.0 when version is missing', () => {
      zip.addFile('package.json', Buffer.from(JSON.stringify({
        name: 'test-package'
      })));

      const result = fetchPackageJson(zip);

      expect(result).toEqual({
        name: 'test-package',
        version: '1.0.0'
      });
    });

    it('should throw error when package.json is missing', () => {
      expect(() => fetchPackageJson(zip))
        .toThrowError('Package.json not found in the zip file');
    });

    it('should throw error when name is missing', () => {
      zip.addFile('package.json', Buffer.from(JSON.stringify({
        version: '1.0.0'
      })));

      expect(() => fetchPackageJson(zip))
        .toThrowError('Name is not present in the package.json file');
    });

    it('should throw error for invalid JSON in package.json', () => {
      zip.addFile('package.json', Buffer.from('invalid json'));

      expect(() => fetchPackageJson(zip))
        .toThrow(jasmine.any(SyntaxError));
    });
  });
}); 