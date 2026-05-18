import type { PokerCoachAPI } from '../preload/index';

declare global {
  interface Window {
    pokerCoach: PokerCoachAPI;
  }
}
