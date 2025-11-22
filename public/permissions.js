/**
 * Zync Wallet Permission System
 * Manages dApp permissions and access control
 */

const STORAGE_KEY = 'dapp_permissions';

/**
 * Permission structure:
 * {
 *   'https://example.com': {
 *     granted: true,
 *     timestamp: 1234567890000,
 *     address: 't1...',
 *     permissions: ['connect', 'getBalance', 'sendZec'],
 *     metadata: {
 *       title: 'Example dApp',
 *       favicon: 'https://example.com/favicon.ico'
 *     }
 *   }
 * }
 */

// Available permission types
const PERMISSION_TYPES = {
  // Read permissions
  CONNECT: 'connect',
  GET_ADDRESS: 'getAddress',
  GET_PUBLIC_KEY: 'getPublicKey',
  GET_NETWORK: 'getNetwork',
  GET_BALANCE: 'getBalance',
  
  // Write permissions (require user approval each time)
  SEND_ZEC: 'sendZec',
  DEPLOY_ZRC20: 'deployZrc20',
  MINT_ZRC20: 'mintZrc20',
  TRANSFER_ZRC20: 'transferZrc20',
  DEPLOY_COLLECTION: 'deployCollection',
  MINT_NFT: 'mintNft',
  INSCRIBE: 'inscribe'
};

// Permissions that require approval for each transaction
const TRANSACTIONAL_PERMISSIONS = new Set([
  PERMISSION_TYPES.SEND_ZEC,
  PERMISSION_TYPES.DEPLOY_ZRC20,
  PERMISSION_TYPES.MINT_ZRC20,
  PERMISSION_TYPES.TRANSFER_ZRC20,
  PERMISSION_TYPES.DEPLOY_COLLECTION,
  PERMISSION_TYPES.MINT_NFT,
  PERMISSION_TYPES.INSCRIBE
]);

// Read-only permissions (granted once)
const READ_ONLY_PERMISSIONS = new Set([
  PERMISSION_TYPES.CONNECT,
  PERMISSION_TYPES.GET_ADDRESS,
  PERMISSION_TYPES.GET_PUBLIC_KEY,
  PERMISSION_TYPES.GET_NETWORK,
  PERMISSION_TYPES.GET_BALANCE
]);

/**
 * Load all permissions from storage
 */
async function loadPermissions() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || {};
  } catch (error) {
    console.error('[Permissions] Failed to load:', error);
    return {};
  }
}

/**
 * Save permissions to storage
 */
async function savePermissions(permissions) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: permissions });
    return true;
  } catch (error) {
    console.error('[Permissions] Failed to save:', error);
    return false;
  }
}

/**
 * Check if origin has permission
 */
async function hasPermission(origin, permission) {
  const permissions = await loadPermissions();
  const sitePermissions = permissions[origin];
  
  if (!sitePermissions || !sitePermissions.granted) {
    return false;
  }
  
  // Check if specific permission is granted
  if (READ_ONLY_PERMISSIONS.has(permission)) {
    return sitePermissions.permissions.includes(permission);
  }
  
  // Transactional permissions always require explicit approval
  return false;
}

/**
 * Check if origin is connected
 */
async function isConnected(origin) {
  const permissions = await loadPermissions();
  const sitePermissions = permissions[origin];
  return sitePermissions && sitePermissions.granted;
}

/**
 * Grant permission to origin
 */
async function grantPermission(origin, address, metadata = {}) {
  const permissions = await loadPermissions();
  
  // Grant default read-only permissions
  permissions[origin] = {
    granted: true,
    timestamp: Date.now(),
    address,
    permissions: [
      PERMISSION_TYPES.CONNECT,
      PERMISSION_TYPES.GET_ADDRESS,
      PERMISSION_TYPES.GET_PUBLIC_KEY,
      PERMISSION_TYPES.GET_NETWORK,
      PERMISSION_TYPES.GET_BALANCE
    ],
    metadata: {
      title: metadata.title || origin,
      favicon: metadata.favicon || `${origin}/favicon.ico`,
      url: metadata.url || origin
    }
  };
  
  await savePermissions(permissions);
  console.log('[Permissions] Granted to:', origin);
  return true;
}

/**
 * Revoke permission from origin
 */
async function revokePermission(origin) {
  const permissions = await loadPermissions();
  
  if (permissions[origin]) {
    delete permissions[origin];
    await savePermissions(permissions);
    console.log('[Permissions] Revoked from:', origin);
    return true;
  }
  
  return false;
}

/**
 * Revoke all permissions
 */
async function revokeAllPermissions() {
  await savePermissions({});
  console.log('[Permissions] All permissions revoked');
  return true;
}

/**
 * List all granted permissions
 */
async function listPermissions() {
  const permissions = await loadPermissions();
  return Object.entries(permissions).map(([origin, data]) => ({
    origin,
    ...data
  }));
}

/**
 * Get permission for specific origin
 */
async function getPermission(origin) {
  const permissions = await loadPermissions();
  return permissions[origin] || null;
}

/**
 * Update metadata for origin
 */
async function updateMetadata(origin, metadata) {
  const permissions = await loadPermissions();
  
  if (permissions[origin]) {
    permissions[origin].metadata = {
      ...permissions[origin].metadata,
      ...metadata
    };
    await savePermissions(permissions);
    return true;
  }
  
  return false;
}

/**
 * Check if permission type requires transaction approval
 */
function requiresTransactionApproval(permission) {
  return TRANSACTIONAL_PERMISSIONS.has(permission);
}

/**
 * Check if permission type is read-only
 */
function isReadOnlyPermission(permission) {
  return READ_ONLY_PERMISSIONS.has(permission);
}

// Export functions
if (typeof self !== 'undefined' && self.PermissionManager === undefined) {
  self.PermissionManager = {
    PERMISSION_TYPES,
    loadPermissions,
    savePermissions,
    hasPermission,
    isConnected,
    grantPermission,
    revokePermission,
    revokeAllPermissions,
    listPermissions,
    getPermission,
    updateMetadata,
    requiresTransactionApproval,
    isReadOnlyPermission
  };
}

console.log('[Permissions] Module loaded');
