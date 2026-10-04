import { google } from 'googleapis';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

export class GoogleDriveClient {
  private readonly drive;

  constructor(keyFilePath: string) {
    const auth = new google.auth.GoogleAuth({
      keyFile: keyFilePath,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    this.drive = google.drive({ version: 'v3', auth });
  }

  async listFilesInFolder(folderId: string): Promise<DriveFile[]> {
    const res = await this.drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id,name,mimeType)',
      pageSize: 1000,
    });
    return (res.data.files ?? []) as DriveFile[];
  }

  async downloadFile(fileId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const meta = await this.drive.files.get({ fileId, fields: 'mimeType' });
    const contentType = meta.data.mimeType ?? 'application/octet-stream';
    const res = await this.drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' },
    );
    return { buffer: Buffer.from(res.data as ArrayBuffer), contentType };
  }

  static fileViewUrl(fileId: string): string {
    return `https://drive.google.com/file/d/${fileId}/view`;
  }

  static extractFileId(url: string): string | null {
    const m = /\/d\/([a-zA-Z0-9_-]{20,})/u.exec(url);
    return m?.[1] ?? null;
  }

  static isGoogleDriveUrl(url: string): boolean {
    return url.includes('drive.google.com');
  }
}
