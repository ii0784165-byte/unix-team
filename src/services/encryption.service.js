/**
 * Encryption Service
 * Handles data encryption at rest using AES-256-GCM
 */

const crypto = require('crypto');

class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16;  // 128 bits
    this.tagLength = 16; // 128 bits
    this.saltLength = 64;
    this.iterations = 100000;
    
    // Get encryption key from environment
    this.masterKey = this._deriveKey(process.env.ENCRYPTION_KEY);
  }

  /**
   * Derives a key from password using PBKDF2
   */
  _deriveKey(password, salt = null) {
    if (!salt) {
      salt = crypto.randomBytes(this.saltLength);
    }
    return {
      key: crypto.pbkdf2Sync(password, salt, this.iterations, this.keyLength, 'sha512'),
      salt
    };
  }

  /**
   * Encrypts data using AES-256-GCM
   * @param {string} plaintext - Data to encrypt
   * @returns {string} - Encrypted data in format: salt:iv:tag:ciphertext (base64)
   */
  encrypt(plaintext) {
    if (!plaintext) return null;

    try {
      const salt = crypto.randomBytes(this.saltLength);
      const { key } = this._deriveKey(process.env.ENCRYPTION_KEY, salt);
      const iv = crypto.randomBytes(this.ivLength);
      
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      const tag = cipher.getAuthTag();
      
      // Combine all components
      const combined = Buffer.concat([
        salt,
        iv,
        tag,
        Buffer.from(encrypted, 'base64')
      ]);

      return combined.toString('base64');
    } catch (error) {
      throw new Error('Encryption failed: ' + error.message);
    }
  }

  /**
   * Decrypts data encrypted with encrypt()
   * @param {string} encryptedData - Encrypted data string
   * @returns {string} - Decrypted plaintext
   */
  decrypt(encryptedData) {
    if (!encryptedData) return null;

    try {
      const combined = Buffer.from(encryptedData, 'base64');
      
      // Extract components
      const salt = combined.subarray(0, this.saltLength);
      const iv = combined.subarray(this.saltLength, this.saltLength + this.ivLength);
      const tag = combined.subarray(
        this.saltLength + this.ivLength,
        this.saltLength + this.ivLength + this.tagLength
      );
      const ciphertext = combined.subarray(this.saltLength + this.ivLength + this.tagLength);
      
      const { key } = this._deriveKey(process.env.ENCRYPTION_KEY, salt);
      
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(ciphertext);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      throw new Error('Decryption failed: ' + error.message);
    }
  }

  /**
   * Hashes sensitive data for comparison (one-way)
   * @param {string} data - Data to hash
   * @returns {string} - Hashed data
   */
  hash(data) {
    const salt = crypto.randomBytes(32);
    const hash = crypto.pbkdf2Sync(data, salt, this.iterations, 64, 'sha512');
    return `${salt.toString('base64')}:${hash.toString('base64')}`;
  }

  /**
   * Verifies data against a hash
   * @param {string} data - Data to verify
   * @param {string} hashString - Hash to compare against
   * @returns {boolean}
   */
  verifyHash(data, hashString) {
    try {
      const [saltB64, hashB64] = hashString.split(':');
      const salt = Buffer.from(saltB64, 'base64');
      const originalHash = Buffer.from(hashB64, 'base64');
      
      const hash = crypto.pbkdf2Sync(data, salt, this.iterations, 64, 'sha512');
      
      return crypto.timingSafeEqual(hash, originalHash);
    } catch {
      return false;
    }
  }

  /**
   * Generates a secure random token
   * @param {number} length - Token length in bytes
   * @returns {string} - Random token (hex)
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generates a cryptographically secure UUID
   * @returns {string}
   */
  generateSecureId() {
    return crypto.randomUUID();
  }

  /**
   * Creates a checksum for file integrity verification
   * @param {Buffer} data - File data
   * @returns {string} - SHA-256 checksum
   */
  createChecksum(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Verifies file integrity using checksum
   * @param {Buffer} data - File data
   * @param {string} checksum - Expected checksum
   * @returns {boolean}
   */
  verifyChecksum(data, checksum) {
    const computed = this.createChecksum(data);
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(checksum, 'hex')
    );
  }
}

// Export singleton instance
module.exports = new EncryptionService();
