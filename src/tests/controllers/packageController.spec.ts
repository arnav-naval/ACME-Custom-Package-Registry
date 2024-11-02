import { S3Client, PutObjectCommand, PutObjectCommandOutput } from '@aws-sdk/client-s3';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { 
  uploadBase64ZipToS3, 
  fetchPackageJson, 
  getGithubUrlFromUrl,
  uploadURLZipToS3,
  uploadPackageToS3,
  handleBase64Upload,
  getZipFromGithubUrl
} from '../../controllers/packageController.js';
import AdmZip from 'adm-zip';

describe('packageController', () => {
  let s3SendSpy: jasmine.Spy;

  beforeEach(() => {
    process.env.BUCKET_NAME = 'test-bucket';
    process.env.AWS_REGION = 'us-east-1';
    
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
      }), 'utf-8'));
      const testBase64 = zip.toBuffer().toString('base64');
  
      // Verifies the upload completes without error
      await expectAsync(uploadBase64ZipToS3(testBase64)).toBeResolved();
  
      // Verifies S3 client was called exactly once
      expect(s3SendSpy).toHaveBeenCalledTimes(1);
      
      // Verifies the S3 command was constructed correctly with all required parameters
      const command = s3SendSpy.calls.first().args[0] as PutObjectCommand;
      expect(command.input.Bucket).toBe('test-bucket');
      expect(command.input.Key).toBe('test-package-1.0.0.zip');
      expect(command.input.Body).toEqual(jasmine.any(Buffer));
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

    it('should throw error for invalid npm url', async () => {
      const invalidNpmUrl = 'https://www.npmjs.com/invalid';
      
      await expectAsync(getGithubUrlFromUrl(invalidNpmUrl))
        .toBeRejectedWithError('Invalid npm URL');
      expect(console.info).toHaveBeenCalledWith('Error fetching npm data');
    });

    it('should throw error when npm API fails', async () => {
      const npmUrl = 'https://www.npmjs.com/package/express';

      fetchSpy.and.resolveTo({
        ok: false,
        statusText: 'Not Found'
      } as Response);

      await expectAsync(getGithubUrlFromUrl(npmUrl))
        .toBeRejectedWithError('Error fetching npm data: npm API error: Not Found');
      expect(console.info).toHaveBeenCalledWith('Error fetching npm data');
    });

    it('should throw error when no repository URL found', async () => {
      const npmUrl = 'https://www.npmjs.com/package/express';

      fetchSpy.and.resolveTo({
        ok: true,
        json: () => Promise.resolve({})
      } as Response);

      await expectAsync(getGithubUrlFromUrl(npmUrl))
        .toBeRejectedWithError('Error fetching npm data: No repository URL found in npm data');
      expect(console.info).toHaveBeenCalledWith('No repository URL found in npm data');
      expect(console.info).toHaveBeenCalledWith('Error fetching npm data');
    });

    it('should convert git protocol urls to https', async () => {
      const npmUrl = 'https://www.npmjs.com/package/test-package';
      
      fetchSpy.and.resolveTo({
        ok: true,
        json: () => Promise.resolve({
          repository: {
            url: 'git://github.com/test/repo.git'
          }
        })
      } as Response);

      const result = await getGithubUrlFromUrl(npmUrl);
      console.info('Converted git protocol URL:', result);
      expect(result).toBe('https://github.com/test/repo');
    });
  });

  describe('uploadPackageToS3', () => {
    it('should handle missing request body', async () => {
      const event = { body: null } as APIGatewayProxyEvent;
      
      const result = await uploadPackageToS3(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('Missing request body');
    });

    it('should handle invalid JSON in request body', async () => {
      const event = { 
        body: 'invalid-json'
      } as APIGatewayProxyEvent;
      
      const result = await uploadPackageToS3(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('Invalid JSON in request body');
    });

    it('should validate request body fields', async () => {
      const event = {
        body: JSON.stringify({
          JSProgram: 'console.log("test")',
          type: 'base64'
        })
      } as APIGatewayProxyEvent;

      const result = await uploadPackageToS3(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('Missing required fields');
    });

    it('should validate type field', async () => {
      const event = {
        body: JSON.stringify({
          URL: 'https://github.com/test/repo',
          JSProgram: 'console.log("test")',
          type: 'invalid'
        })
      } as APIGatewayProxyEvent;

      const result = await uploadPackageToS3(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('Invalid type');
    });

    it('should not allow both URL and Content', async () => {
      const event = {
        body: JSON.stringify({
          URL: 'https://github.com/test/repo',
          Content: 'base64content',
          JSProgram: 'console.log("test")'
        })
      } as APIGatewayProxyEvent;

      const result = await uploadPackageToS3(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('Cannot provide both URL and Content fields');
    });

    it('should handle successful Content upload', async () => {
      const zip = new AdmZip();
      zip.addFile('package.json', Buffer.from(JSON.stringify({
        name: 'test-package',
        version: '1.0.0'
      })));
      
      const event = {
        body: JSON.stringify({
          Content: zip.toBuffer().toString('base64'),
          JSProgram: 'console.log("test")'
        })
      } as APIGatewayProxyEvent;

      const result = await uploadPackageToS3(event);
      
      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body).metadata).toBeDefined();
      expect(JSON.parse(result.body).data).toBeDefined();
    });
  });

  describe('handleBase64Upload', () => {
    it('should handle missing request body', async () => {
      const event = { body: null } as APIGatewayProxyEvent;
      
      const result = await handleBase64Upload(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('Missing request body');
    });

    it('should handle missing required fields', async () => {
      const event = {
        body: JSON.stringify({})
      } as APIGatewayProxyEvent;
      
      const result = await handleBase64Upload(event);
      
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('Missing required fields: base64Content or jsprogram');
    });

    it('should handle successful upload', async () => {
      const zip = new AdmZip();
      zip.addFile('package.json', Buffer.from(JSON.stringify({
        name: 'test-package',
        version: '1.0.0'
      })));
      
      const event = {
        body: JSON.stringify({
          base64Content: zip.toBuffer().toString('base64'),
          jsprogram: 'console.log("test")'
        })
      } as APIGatewayProxyEvent;

      const result = await handleBase64Upload(event);
      
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).message).toBe('Package uploaded successfully');
    });
  });

  describe('getZipFromGithubUrl', () => {
    let fetchSpy: jasmine.Spy;

    beforeEach(() => {
      fetchSpy = spyOn(global, 'fetch');
    });

    it('should successfully download and create zip from github', async () => {
      const githubUrl = 'https://github.com/test/repo';
      const mockZip = new AdmZip();
      
      fetchSpy.and.returnValues(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ default_branch: 'main' })
        } as Response),
        Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockZip.toBuffer())
        } as Response)
      );

      const result = await getZipFromGithubUrl(githubUrl);
      expect(result).toBeDefined();
      expect(result instanceof AdmZip).toBeTruthy();
    });

    it('should throw error when github api fails', async () => {
      const githubUrl = 'https://github.com/test/repo';
      
      fetchSpy.and.resolveTo({
        ok: false,
        statusText: 'Not Found'
      } as Response);

      await expectAsync(getZipFromGithubUrl(githubUrl))
        .toBeRejectedWithError('Failed to download GitHub repository: Failed to fetch repository info');
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
      s3SendSpy.and.rejectWith(new Error('Upload failed'));

      await expectAsync(uploadURLZipToS3(githubUrl))
        .toBeRejectedWithError('Failed to upload package from URL: Upload failed');
      expect(console.error).toHaveBeenCalled();
    });
  });
}); 