import { S3Client, PutObjectCommand, PutObjectCommandOutput } from '@aws-sdk/client-s3';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { 
  uploadBase64ZipToS3, 
  fetchPackageJson, 
  getGithubUrlFromUrl,
  uploadURLZipToS3,
  uploadPackage,
} from '../../controllers/packageController.js';
import AdmZip from 'adm-zip';

describe('packageController', () => {
  let s3SendSpy: jasmine.Spy;

  beforeEach(() => {
    process.env.BUCKET_NAME = 'test-bucket';
    process.env.AWS_REGION = 'us-east-2';
    
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
      expect(command.input.Key).toBe('test-package-1.0.0.zip');
      expect(command.input.Body).toBeInstanceOf(Buffer);
    });
  
    // Test 2: Empty Input Validation - Updated
    it('should throw error for missing base64 string', async () => {
      await expectAsync(uploadBase64ZipToS3('')).toBeRejectedWithError('ADM-ZIP: Invalid or unsupported zip format. No END header found');
    });
  
    // Test 3: Invalid Base64 Validation
    it('should throw error for invalid base64 string', async () => {
      await expectAsync(uploadBase64ZipToS3('not-base64!')).toBeRejected();
    });
  
    // Test 4: File Size Validation
    it('should throw error when file size exceeds limit', async () => {
      const largeBase64 = Buffer.alloc(6 * 1024 * 1024).toString('base64');
      await expectAsync(uploadBase64ZipToS3(largeBase64)).toBeRejected();
    });
  
    // Test 5: S3 Error Handling
    it('should handle S3 upload errors', async () => {
      const zip = new AdmZip();
      zip.addFile('package.json', Buffer.from(JSON.stringify({
        name: 'test-package',
        version: '1.0.0'
      })));
      const testBase64 = zip.toBuffer().toString('base64');
      
      s3SendSpy.and.rejectWith(new Error('S3 Upload Failed'));

      await expectAsync(uploadBase64ZipToS3(testBase64)).toBeRejected();
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
      expect(command.input.Key).toBe('test-package-2.0.0.zip');
    });

    // Test 7: Missing package.json
    it('should throw error when zip does not contain package.json', async () => {
      const zip = new AdmZip();
      const testBase64 = zip.toBuffer().toString('base64');

      await expectAsync(uploadBase64ZipToS3(testBase64)).toBeRejected();
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

  describe('getGithubUrlFromUrl', () => {
    let fetchSpy: jasmine.Spy;

    beforeEach(() => {
      fetchSpy = spyOn(global, 'fetch');
      spyOn(console, 'info');
    });

    it('should return github url unchanged', async () => {
      const githubUrl = 'https://github.com/username/repo';
      const result = await getGithubUrlFromUrl(githubUrl);
      console.info('GitHub URL:', result);
      expect(result).toBe(githubUrl);
    });

    it('should convert npm url to github url', async () => {
      const npmUrl = 'https://www.npmjs.com/package/express';
      const expectedGithubUrl = 'https://github.com/expressjs/express';

      fetchSpy.and.resolveTo({
        ok: true,
        json: () => Promise.resolve({
          repository: {
            url: 'git+https://github.com/expressjs/express.git'
          }
        })
      } as Response);

      const result = await getGithubUrlFromUrl(npmUrl);
      console.info('Converted GitHub URL:', result);
      expect(result).toBe(expectedGithubUrl);
      expect(fetchSpy).toHaveBeenCalledWith('https://registry.npmjs.org/express');
    });
  });

  describe('uploadURLZipToS3', () => {
    beforeEach(() => {
      spyOn(console, 'info');
      spyOn(console, 'error');
    });

    it('should successfully upload from github url', async () => {
      const githubUrl = 'https://github.com/test/repo';
      const mockZip = new AdmZip();
      mockZip.addFile('package.json', Buffer.from(JSON.stringify({
        name: 'test-package',
        version: '1.0.0'
      })));

      spyOn(global, 'fetch').and.returnValues(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ default_branch: 'main' })
        } as Response),
        Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockZip.toBuffer())
        } as Response)
      );

      await expectAsync(uploadURLZipToS3(githubUrl)).toBeResolved();
      expect(s3SendSpy).toHaveBeenCalled();
      expect(console.info).toHaveBeenCalledWith('Successfully uploaded package test-package@1.0.0 to S3');
    });

    it('should throw error when upload fails', async () => {
      const githubUrl = 'https://github.com/test/repo';
      
      // Mock successful GitHub API response but failed S3 upload
      spyOn(global, 'fetch').and.returnValues(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ default_branch: 'main' })
        } as Response),
        Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new AdmZip().toBuffer())
        } as Response)
      );
      
      s3SendSpy.and.rejectWith(new Error('Upload failed'));

      await expectAsync(uploadURLZipToS3(githubUrl))
        .toBeRejectedWith(new Error('Failed to upload package from URL: Package.json not found in the zip file'));
    });
  });
}); 