import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

export const s3 = new S3Client({
  endpoint: import.meta.env.B2_ENDPOINT,
  region: 'us-east-005',
  credentials: {
    accessKeyId: import.meta.env.B2_KEY_ID,
    secretAccessKey: import.meta.env.B2_APP_KEY,
  },
})

export async function uploadToB2(file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const key = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  await s3.send(new PutObjectCommand({
    Bucket: import.meta.env.B2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: file.type,
  }))

  return `${import.meta.env.B2_BUCKET_PUBLIC_URL}/${key}`
}
