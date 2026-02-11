/**
 * Account adapter for the Proton Drive SDK.
 *
 * Implements ProtonDriveAccount by wrapping DriveCryptoService which already
 * decrypts and caches all user/address keys during initialize().
 */

import type {
  ProtonDriveAccount,
  ProtonDriveAccountAddress,
} from '@protontech/drive-sdk';
import { DriveCryptoService } from '../crypto/drive-crypto';

// PublicKey is not re-exported from SDK top-level; define compatible alias
type PublicKey = { readonly _idx: any };

export class AccountAdapter implements ProtonDriveAccount {
  constructor(private driveCrypto: DriveCryptoService) {}

  async getOwnPrimaryAddress(): Promise<ProtonDriveAccountAddress> {
    const addressId = this.driveCrypto.getPrimaryAddressId();
    if (!addressId) {
      throw new Error('No primary address found');
    }
    return this.buildAddress(addressId);
  }

  async getOwnAddresses(): Promise<ProtonDriveAccountAddress[]> {
    const addressesMap = this.driveCrypto.getAddressesMap();
    const keysMap = this.driveCrypto.getAddressKeysMap();
    const result: ProtonDriveAccountAddress[] = [];

    for (const [id, address] of addressesMap.entries()) {
      const keys = keysMap.get(id);
      if (!keys || keys.length === 0) continue;

      result.push({
        email: address.Email,
        addressId: id,
        primaryKeyIndex: 0,
        keys: keys.map((key, idx) => ({
          id: address.Keys[idx]?.ID || `key-${idx}`,
          key: key as any,
        })),
      });
    }

    if (result.length === 0) {
      throw new Error('No addresses with decrypted keys found');
    }

    return result;
  }

  async getOwnAddress(emailOrAddressId: string): Promise<ProtonDriveAccountAddress> {
    const addressesMap = this.driveCrypto.getAddressesMap();

    // Try by address ID first
    if (addressesMap.has(emailOrAddressId)) {
      return this.buildAddress(emailOrAddressId);
    }

    // Try by email
    for (const [id, address] of addressesMap.entries()) {
      if (address.Email.toLowerCase() === emailOrAddressId.toLowerCase()) {
        return this.buildAddress(id);
      }
    }

    throw new Error(`No address found for: ${emailOrAddressId}`);
  }

  async hasProtonAccount(_email: string): Promise<boolean> {
    // For Git LFS bridge, we don't need sharing functionality.
    // Return false as a safe default.
    return false;
  }

  async getPublicKeys(_email: string): Promise<PublicKey[]> {
    // For Git LFS bridge, we don't need public key lookups for sharing.
    // Return empty array as a safe default.
    return [];
  }

  private buildAddress(addressId: string): ProtonDriveAccountAddress {
    const addressesMap = this.driveCrypto.getAddressesMap();
    const keysMap = this.driveCrypto.getAddressKeysMap();

    const address = addressesMap.get(addressId);
    if (!address) {
      throw new Error(`Address not found: ${addressId}`);
    }

    const keys = keysMap.get(addressId);
    if (!keys || keys.length === 0) {
      throw new Error(`No decrypted keys for address: ${addressId}`);
    }

    return {
      email: address.Email,
      addressId,
      primaryKeyIndex: 0,
      keys: keys.map((key, idx) => ({
        id: address.Keys[idx]?.ID || `key-${idx}`,
        key: key as any,
      })),
    };
  }
}
