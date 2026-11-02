import { useSyncExternalStore } from 'react';
import { getDownloadSnapshot, subscribeDownloads } from '../services/downloadManager';

export function useDownloads() {
  return useSyncExternalStore(subscribeDownloads, getDownloadSnapshot, getDownloadSnapshot);
}
