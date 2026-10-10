import './ControlsHelp.css';

const CONTROLS = '/assets/png/default/ui/controls';

/**
 * The menu's controls reference: the keyboard scheme and the touch scheme
 * (the on-screen buttons from the asset pack).
 */
export function ControlsHelp() {
  return (
    <section className="controls" aria-label="Controls">
      <h2 className="controls__title">Controls</h2>
      <div className="controls__columns">
        <div>
          <h3 className="controls__subtitle">Keyboard</h3>
          <ul className="controls__list">
            <li>
              <span>Thrust</span> <kbd>W</kbd> <kbd>↑</kbd>
            </li>
            <li>
              <span>Turn</span> <kbd>A</kbd> <kbd>D</kbd> <kbd>←</kbd> <kbd>→</kbd>
            </li>
            <li>
              <span>Fire front</span> <kbd>Space</kbd>
            </li>
            <li>
              <span>Broadside</span> <kbd>Q</kbd> <kbd>E</kbd>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="controls__subtitle">Touch</h3>
          <ul className="controls__list controls__list--touch">
            <li>
              <img src={`${CONTROLS}/icon_turn_left.png`} alt="" />
              <span>Turn</span>
              <img src={`${CONTROLS}/icon_turn_right.png`} alt="" />
            </li>
            <li>
              <img src={`${CONTROLS}/icon_forward.png`} alt="" />
              <span>Thrust</span>
            </li>
            <li>
              <img src={`${CONTROLS}/icon_fire_left.png`} alt="" />
              <img src={`${CONTROLS}/icon_fire_front.png`} alt="" />
              <img src={`${CONTROLS}/icon_fire_right.png`} alt="" />
              <span>Fire</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

export default ControlsHelp;
