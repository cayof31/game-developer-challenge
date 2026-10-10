import { useState } from 'react';
import { MatchScreen } from './features/match/MatchScreen';
import { MenuScreen } from './features/menu/MenuScreen';
import { OptionsScreen } from './features/options/OptionsScreen';
import { loadLastResult } from './features/result/lastResultStorage';
import { ResultScreen } from './features/result/ResultScreen';

/** Which screen the app is showing; one simple state, no router needed. */
type Screen = 'menu' | 'options' | 'match' | 'result';

function App() {
  // A stored result reopens the Result screen: that is how the last
  // completed match persists across a refresh.
  const [screen, setScreen] = useState<Screen>(() => (loadLastResult() ? 'result' : 'menu'));

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
