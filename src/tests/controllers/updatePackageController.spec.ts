import { updatePackageController } from  '../../controllers/updatePackageController.js';
import { getPackageFromMainTable } from '../../controllers/getPackageController.js';
import { handleUrlUpdate } from  '../../controllers/updatePackageController.js';
import { handleContentUpdate } from '../../controllers/updatePackageController.js';

describe('updatePackageController', () => {
  let mockGetPackageFromMainTable: jasmine.Spy;
  let mockHandleUrlUpdate: jasmine.Spy;
  let mockHandleContentUpdate: jasmine.Spy;

  beforeEach(() => {
    // Mock each standalone function by directly assigning them to a spy
    (getPackageFromMainTable as jasmine.Spy) = jasmine.createSpy('getPackageFromMainTable').and.returnValue(Promise.resolve());
    (handleUrlUpdate as jasmine.Spy) = jasmine.createSpy('handleUrlUpdate').and.returnValue(Promise.resolve());
    (handleContentUpdate as jasmine.Spy) = jasmine.createSpy('handleContentUpdate').and.returnValue(Promise.resolve());
  });

  it('should return 404 if the package does not exist in the main table', async () => {
    mockGetPackageFromMainTable.and.returnValue(Promise.resolve(null));

    const response = await updatePackageController(
      '12345',
      { Name: 'test-package', Version: '1.0.0' },
      { URL: 'https://github.com/user/repo' }
    );

    expect(mockGetPackageFromMainTable).toHaveBeenCalledWith('12345');
    expect(response.statusCode).toBe(404);
    expect(response.body).toContain('Package does not exist.');
  });

  it('should return 400 if Name or Version does not match', async () => {
    mockGetPackageFromMainTable.and.returnValue(
      Promise.resolve({
        metadata: { Name: 'wrong-package', Version: '1.0.0', ID: '12345' },
        data: { Content: null, URL: null, JSProgram: 'test-program' },
      })
    );

    const response = await updatePackageController(
      '12345',
      { Name: 'test-package', Version: '1.0.0' },
      { URL: 'https://github.com/user/repo' }
    );

    expect(mockGetPackageFromMainTable).toHaveBeenCalledWith('12345');
    expect(response.statusCode).toBe(400);
    expect(response.body).toContain('Name or version does not match');
  });

  it('should handle URL updates and return 200 on success', async () => {
    mockGetPackageFromMainTable.and.returnValue(
      Promise.resolve({
        metadata: { Name: 'test-package', Version: '1.0.0', ID: '12345' },
        data: { Content: null, URL: null, JSProgram: 'test-program' },
      })
    );
    mockHandleUrlUpdate.and.returnValue(Promise.resolve());

    const response = await updatePackageController(
      '12345',
      { Name: 'test-package', Version: '1.0.0' },
      { URL: 'https://github.com/user/repo' }
    );

    expect(mockGetPackageFromMainTable).toHaveBeenCalledWith('12345');
    expect(mockHandleUrlUpdate).toHaveBeenCalledWith('12345', 'https://github.com/user/repo');
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Version is updated.');
  });

  it('should handle Content updates and return 200 on success', async () => {
    mockGetPackageFromMainTable.and.returnValue(
      Promise.resolve({
        metadata: { Name: 'test-package', Version: '1.0.0', ID: '12345' },
        data: { Content: null, URL: null, JSProgram: 'test-program' },
      })
    );
    mockHandleContentUpdate.and.returnValue(Promise.resolve());

    const base64Content = Buffer.from('test-content').toString('base64');
    const response = await updatePackageController(
      '12345',
      { Name: 'test-package', Version: '1.0.0' },
      { Content: base64Content }
    );

    expect(mockGetPackageFromMainTable).toHaveBeenCalledWith('12345');
    expect(mockHandleContentUpdate).toHaveBeenCalledWith('12345', base64Content);
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Version is updated.');
  });

  it('should return 500 if an internal error occurs', async () => {
    mockGetPackageFromMainTable.and.throwError('Internal error');

    const response = await updatePackageController(
      '12345',
      { Name: 'test-package', Version: '1.0.0' },
      { URL: 'https://github.com/user/repo' }
    );

    expect(mockGetPackageFromMainTable).toHaveBeenCalledWith('12345');
    expect(response.statusCode).toBe(500);
    expect(response.body).toContain('Internal server error.');
  });
});
