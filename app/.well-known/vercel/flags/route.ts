import { getProviderData, createFlagsDiscoveryEndpoint } from 'flags/next';
import * as flags from '@/flags';

// Flags Discovery Endpoint — lets the Vercel dashboard Flags tab + Flags
// Explorer find this app's feature flags (authenticated with FLAGS_SECRET).
export const GET = createFlagsDiscoveryEndpoint(() => getProviderData(flags));
