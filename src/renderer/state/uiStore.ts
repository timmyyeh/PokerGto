import { create } from 'zustand';

type Screen = 'lobby' | 'game' | 'review' | 'gameOver';

type UIState = {
  screen: Screen;
  goto: (s: Screen) => void;
};

export const useUIStore = create<UIState>((set) => ({
  screen: 'lobby',
  goto: (screen) => set({ screen }),
}));
