jest.mock('../../src/models/User', () => ({
  findById: jest.fn(),
  update: jest.fn()
}));
jest.mock('../../src/utils/imageProcessor', () => ({
  validateImage: jest.fn(),
  processAvatar: jest.fn(),
  saveImage: jest.fn(),
  deleteImage: jest.fn()
}));

const path = require('path');
const User = require('../../src/models/User');
const imageProcessor = require('../../src/utils/imageProcessor');
const userController = require('../../src/controllers/user.controller');

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; }
  };
}

describe('userController avatar storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('uploadAvatar processes image, updates avatar_url, and deletes prior local avatar', async () => {
    User.findById.mockResolvedValue({
      id: 'user-1',
      avatar_url: '/uploads/avatars/old-avatar.webp'
    });
    imageProcessor.processAvatar.mockResolvedValue({
      buffer: Buffer.from('processed'),
      filename: 'avatar_user-1_123_profile.webp',
      mimeType: 'image/webp',
      originalSize: 100,
      compressedSize: 80,
      compressionRatio: 20
    });
    imageProcessor.saveImage.mockResolvedValue({
      filename: 'avatar_user-1_123_profile.webp',
      size: 80
    });
    User.update.mockResolvedValue({
      id: 'user-1',
      avatar_url: '/api/users/avatar/avatar_user-1_123_profile.webp'
    });

    const req = {
      user: { id: 'user-1' },
      file: {
        buffer: Buffer.from('original'),
        originalname: 'profile.png'
      }
    };
    const res = createRes();
    const next = jest.fn();

    await userController.uploadAvatar(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(imageProcessor.validateImage).toHaveBeenCalledWith(req.file.buffer);
    expect(imageProcessor.processAvatar).toHaveBeenCalledWith(
      req.file.buffer,
      'profile.png',
      'user-1'
    );
    expect(imageProcessor.saveImage).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'avatar_user-1_123_profile.webp' }),
      expect.stringContaining(path.join('uploads', 'avatars'))
    );
    expect(User.update).toHaveBeenCalledWith('user-1', {
      avatar_url: '/api/users/avatar/avatar_user-1_123_profile.webp'
    });
    expect(imageProcessor.deleteImage).toHaveBeenCalledWith(
      expect.stringContaining(path.join('uploads', 'avatars', 'old-avatar.webp'))
    );
    expect(res.payload).toEqual({
      user: {
        id: 'user-1',
        avatar_url: '/api/users/avatar/avatar_user-1_123_profile.webp'
      }
    });
  });

  test('deleteAvatar clears avatar_url and deletes the local file when present', async () => {
    User.findById.mockResolvedValue({
      id: 'user-1',
      avatar_url: '/uploads/avatars/current-avatar.webp'
    });
    User.update.mockResolvedValue({
      id: 'user-1',
      avatar_url: null
    });

    const req = { user: { id: 'user-1' } };
    const res = createRes();
    const next = jest.fn();

    await userController.deleteAvatar(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(User.update).toHaveBeenCalledWith('user-1', { avatar_url: null });
    expect(imageProcessor.deleteImage).toHaveBeenCalledWith(
      expect.stringContaining(path.join('uploads', 'avatars', 'current-avatar.webp'))
    );
    expect(res.payload).toEqual({
      user: {
        id: 'user-1',
        avatar_url: null
      }
    });
  });
});
