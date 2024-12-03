import {PackageController} from '../../controllers/packageController.js';
import * as MetricScore from '../../metric_score.js';

import { S3Client, PutObjectCommand, PutObjectCommandOutput, HeadObjectCommand } from '@aws-sdk/client-s3';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { 
  generatePackageId,
  getZipFromGithubUrl,
  uploadBase64ZipToS3, 
  fetchPackageJson, 
  getGithubUrlFromUrl,
  packageExists,
  uploadURLZipToS3,
  uploadPackageToS3,
  handleBase64Upload,
  checkPackageRating,

} from '../../controllers/packageController.js';
import AdmZip from 'adm-zip';

import * as packageController from '../../controllers/packageController.js';

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

  describe('generatePackageId', () => {
    /**
     * Test 1: Valid inputs (happy path)
     * Verifies that the function returns a deterministic hash value for valid `name` and `version`.
     */
    it('should generate a valid package ID for valid inputs', () => {
      const result = generatePackageId('test-package', '1.0.0');
      expect(result).toBeDefined(); // Ensures the result is not undefined or null
      expect(typeof result).toBe('string'); // Ensures the result is a string
    });
  
    /**
     * Test 2: Consistent output for identical inputs
     * Ensures that the same `name` and `version` combination always produces the same hash.
     */
    it('should generate consistent IDs for the same inputs', () => {
      const id1 = generatePackageId('test-package', '1.0.0');
      const id2 = generatePackageId('test-package', '1.0.0');
      expect(id1).toBe(id2); // Verifies determinism
    });
  
    /**
     * Test 3: Differentiation for varying inputs
     * Verifies that changing `name` or `version` results in a different hash value.
     */
    it('should generate different IDs for different inputs', () => {
      const id1 = generatePackageId('test-package', '1.0.0');
      const id2 = generatePackageId('another-package', '1.0.0');
      const id3 = generatePackageId('test-package', '2.0.0');
      expect(id1).not.toBe(id2); // Different names should produce different hashes
      expect(id1).not.toBe(id3); // Different versions should produce different hashes
      expect(id2).not.toBe(id3); // Different names and versions should produce different hashes
    });
  
    /**
     * Test 4: Edge case - Empty strings
     * Ensures the function can handle empty `name` or `version` inputs without errors.
     */
    it('should handle empty strings as inputs', () => {
      const result = generatePackageId('', '');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  
    /**
     * Test 5: Edge case - Special characters
     * Verifies the function generates a valid hash when `name` and `version` include special characters.
     */
    it('should handle inputs with special characters', () => {
      const result = generatePackageId('special!@#$', '1.0.0-beta');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  
    /**
     * Test 6: Edge case - Very long strings
     * Ensures the function can handle excessively long `name` or `version` inputs without performance degradation or errors.
     */
    it('should handle very long strings as inputs', () => {
      const longName = 'a'.repeat(1000); // 1000 characters
      const longVersion = '1.0.0'.repeat(100); // Repeated version string
      const result = generatePackageId(longName, longVersion);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });


  describe('getGithubUrlFromUrl', () => {
    let fetchSpy: jasmine.Spy;
  
    beforeEach(() => {
      fetchSpy = spyOn(global, 'fetch'); // Mock the fetch function
      spyOn(console, 'info'); // Suppress console logs during tests
    });
  
    /**
     * Test 1: Valid GitHub URL
     * Ensures that a valid GitHub URL is returned unchanged.
     */
    it('should return GitHub URL unchanged when given a valid GitHub URL', async () => {
      const githubUrl = 'https://github.com/username/repo';
      const result = await getGithubUrlFromUrl(githubUrl);
      console.info('Returned GitHub URL:', result); // Debugging info
      expect(result).toBe(githubUrl);
    });
  
    /**
     * Test 2: Convert npm URL to GitHub URL
     * Verifies the conversion from a valid npm URL to the corresponding GitHub URL.
     */
    it('should convert npm URL to GitHub URL', async () => {
      const npmUrl = 'https://www.npmjs.com/package/express';
      const expectedGithubUrl = 'https://github.com/expressjs/express';
  
      fetchSpy.and.resolveTo({
        ok: true,
        json: () =>
          Promise.resolve({
            repository: { url: 'git+https://github.com/expressjs/express.git' },
          }),
      } as Response);
  
      const result = await getGithubUrlFromUrl(npmUrl);
      console.info('Converted npm URL to GitHub URL:', result); // Debugging info
      expect(result).toBe(expectedGithubUrl);
      expect(fetchSpy).toHaveBeenCalledWith('https://registry.npmjs.org/express');
    });
  
    /**
     * Test 3: Invalid npm URL
     * Ensures the function throws an error when the npm URL does not include a valid package path.
     */
    it('should throw an error for an invalid npm URL without a package path', async () => {
      const invalidNpmUrl = 'https://www.npmjs.com/package/';
    
      await expectAsync(getGithubUrlFromUrl(invalidNpmUrl)).toBeRejectedWithError(
        'Error fetching npm data: Invalid npm URL'
      );
    });
  
    /**
     * Test 4: Unsupported URL
     * Verifies the function throws an error for URLs that are not npm or GitHub.
     */
    // it('should throw an error for unsupported URLs', async () => {
    //   const unsupportedUrl = 'https://example.com/package/repo';
  
    //   await expectAsync(getGithubUrlFromUrl(unsupportedUrl)).toBeRejectedWithError(
    //     'Unsupported URL'
    //   );
    //   console.info('Unsupported URL error correctly thrown for:', unsupportedUrl);
    // });
  });

  describe('getZipFromGithubUrl', () => {
    let fetchSpy: jasmine.Spy;
  
    beforeEach(() => {
      fetchSpy = spyOn(global, 'fetch'); // Mock the global fetch function
    });
  
    /**
     * Test 1: Happy Path
     * Verifies the function successfully fetches the zip file from a valid GitHub URL.
     */
    it('should fetch the zip file for a valid GitHub URL', async () => {
      const githubUrl = 'https://github.com/test/repo'; // Valid GitHub URL
      const expectedZip = new AdmZip(); // Create a mock AdmZip instance
    
      // Mock fetch for repository info
      fetchSpy.and.returnValues(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ default_branch: 'main' }), // Simulate repo data
        } as Response),
        // Mock fetch for the zip file
        Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(expectedZip.toBuffer()), // Return mock zip buffer
        } as Response)
      );
    
      console.info('Testing valid GitHub URL for zip file:', githubUrl);
    
      const result = await getZipFromGithubUrl(githubUrl);
    
      // Instead of checking the instance, check for a valid entry in the zip
      expect(result.getEntries()).toBeDefined();
      console.info('Successfully fetched and validated zip file for:', githubUrl);
    });
    

    
  
    /**
    * Test 2: Invalid GitHub URL
    * Ensures the function throws an error when the GitHub URL is invalid.
    */
    it('should throw an error for an invalid GitHub URL', async () => {
      const invalidUrl = 'https://notgithub.com/test/repo'; // Invalid GitHub-like URL

      // Mock fetch to simulate a failed response
      fetchSpy.and.resolveTo({
        ok: false, // Simulate failure
        statusText: 'Not Found', // Example error status
      } as Response);

      console.info('Testing with invalid GitHub URL:', invalidUrl);

      // Ensure the function throws the expected error
      await expectAsync(getZipFromGithubUrl(invalidUrl)).toBeRejectedWithError(
        'Failed to download GitHub repository: Failed to fetch repository info'
      );

      console.info('Correctly handled invalid GitHub URL:', invalidUrl);
    });

  
    /**
     * Test 3: Repository Info Fetch Error
     * Simulates a scenario where fetching repository info fails.
     */
    it('should throw an error if repository info cannot be fetched', async () => {
      const githubUrl = 'https://github.com/test/repo'; // Example GitHub repository URL
  
      // Mock fetch for repository info with an error response
      fetchSpy.and.resolveTo({
        ok: false, // Simulate fetch failure
        statusText: 'Not Found', // Example error message
      } as Response);
  
      console.info('Testing repository info fetch failure for:', githubUrl);
  
      await expectAsync(getZipFromGithubUrl(githubUrl)).toBeRejectedWithError(
        'Failed to download GitHub repository: Failed to fetch repository info'
      );
  
      console.info('Handled repository info fetch error for:', githubUrl);
      expect(fetchSpy).toHaveBeenCalledTimes(1); // Ensure fetch was called once (for repo info)
      expect(fetchSpy.calls.argsFor(0)[0]).toBe('https://api.github.com/repos/test/repo'); // Validate repo info URL
    });
  
    /**
     * Test 4: Zip File Fetch Error
     * Simulates a scenario where fetching the zip file fails.
     */
    it('should throw an error if the zip file cannot be downloaded', async () => {
      const githubUrl = 'https://github.com/test/repo'; // Example GitHub repository URL
  
      // Mock fetch for repository info (successful)
      fetchSpy.and.returnValues(
        Promise.resolve({
          ok: true, // Simulate successful fetch
          json: () => Promise.resolve({ default_branch: 'main' }), // Simulate repo data with a default branch
        } as Response),
        // Mock fetch for the zip file (failed)
        Promise.resolve({
          ok: false, // Simulate fetch failure
          statusText: 'Forbidden', // Example error message
        } as Response)
      );
  
      console.info('Testing zip file fetch failure for:', githubUrl);
  
      await expectAsync(getZipFromGithubUrl(githubUrl)).toBeRejectedWithError(
        'Failed to download GitHub repository: Failed to download zip file'
      );
  
      console.info('Handled zip file fetch error for:', githubUrl);
      expect(fetchSpy).toHaveBeenCalledTimes(2); // Ensure fetch was called twice (repo info and zip file)
      expect(fetchSpy.calls.argsFor(1)[0]).toBe('https://github.com/test/repo/archive/refs/heads/main.zip'); // Validate zip file URL
    });
  
    /**
     * Test 5: Corrupted Zip File
     * Ensures the function handles corrupted or invalid zip files gracefully.
     */
    it('should throw an error for a corrupted zip file', async () => {
      const githubUrl = 'https://github.com/test/repo'; // Example GitHub repository URL
    
      // Mock fetch for repository info (successful)
      fetchSpy.and.returnValues(
        Promise.resolve({
          ok: true, // Simulate successful fetch
          json: () => Promise.resolve({ default_branch: 'main' }), // Simulate repo data with a default branch
        } as Response),
        // Mock fetch for the zip file (corrupted)
        Promise.resolve({
          ok: true, // Simulate successful fetch
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)), // Empty buffer (invalid zip)
        } as Response)
      );
    
      console.info('Testing corrupted zip file handling for:', githubUrl);
    
      await expectAsync(getZipFromGithubUrl(githubUrl)).toBeRejectedWithError(/Invalid or unsupported zip format/);
    
      console.info('Correctly handled corrupted zip file for:', githubUrl);
    });
  });

  describe('uploadBase64ZipToS3', () => {
    /**
     * Test 1: Happy Path
     * Verifies successful upload of a valid base64 string.
     */
    it('should successfully upload a valid base64 string', async () => {
      const zip = new AdmZip();
      zip.addFile('package.json', Buffer.from(JSON.stringify({
        name: 'test-package',
        version: '1.0.0',
      })));
      const testBase64 = zip.toBuffer().toString('base64');
    
      console.info('Testing base64 upload with:', { name: 'test-package', version: '1.0.0' });
    
      await expectAsync(uploadBase64ZipToS3(testBase64)).toBeResolved();
    
      expect(s3SendSpy).toHaveBeenCalledTimes(1);
    
      // Compute the expected package ID and verify the S3 key
      const expectedPackageId = generatePackageId('test-package', '1.0.0');
      const command = s3SendSpy.calls.first().args[0] as PutObjectCommand;
      expect(command.input.Key).toBe(`${expectedPackageId}.zip`);
    
      console.info('Successfully uploaded base64 string with S3 key:', command.input.Key);
    });
    
  
    /**
     * Test 2: Empty Input Validation
     * Verifies that an empty base64 string throws the expected error.
     */
    it('should throw error for missing base64 string', async () => {
      console.info('Testing empty base64 input.');
  
      await expectAsync(uploadBase64ZipToS3('')).toBeRejectedWithError('ADM-ZIP: Invalid or unsupported zip format. No END header found');
  
      console.info('Correctly rejected empty base64 string.');
    });
  
    /**
     * Test 3: Invalid Base64 String
     * Verifies that an invalid base64 string throws an error.
     */
    it('should throw error for invalid base64 string', async () => {
      console.info('Testing invalid base64 input.');
  
      await expectAsync(uploadBase64ZipToS3('not-base64!')).toBeRejected();
  
      console.info('Correctly rejected invalid base64 string.');
    });
  
    /**
     * Test 4: File Size Validation
     * Ensures the function throws an error when the base64 string exceeds a predefined limit.
     */
    it('should throw error when file size exceeds limit', async () => {
      const largeBase64 = Buffer.alloc(6 * 1024 * 1024).toString('base64'); // Simulate a 6 MB file
  
      console.info('Testing large base64 file upload.');
  
      await expectAsync(uploadBase64ZipToS3(largeBase64)).toBeRejected();
  
      console.info('Correctly rejected large base64 string.');
    });
  
    /**
     * Test 5: S3 Upload Error
     * Simulates an S3 upload error and verifies that it is handled correctly.
     */
    it('should handle S3 upload errors', async () => {
      const zip = new AdmZip();
      zip.addFile('package.json', Buffer.from(JSON.stringify({
        name: 'test-package',
        version: '1.0.0'
      })));
      const testBase64 = zip.toBuffer().toString('base64');
  
      s3SendSpy.and.rejectWith(new Error('S3 Upload Failed'));
  
      console.info('Testing S3 upload failure.');
  
      await expectAsync(uploadBase64ZipToS3(testBase64)).toBeRejected();
  
      console.info('Correctly handled S3 upload failure.');
    });
  
    /**
     * Test 6: Validates S3 Key Generation
     * Verifies that the S3 key is generated correctly using package.json data.
     */
    it('should extract package info and use it for S3 key', async () => {
      const zip = new AdmZip();
      zip.addFile('package.json', Buffer.from(JSON.stringify({
        name: 'test-package',
        version: '2.0.0',
      })));
      const testBase64 = zip.toBuffer().toString('base64');
    
      console.info('Testing S3 key generation with package info:', { name: 'test-package', version: '2.0.0' });
    
      await uploadBase64ZipToS3(testBase64);
    
      // Compute the expected package ID and S3 key
      const expectedPackageId = generatePackageId('test-package', '2.0.0');
      const expectedS3Key = `${expectedPackageId}.zip`;
    
      // Verify that the generated S3 key matches the expected key
      const command = s3SendSpy.calls.first().args[0] as PutObjectCommand;
      expect(command.input.Key).toBe(expectedS3Key);
    
      console.info('Successfully generated and validated S3 key:', command.input.Key);
    });
  
    /**
     * Test 7: Missing package.json
     * Ensures that the function throws an error if package.json is not present in the zip.
     */
    it('should throw error when zip does not contain package.json', async () => {
      const zip = new AdmZip(); // Create a zip with no package.json
      const testBase64 = zip.toBuffer().toString('base64');
  
      console.info('Testing missing package.json in zip.');
  
      await expectAsync(uploadBase64ZipToS3(testBase64)).toBeRejectedWithError('Package.json not found in the zip file');
  
      console.info('Correctly handled missing package.json in zip.');
    });
  
    /**
     * Test 8: Corrupted package.json
     * Ensures that the function throws an error if the package.json is invalid or corrupted.
     */
    it('should throw error when package.json is corrupted', async () => {
      const zip = new AdmZip();
      zip.addFile('package.json', Buffer.from('invalid json')); // Add corrupted package.json
      const testBase64 = zip.toBuffer().toString('base64');
  
      console.info('Testing corrupted package.json in zip.');
  
      await expectAsync(uploadBase64ZipToS3(testBase64)).toBeRejectedWithError(SyntaxError);
  
      console.info('Correctly handled corrupted package.json.');
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

  
  describe('packageExists', () => {
    let s3SendSpy: jasmine.Spy;
  
    beforeAll(() => {
      jasmine.getEnv().allowRespy(true); // Allow re-spying on methods
    });
  
    beforeEach(() => {
      // Spy on S3Client send method
      s3SendSpy = spyOn(S3Client.prototype as any, 'send');
    });
  
    afterEach(() => {
      // Clear spies after each test
      jasmine.getEnv().allowRespy(true);
    });
  
    it('should return true if the package exists in the S3 bucket', async () => {
      s3SendSpy.and.resolveTo({}); // Mock a successful response
  
      const result = await packageExists('test-package-id');
      expect(result).toBe(true); // Expect the function to return true
  
      expect(s3SendSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({
          input: {
            Bucket: process.env.BUCKET_NAME,
            Key: 'test-package-id.zip',
          },
        })
      );
    });
  
    it('should return false if the package does not exist in the S3 bucket', async () => {
      const notFoundError = new Error('NotFound');
      (notFoundError as any).name = 'NotFound'; // Mimic AWS SDK's NotFound error
      s3SendSpy.and.rejectWith(notFoundError); // Mock a NotFound error
  
      const result = await packageExists('nonexistent-package-id');
      expect(result).toBe(false); // Expect the function to return false
  
      expect(s3SendSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({
          input: {
            Bucket: process.env.BUCKET_NAME,
            Key: 'nonexistent-package-id.zip',
          },
        })
      );
    });
  
    it('should throw an error for unexpected S3 errors', async () => {
      const unexpectedError = new Error('Internal Server Error');
      s3SendSpy.and.rejectWith(unexpectedError); // Mock an unexpected error
  
      await expectAsync(packageExists('test-package-id')).toBeRejectedWith(unexpectedError);
  
      expect(s3SendSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({
          input: {
            Bucket: process.env.BUCKET_NAME,
            Key: 'test-package-id.zip',
          },
        })
      );
    });
  });

  
  describe('uploadURLZipToS3', () => {
    let s3SendSpy: jasmine.Spy;
   
    beforeAll(() => {
      jasmine.getEnv().allowRespy(true); // Allow re-spying on methods
    });

    beforeEach(() => {
      // Set up spies for console logs
      spyOn(console, 'info');
      spyOn(console, 'error');
  
      // Set up spy for S3Client send
      s3SendSpy = spyOn(S3Client.prototype as any, 'send');
    });
  
    afterEach(() => {
      // Clear spies after each test
      jasmine.getEnv().allowRespy(true); // Allow re-spying on methods
    });
  
    /**
     * Test 1: Successful upload
     */
    it('should successfully upload from GitHub URL', async () => {
      s3SendSpy.and.resolveTo({
        $metadata: {},
      });
  
      const githubUrl = 'https://github.com/test/repo';
      const mockZip = new AdmZip();
      mockZip.addFile('package.json', Buffer.from(JSON.stringify({
        name: 'test-package',
        version: '1.0.0',
      })));
  
      spyOn(global, 'fetch').and.returnValues(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ default_branch: 'main' }),
        } as Response),
        Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockZip.toBuffer()),
        } as Response)
      );
  
      await expectAsync(uploadURLZipToS3(githubUrl)).toBeResolved();
      expect(s3SendSpy).toHaveBeenCalledTimes(1);
      const command = s3SendSpy.calls.first().args[0] as PutObjectCommand;
      expect(command.input.Bucket).toBe(process.env.BUCKET_NAME);
      expect(command.input.Key).toBe('6ff1bae15d12ceede2cdce2d437daae6d5fa9565fbf7177bc5834eb2fcfbc343.zip');
      expect(console.info).toHaveBeenCalledWith('Successfully uploaded package test-package@1.0.0 to S3');
    });
  
    /**
     * Test 2: S3 upload failure
     */
    it('should throw error when upload fails', async () => {
      // Mock S3 `send` method to simulate upload failure
      const s3SendSpy = spyOn(S3Client.prototype as any, 'send').and.rejectWith(new Error('S3 Upload Failed'));
    
      const githubUrl = 'https://github.com/test/repo';
    
      // Mock a valid zip file with a proper package.json
      const mockZip = new AdmZip();
      mockZip.addFile(
        'package.json',
        Buffer.from(
          JSON.stringify({
            name: 'test-package',
            version: '1.0.0',
          })
        )
      );
    
      // Mock fetch to return the zip file
      spyOn(global, 'fetch').and.returnValues(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ default_branch: 'main' }),
        } as Response),
        Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockZip.toBuffer()),
        } as Response)
      );
    
      // Execute the function and check for the expected error
      await expectAsync(uploadURLZipToS3(githubUrl)).toBeRejectedWithError(
        'Failed to upload package from URL: S3 Upload Failed'
      );
    
      // Ensure `send` was called
      expect(s3SendSpy).toHaveBeenCalled();
      // Ensure error was logged
      expect(console.error).toHaveBeenCalledWith(jasmine.stringMatching(/Error uploading URL package to S3:/));
    });
  
    /**
     * Test 3: Invalid GitHub URL
     */
    // it('should throw error for invalid GitHub URL', async () => {
    //   const invalidUrl = 'https://notgithub.com/test/repo';
    
    //   // Mock fetch to simulate a failure
    //   spyOn(global, 'fetch').and.resolveTo(undefined as unknown as Response);
    
    //   try {
    //     await uploadURLZipToS3(invalidUrl);
    //     fail('Expected error was not thrown');
    //   } catch (error) {
    //     expect(error).toBeInstanceOf(Error);
    //     expect(error.message).toBe('Failed to upload package from URL: Failed to fetch repository info');
    //   }
    
    //   expect(console.error).toHaveBeenCalled();
    // });
    
    
  
    /**
     * Test 4: Missing package.json in zip
     */
    it('should throw an error for invalid GitHub URL', async () => {
      const invalidUrl = 'https://notgithub.com/test/repo';
    
      // Mock fetch to simulate a failure
      spyOn(global, 'fetch').and.resolveTo(undefined as unknown as Response);
    
      await expectAsync(uploadURLZipToS3(invalidUrl)).toBeRejected();
    
      expect(console.error).toHaveBeenCalledWith(
        jasmine.stringMatching(/Error uploading URL package to S3:/)
      );
    }); 
  });  
   
}); 

describe('uploadPackageToS3', () => {
  beforeEach(() => {
      // Reset spies for each test
      spyOn(PackageController, 'uploadBase64ZipToS3').and.callFake(async (base64Content: string) => {
          if (!base64Content) throw new Error('Invalid base64 content');
      });

      spyOn(PackageController, 'uploadURLZipToS3').and.callFake(async (url: string) => {
          if (!url.startsWith('https://')) throw new Error('Invalid URL');
      });

      spyOn(PackageController, 'fetchPackageJson').and.callFake(() => ({
          name: 'test-package',
          version: '1.0.0',
      }));
  });

  it('should return 400 if required fields are missing', async () => {
    const event = { body: JSON.stringify({}) } as APIGatewayProxyEvent;

    const result = await uploadPackageToS3(event);

    expect(result.statusCode).toBe(400);
    const responseBody = JSON.parse(result.body);
    expect(responseBody.error).toBe('Missing required fields: URL, Content, or JSProgram');
});


it('should handle successful upload from Content', async () => {
  spyOn(PackageController, 'fetchPackageJson').and.callFake(() => ({
      name: 'test-package',
      version: '1.0.0',
  }));

  spyOn(PackageController, 'uploadBase64ZipToS3').and.callFake(async () => {});

  const event = {
      body: JSON.stringify({
          Content: 'validBase64Content',
          JSProgram: 'console.log("test")',
      }),
  } as APIGatewayProxyEvent;

  const result = await uploadPackageToS3(event);

  expect(result.statusCode).toBe(201);
  const responseBody = JSON.parse(result.body);
  expect(responseBody.metadata).toEqual({ Name: 'test-package', Version: '1.0.0' });
  expect(responseBody.message).toBe('Package uploaded successfully');
});

it('should return 400 for invalid Content', async () => {
  spyOn(PackageController, 'uploadBase64ZipToS3').and.callFake(async () => {
      throw new Error('Invalid base64 content');
  });

  const event = {
      body: JSON.stringify({
          Content: 'invalidBase64Content',
          JSProgram: 'console.log("test")',
      }),
  } as APIGatewayProxyEvent;

  const result = await uploadPackageToS3(event);

  expect(result.statusCode).toBe(400);
  expect(JSON.parse(result.body).error).toBe('Invalid base64 content or zip format');
});


it('should handle successful upload from URL', async () => {
  spyOn(PackageController, 'uploadURLZipToS3').and.callFake(async () => {});
  spyOn(PackageController, 'fetchPackageJson').and.callFake(() => ({
      name: 'test-package',
      version: '1.0.0',
  }));

  const event = {
      body: JSON.stringify({
          URL: 'https://github.com/test/repo',
          JSProgram: 'console.log("test")',
      }),
  } as APIGatewayProxyEvent;

  const result = await uploadPackageToS3(event);

  expect(result.statusCode).toBe(201);
  const responseBody = JSON.parse(result.body);
  expect(responseBody.metadata).toEqual({ Name: 'test-package', Version: '1.0.0' });
  expect(responseBody.message).toBe('Package uploaded successfully');
});


  it('should return 400 for invalid URL', async () => {
      spyOn(PackageController, 'uploadURLZipToS3').and.callFake(async () => {
          throw new Error('Invalid URL');
      });

      const event = {
          body: JSON.stringify({
              URL: 'invalid-url',
              JSProgram: 'console.log("test")',
          }),
      } as APIGatewayProxyEvent;

      const result = await uploadPackageToS3(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('Invalid URL');
  });

  it('should return 500 if uploadBase64ZipToS3 throws an error', async () => {
      spyOn(PackageController, 'uploadBase64ZipToS3').and.callFake(async () => {
          throw new Error('S3 Upload Failed');
      });

      const event = {
          body: JSON.stringify({
              Content: 'validBase64Content',
              JSProgram: 'console.log("test")',
          }),
      } as APIGatewayProxyEvent;

      const result = await uploadPackageToS3(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toBe('Error processing package upload');
  });

  it('should return 500 if uploadURLZipToS3 throws an error', async () => {
      spyOn(PackageController, 'uploadURLZipToS3').and.callFake(async () => {
          throw new Error('URL Upload Failed');
      });

      const event = {
          body: JSON.stringify({
              URL: 'https://npmjs.com/package/example',
              JSProgram: 'console.log("test")',
          }),
      } as APIGatewayProxyEvent;

      const result = await uploadPackageToS3(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toBe('Error processing package upload');
  });
});

