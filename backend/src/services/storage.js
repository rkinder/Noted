const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

let _s3Client = null;

function getS3() {
  if (!_s3Client) {
    const { S3Client } = require('@aws-sdk/client-s3');
    const cfg = { region: config.storage.s3.region };
    // Only pass explicit credentials when both are present.
    // When running on EC2/ECS with an IAM role, omit them so the SDK uses
    // the instance/task metadata credential provider automatically.
    if (config.storage.s3.accessKeyId && config.storage.s3.secretAccessKey) {
      cfg.credentials = {
        accessKeyId: config.storage.s3.accessKeyId,
        secretAccessKey: config.storage.s3.secretAccessKey,
      };
    }
    _s3Client = new S3Client(cfg);
  }
  return _s3Client;
}

function localPath(key) {
  return path.join(config.storage.localPath, key);
}

async function readFile(key) {
  if (config.storage.type === 's3') {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const res = await getS3().send(new GetObjectCommand({ Bucket: config.storage.s3.bucket, Key: key }));
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8');
  }
  return fs.readFile(localPath(key), 'utf8');
}

async function writeFile(key, content) {
  if (config.storage.type === 's3') {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await getS3().send(new PutObjectCommand({
      Bucket: config.storage.s3.bucket,
      Key: key,
      Body: content,
      ContentType: 'text/plain',
      ServerSideEncryption: 'AES256', // S3-managed server-side encryption in addition to our app-level encryption
    }));
    return;
  }
  const fp = localPath(key);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, content, 'utf8');
}

async function deleteFile(key) {
  if (config.storage.type === 's3') {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await getS3().send(new DeleteObjectCommand({ Bucket: config.storage.s3.bucket, Key: key }));
    return;
  }
  await fs.unlink(localPath(key)).catch(() => {});
}

async function listFiles(prefix) {
  if (config.storage.type === 's3') {
    const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
    const keys = [];
    let token;
    do {
      const res = await getS3().send(new ListObjectsV2Command({
        Bucket: config.storage.s3.bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }));
      if (res.Contents) keys.push(...res.Contents.map(o => o.Key));
      token = res.NextContinuationToken;
    } while (token);
    return keys;
  }
  const dir = localPath(prefix);
  try {
    const entries = await fs.readdir(dir);
    return entries.map(e => path.join(prefix, e));
  } catch {
    return [];
  }
}

module.exports = { readFile, writeFile, deleteFile, listFiles };
