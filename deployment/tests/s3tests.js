/*
import request from 'supertest';
import express from 'express';
import { generateUploadUrl } from '../controllers/packageController';
import { expect } from 'jasmine';
describe('S3 Pre-signed URL Generation', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.get('/generate-upload-url', generateUploadUrl);
  });

  it('should generate a valid pre-signed URL', (done) => {
    request(app)
      .get('/generate-upload-url')
      .query({ fileName: 'test.txt', fileType: 'text/plain' })
      .end((err, response) => {
        if (err) return done(err);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('url');
        expect(response.body.url).toMatch(/^https:\/\/.+\.s3\.amazonaws\.com\/.+/);
        console.log(response.body.url);
        
        const url = new URL(response.body.url);
        expect(url.searchParams.has('X-Amz-Algorithm')).toBe(true);
        expect(url.searchParams.has('X-Amz-Credential')).toBe(true);
        expect(url.searchParams.has('X-Amz-Date')).toBe(true);
        expect(url.searchParams.has('X-Amz-Expires')).toBe(true);
        expect(url.searchParams.has('X-Amz-SignedHeaders')).toBe(true);
        expect(url.searchParams.has('X-Amz-Signature')).toBe(true);

        done();
      });
  });

  it('should return 400 if fileName or fileType is missing', (done) => {
    request(app)
      .get('/generate-upload-url')
      .query({ fileName: 'test.txt' }) // Omitting fileType
      .end((err, response) => {
        if (err) return done(err);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toBe('Missing fileName or fileType');

        done();
      });
  });
});*/ 
//# sourceMappingURL=s3tests.js.map