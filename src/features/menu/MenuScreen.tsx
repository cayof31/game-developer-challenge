import { Button } from '../../components/Button';
import { Tabs } from '../../components/Tabs';
import ControlsHelp from './ControlsHelp';
import './MenuScreen.css';

const TITLE_SPRITE = '/assets/png/default/ui/menu/title_pirate_battle.png';

interface MenuScreenProps {
  onPlay: () => void;
  onOptions: () => void;
}

/**
 * Main menu: title art, Play and Options (native buttons, so keyboard
 * navigation and the visible focus ring come for free), the controls
 * reference and the Ranking / Match History tabs — the tab content is a
 * placeholder until the API step fills it.
 */
export function MenuScreen({ onPlay, onOptions }: MenuScreenProps) {
  return (
    <main className="screen">
      <div className="panel menu">
        <h1>
          <img src={TITLE_SPRITE} alt="Pirate Battle" />
        </h1>
        <div className="menu__actions">
          <Button variant="primary" onClick={onPlay}>
            Play
          </Button>
          <Button variant="secondary" onClick={onOptions}>
            Options
          </Button>
        </div>
        <ControlsHelp />
        <Tabs
          tabs={[
            {
              id: 'ranking',
              label: 'Ranking',
              content: <p className="menu__placeholder">Ranking will load from the API.</p>,
            },
            {
              id: 'history',
              label: 'Match History',
              content: <p className="menu__placeholder">Match history will load from the API.</p>,
            },
          ]}
        />
      </div>
    </main>
  );
}

export default MenuScreen;
