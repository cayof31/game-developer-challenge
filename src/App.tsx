import { useEffect, useState } from 'react';
import { usePendingSync } from './api/hooks/usePendingSync';
import { MatchScreen } from './features/match/MatchScreen';
import { MenuScreen } from './features/menu/MenuScreen';
import { OptionsScreen } from './features/options/OptionsScreen';
import { loadLastResult } from './features/result/lastResultStorage';
import { ResultScreen } from './features/result/ResultScreen';

type Screen = 'menu' | 'options' | 'match' | 'result';

const SCREEN_KEY = 'pirate-battle/screen@1';

/**
 * A refresh reopens the Result screen only if the player was on it.
 * From the menu, options or a match (abandoned, never registered) it
 * lands on the menu. The stored result itself always persists.
 */
function initialScreen(): Screen {
  try {
    if (sessionStorage.getItem(SCREEN_KEY) === 'result' && loadLastResult()) {
      return 'result';
    }
  } catch {
    // storage unavailable: fall through to the menu
  }
  return 'menu';
}

function App() {
  usePendingSync();

  const [screen, setScreen] = useState<Screen>(initialScreen);

  useEffect(() => {
    try {
      sessionStorage.setItem(SCREEN_KEY, screen);
    } catch {
      // ignore: the screen just won't survive a refresh
    }
  }, [screen]);

  switch (screen) {
    case 'options':
      return <OptionsScreen onBack={() => setScreen('menu')} />;
    case 'match':
      // Match end navigates to 'result'; Main Menu goes back to 'menu'.
      return (
        <MatchScreen onExit={() => setScreen('menu')} onFinish={() => setScreen('result')} />
      );
    case 'result':
      return (
        <ResultScreen
          onPlayAgain={() => setScreen('match')}
          onMainMenu={() => setScreen('menu')}
        />
      );
    case 'menu':
      return <MenuScreen onPlay={() => setScreen('match')} onOptions={() => setScreen('options')} />;
  }
}

export default App;
