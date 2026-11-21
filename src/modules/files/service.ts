import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Config } from '../../config/env.js';
import { HttpError } from '../../utils/errors.js';
import { v2 as cloudinary } from 'cloudinary';

export class FileService {
  constructor(
    private prisma: PrismaClient,
    private config: Config,
  ) {
    if (config.CLOUDINARY_CLOUD_NAME && config.CLOUDINARY_API_KEY && config.CLOUDINARY_API_SECRET) {
      cloudinary.config({
        cloud_name: config.CLOUDINARY_CLOUD_NAME,
        api_key: config.CLOUDINARY_API_KEY,
        api_secret: config.CLOUDINARY_API_SECRET,
        secure: true,
      });
    }
  }

  async listFiles(ownerId: string, folderId?: string) {
    const where: any = { ownerId };
    if (folderId) where.folderId = folderId;
    const files = await this.prisma.fileAsset.findMany({
      where,
      include: { folder: true },
      orderBy: { createdAt: 'desc' },
    });
    return files.map((f: any) => ({
      ...f,
      bytes: f.bytes.toString(),
    }));
  }

  async recordUpload(
    ownerId: string,
    fileData: {
      name: string;
      publicId: string;
      url: string;
      resourceType: string;
      mimeType: string;
      bytes: number | bigint;
      folderId?: string;
    },
  ) {
    const asset = await this.prisma.fileAsset.create({
      data: {
        ...fileData,
        bytes: BigInt(fileData.bytes),
        ownerId,
      },
    });
    return {
      ...asset,
      bytes: asset.bytes.toString(),
    };
  }

  async deleteFile(ownerId: string, id: string) {
    const file = await this.prisma.fileAsset.findFirst({ where: { id, ownerId } });
    if (!file) throw new HttpError(404, 'NOT_FOUND', 'File not found');

    if (this.config.CLOUDINARY_CLOUD_NAME) {
      try {
        await cloudinary.uploader.destroy(file.publicId, {
          resource_type: file.resourceType,
        });
      } catch (err) {
        console.error('[FileService] Cloudinary deletion error:', err);
      }
    }

    return this.prisma.fileAsset.delete({ where: { id } });
  }

  async getStorageUsage(ownerId: string) {
    const files = await this.prisma.fileAsset.findMany({
      where: { ownerId },
      select: { bytes: true },
    });

    const totalBytes = files.reduce((acc: bigint, f: any) => acc + BigInt(f.bytes), 0n);
    return {
      fileCount: files.length,
      totalBytes: totalBytes.toString(),
      totalMegabytes: (Number(totalBytes) / (1024 * 1024)).toFixed(2),
    };
  }
}
