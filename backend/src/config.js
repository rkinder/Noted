require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '3001', 10),
  encryptionKey: process.env.ENCRYPTION_KEY || 'dev-encryption-key-replace-in-production',
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-replace-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  storage: {
    type: process.env.STORAGE_TYPE || 'local',
    localPath: process.env.LOCAL_STORAGE_PATH || './data',
    s3: {
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      bucket: process.env.S3_BUCKET_NAME,
    },
  },
};
