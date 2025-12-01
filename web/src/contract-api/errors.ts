import { decodeErrorResult } from 'viem';
import type { ContractError } from './types';

/**
 * Decode contract revert with ABI-aware error resolution
 */
export function decodeContractError(error: any, abi: any): ContractError {
  try {
    // Try to decode custom error
    if (error.data) {
      const decodedError = decodeErrorResult({
        abi,
        data: error.data,
      });

      return {
        message: `Contract Error: ${decodedError.errorName}`,
        code: decodedError.errorName,
        rawError: decodedError.args,
      };
    }

    // Extract revert reason
    if (error.message) {
      const revertMatch = error.message.match(/reverted with reason string ['"](.+)['"]/);
      if (revertMatch) {
        return {
          message: `Revert: ${revertMatch[1]}`,
          rawError: error,
        };
      }

      const customErrorMatch = error.message.match(/reverted with custom error ['"](.+)['"]/);
      if (customErrorMatch) {
        return {
          message: `Error: ${customErrorMatch[1]}`,
          code: customErrorMatch[1],
          rawError: error,
        };
      }

      // Handle user rejection
      if (error.message.includes('User rejected') || error.message.includes('user rejected')) {
        return {
          message: 'Transaction rejected by user',
          code: 'USER_REJECTED',
          rawError: error,
        };
      }

      return {
        message: error.message,
        rawError: error,
      };
    }

    return {
      message: 'Unknown contract error',
      rawError: error,
    };
  } catch (e) {
    return {
      message: error.message || 'Failed to decode contract error',
      rawError: error,
    };
  }
}
