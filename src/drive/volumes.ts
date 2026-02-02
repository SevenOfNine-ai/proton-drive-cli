import { DriveApiClient } from '../api/drive';
import { Volume, Share } from '../types/drive';

/**
 * VolumeManager handles volume and share operations
 */
export class VolumeManager {
  constructor(private driveApi: DriveApiClient) {}

  /**
   * Get all user volumes
   */
  async getVolumes(): Promise<Volume[]> {
    return await this.driveApi.listVolumes();
  }

  /**
   * Get main (default) volume
   * The first volume is typically the user's main Drive storage
   */
  async getMainVolume(): Promise<Volume> {
    const volumes = await this.getVolumes();
    if (volumes.length === 0) {
      throw new Error('No volumes found for user');
    }
    return volumes[0];
  }

  /**
   * Get a specific volume by ID
   */
  async getVolume(volumeId: string): Promise<Volume> {
    return await this.driveApi.getVolume(volumeId);
  }

  /**
   * Get share by ID
   * Returns the share bootstrap data including encryption keys
   */
  async getShare(shareId: string): Promise<Share> {
    return await this.driveApi.getShare(shareId);
  }

  /**
   * Get the root share for a volume
   */
  async getRootShare(volumeId: string): Promise<Share> {
    const volume = await this.getVolume(volumeId);
    return await this.getShare(volume.Share.ShareID);
  }

  /**
   * Get the main volume's root share
   * This is the most common entry point for Drive operations
   */
  async getMainShare(): Promise<Share> {
    const mainVolume = await this.getMainVolume();
    return await this.getShare(mainVolume.Share.ShareID);
  }
}
