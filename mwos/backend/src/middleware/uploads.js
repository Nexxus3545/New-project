const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadsRoot = path.resolve(process.cwd(), 'uploads');

const ensureDir = (subdir) => {
  const target = path.join(uploadsRoot, subdir);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  return target;
};

const createStorage = (subdir) => multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, ensureDir(subdir));
  },
  filename: (_req, file, cb) => {
    const safeBase = path.basename(file.originalname).replace(/[^\w.-]+/g, '-');
    cb(null, `${Date.now()}-${safeBase}`);
  },
});

const createUploader = (subdir, allowedMimeTypes, sizeLimitMb) => multer({
  storage: createStorage(subdir),
  limits: { fileSize: sizeLimitMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.some((prefix) => file.mimetype.startsWith(prefix))) {
      const error = new Error(`Unsupported file type for ${subdir}`);
      error.statusCode = 400;
      return cb(error);
    }
    cb(null, true);
  },
});

const uploadVideo = createUploader('videos', ['video/', 'image/'], 80);
const uploadDocument = createUploader('documents', ['image/', 'application/pdf'], 25);
const uploadMedicineImage = createUploader('medicine-images', ['image/'], 10);

module.exports = {
  uploadsRoot,
  uploadVideo,
  uploadDocument,
  uploadMedicineImage,
};
