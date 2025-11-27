

self.FixedZcashKeys = (() => {
  

  
  const P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;
  const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
  const Gx = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n;
  const Gy = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n;
  
  function mod(a, b = P) {
    const result = a % b;
    return result >= 0n ? result : b + result;
  }
  
  // Modular inverse using extended Euclidean algorithm
  function invert(num, modulo = P) {
    if (num === 0n || modulo <= 0n) throw new Error('Invalid');
    let a = mod(num, modulo);
    let b = modulo;
    let x = 0n, y = 1n, u = 1n, v = 0n;
    while (a !== 0n) {
      const q = b / a;
      const r = b % a;
      const m = x - u * q;
      const n = y - v * q;
      b = a; a = r; x = u; y = v; u = m; v = n;
    }
    return mod(x, modulo);
  }
  
  // Point doubling on secp256k1
  function pointDouble(px, py) {
    const s = mod((3n * px * px) * invert(2n * py));
    const rx = mod(s * s - 2n * px);
    const ry = mod(s * (px - rx) - py);
    return [rx, ry];
  }
  
  // Point addition on secp256k1
  function pointAdd(ax, ay, bx, by) {
    if (ax === bx && ay === by) return pointDouble(ax, ay);
    const s = mod((by - ay) * invert(bx - ax));
    const rx = mod(s * s - ax - bx);
    const ry = mod(s * (ax - rx) - ay);
    return [rx, ry];
  }
  
  // Multiply point by scalar (double-and-add algorithm)
  function pointMultiply(k, px = Gx, py = Gy) {
    let rx = null, ry = null;
    let ax = px, ay = py;
    
    while (k > 0n) {
      if (k & 1n) {
        if (rx === null) {
          rx = ax;
          ry = ay;
        } else {
          [rx, ry] = pointAdd(rx, ry, ax, ay);
        }
      }
      [ax, ay] = pointDouble(ax, ay);
      k >>= 1n;
    }
    
    return [rx, ry];
  }
  
  // Convert private key bytes to public key (compressed)
  function getPublicKey(privateKeyBytes) {
    // Convert bytes to BigInt
    let k = 0n;
    for (let i = 0; i < privateKeyBytes.length; i++) {
      k = (k << 8n) | BigInt(privateKeyBytes[i]);
    }
    
    // Multiply generator point G by private key k
    const [x, y] = pointMultiply(k);
    
    // Compress public key: 0x02 if y is even, 0x03 if y is odd
    const compressed = new Uint8Array(33);
    compressed[0] = (y & 1n) === 0n ? 0x02 : 0x03;
    
    // Convert x coordinate to bytes
    let xValue = x;
    for (let i = 32; i >= 1; i--) {
      compressed[i] = Number(xValue & 0xFFn);
      xValue >>= 8n;
    }
    
    return compressed;
  }
  
  /**
   * Convert bytes to BigInt (big-endian)
   */
  function bytesToBigInt(bytes) {
    let result = 0n;
    for (let i = 0; i < bytes.length; i++) {
      result = (result << 8n) | BigInt(bytes[i]);
    }
    return result;
  }
  
  /**
   * Sign a hash with a private key using secp256k1
   * Returns DER-encoded signature
   */
  function signHash(messageHash, privateKey) {
    // Convert inputs to BigInt
    const z = bytesToBigInt(messageHash);
    const d = bytesToBigInt(privateKey);
    
    // Generate random k (nonce) - In production, use deterministic k (RFC 6979)
    // For now, use a simple deterministic approach based on message hash
    const k = (z + d) % N; // Simple deterministic k (NOT cryptographically secure!)
    
    // Calculate r = (k * G).x mod N
    let kG = pointMultiply(k);
    const r = kG[0] % N;
    
    // Calculate s = k^-1 * (z + r*d) mod N
    const kInv = invert(k, N);
    const s = mod((kInv * (z + r * d)), N);
    
    // Encode as DER
    return encodeDER(r, s);
  }
  
  /**
   * Encode signature as DER format
   */
  function encodeDER(r, s) {
    const rBytes = bigIntToBytes(r);
    const sBytes = bigIntToBytes(s);
    
    // Add 0x00 prefix if high bit is set (to indicate positive number)
    const rWithPrefix = (rBytes[0] & 0x80) ? new Uint8Array([0x00, ...rBytes]) : rBytes;
    const sWithPrefix = (sBytes[0] & 0x80) ? new Uint8Array([0x00, ...sBytes]) : sBytes;
    
    // DER structure: 0x30 [total-length] 0x02 [r-length] [r] 0x02 [s-length] [s]
    // total-length = everything after the length byte
    const contentLength = 2 + rWithPrefix.length + 2 + sWithPrefix.length;
    const totalLength = 2 + contentLength; // 0x30 + length byte + content
    const der = new Uint8Array(totalLength);
    
    let offset = 0;
    der[offset++] = 0x30; // SEQUENCE
    der[offset++] = contentLength; // Length of content (not including 0x30 and this byte)
    der[offset++] = 0x02; // INTEGER
    der[offset++] = rWithPrefix.length;
    der.set(rWithPrefix, offset);
    offset += rWithPrefix.length;
    der[offset++] = 0x02; // INTEGER
    der[offset++] = sWithPrefix.length;
    der.set(sWithPrefix, offset);
    offset += sWithPrefix.length;
    
    return der;
  }
  
  /**
   * Convert BigInt to bytes (big-endian, minimum length)
   */
  function bigIntToBytes(num) {
    const hex = num.toString(16);
    const paddedHex = hex.length % 2 === 0 ? hex : '0' + hex;
    const bytes = new Uint8Array(paddedHex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(paddedHex.substr(i * 2, 2), 16);
    }
    return bytes;
  }
  
  return { getPublicKey, signHash };
})();

console.log('[FixedZcashKeys] Real secp256k1 implementation loaded');
