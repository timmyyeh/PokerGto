import { useEffect } from 'react';
import { useUIStore } from './state/uiStore';
import { useGameStore } from './state/gameStore';
import { Lobby } from './components/Lobby/Lobby';
import { Table } from './components/Table/Table';
import { Review } from './components/Review/Review';
import { GameOver } from './components/GameOver/GameOver';

export default function App() {
  const screen = useUIStore((s) => s.screen);
  const goto = useUIStore((s) => s.goto);
  const tournamentFinish = useGameStore((s) => s.tournamentFinish);

  // Auto-navigate to game-over screen when tournament ends.
  useEffect(() => {
    if (tournamentFinish !== null && screen !== 'gameOver') {
      goto('gameOver');
    }
  }, [tournamentFinish, screen, goto]);

  return (
    <div className="h-full w-full bg-felt-900 text-white overflow-hidden">
      {screen === 'lobby' && <Lobby />}
      {screen === 'game' && <Table />}
      {screen === 'review' && <Review />}
      {screen === 'gameOver' && <GameOver />}
    </div>
  );
}
