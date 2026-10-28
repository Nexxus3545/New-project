const fs = require('fs');
const path = require('path');

const PRIVATE_CREDENTIAL_UPLOAD_MESSAGE = 'Submit government IDs and professional licenses through the private Account credentials section.';
const PRIVATE_CREDENTIAL_UPLOAD_CODE = 'PRIVATE_CREDENTIAL_UPLOAD_REQUIRED';

function isIdentityDocumentType(value) {
  if (Array.isArray(value)) return value.some(isIdentityDocumentType);
  if (typeof value !== 'string') return false;
  const type = value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['prc', 'license', 'licence', 'professionalregistration'].includes(type)
    || /(?:government|govt|gov)(?:issued)?(?:valid)?(?:identification|identity|id)(?:card)?/.test(type)
    || /philhealth(?:identification|identity|id|card)/.test(type)
    || /(?:national(?:identification|identity|id)|philippineidentification|ephilid|philsys)/.test(type)
    || /passport|driv(?:er|ers|ing)licen[cs]e|umid/.test(type)
    || /(?:sss|gsis|postal|voter|voters|comelec)(?:identification|identity|id|card)/.test(type)
    || /(?:socialsecuritysystem|governmentserviceinsurancesystem|barangay|seniorcitizen|pwd|tin|philpost)(?:identification|identity|id|card)/.test(type)
    || /(?:professional|prc)(?:identification|identity|id|licen[cs]e|card)/.test(type)
    || /prc(?:certificateof)?registration/.test(type)
    || /(?:doctor|nurse|midwife|medical|nursing)licen[cs]e/.test(type);
}

function privateCredentialUploadError() {
  return Object.assign(new Error(PRIVATE_CREDENTIAL_UPLOAD_MESSAGE), { statusCode: 400, code: PRIVATE_CREDENTIAL_UPLOAD_CODE });
}

const inside = (root, target) => {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
};

// A file-first multipart request may already have reached disk before its type
// field arrives. Remove only its regular file beneath the document upload root;
// do not follow links or delete arbitrary request-supplied paths.
async function removeRejectedIdentityFile(filePath, uploadsRoot) {
  if (typeof filePath !== 'string' || !filePath) return;
  const documentRoot = path.resolve(uploadsRoot, 'documents');
  const target = path.resolve(filePath);
  if (!inside(documentRoot, target)) return;
  try {
    const info = await fs.promises.lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) return;
    const [realRoot, realTarget] = await Promise.all([fs.promises.realpath(documentRoot), fs.promises.realpath(target)]);
    if (!inside(realRoot, realTarget)) return;
    await fs.promises.unlink(target);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

module.exports = { isIdentityDocumentType, PRIVATE_CREDENTIAL_UPLOAD_MESSAGE, PRIVATE_CREDENTIAL_UPLOAD_CODE, privateCredentialUploadError, removeRejectedIdentityFile };
