import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class R2StorageService {
  private client(): S3Client {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    if (!accountId || !accessKeyId || !secretAccessKey || !process.env.R2_BUCKET || !process.env.R2_PUBLIC_BASE_URL) throw new ServiceUnavailableException('Media storage is not configured');
    return new S3Client({ region: 'auto', endpoint: `https://${accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } });
  }

  async put(key: string, body: Buffer, contentType: string) {
    const client = this.client();
    await client.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, Body: body, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }));
    return `${process.env.R2_PUBLIC_BASE_URL!.replace(/\/$/, '')}/${key}`;
  }
}
