import { flag } from 'flags/next';
import { get as edgeGet } from '@vercel/edge-config';

/** Vercel feature flag: show the per-user chat-history sidebar.
 *  Base value is read from the Edge Config `chatHistory` key (toggle it live
 *  in the dashboard, no redeploy); the Flags Explorer can also override it per
 *  session. Appears in the project's Flags tab via the discovery endpoint. */
export const chatHistoryFlag = flag<boolean>({
  key: 'chatHistory',
  description: 'Show the chat-history sidebar (saved conversations per user).',
  defaultValue: true,
  async decide() {
    try {
      if (process.env.EDGE_CONFIG) {
        const v = await edgeGet<boolean>('chatHistory');
        if (typeof v === 'boolean') return v;
      }
    } catch {
      /* fall back to default */
    }
    return true;
  },
});
