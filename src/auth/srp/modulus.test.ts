import './uint8array-extensions';
import * as openpgp from 'openpgp';
import { verifyModulus, verifyAndGetModulus } from './modulus';
import { CryptoProxy } from './crypto-proxy';
import { SRP_MODULUS_KEY } from './constants';

describe('modulus verification', () => {
  test('rejects unsigned content', async () => {
    const publicKey = await CryptoProxy.importPublicKey({ armoredKey: SRP_MODULUS_KEY });
    await expect(
      verifyModulus(publicKey, 'not-a-signed-message')
    ).rejects.toThrow('Unable to verify server identity');
  });

  test('rejects content signed with wrong key', async () => {
    const { privateKey: wrongPrivateArmored } = await openpgp.generateKey({
      type: 'rsa',
      rsaBits: 2048,
      userIDs: [{ name: 'Wrong Key' }],
    });
    const wrongPrivateKey = await openpgp.readPrivateKey({
      armoredKey: wrongPrivateArmored,
    });

    // Sign with the wrong key
    const signed = await openpgp.sign({
      message: await openpgp.createCleartextMessage({ text: 'fake-modulus-data' }),
      signingKeys: wrongPrivateKey,
    });

    // Verify with the real SRP key — should fail
    const srpKey = await CryptoProxy.importPublicKey({ armoredKey: SRP_MODULUS_KEY });
    await expect(verifyModulus(srpKey, signed)).rejects.toThrow(
      'Unable to verify server identity'
    );
  }, 20_000);

  test('verifyAndGetModulus rejects invalid input', async () => {
    await expect(verifyAndGetModulus('not-valid-signed-message')).rejects.toThrow();
  });
});
